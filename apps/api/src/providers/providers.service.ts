import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Provider } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialsService } from "../credentials/credentials.service";
import { TenantVisibilityService } from "../tenants/tenant-visibility.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { commercialId } from "../tenants/tenant-context.service";
import {
  NO_RULES,
  applyPrice,
  brandDiscountAppliesToClient,
  normalizeBrandName,
  toProductView,
  toSheetView,
  type OfferRules,
} from "./catalog-view";
import { ProviderRegistry } from "./provider-registry";
import type { NormalizedProduct } from "./types";
import { UpdateProviderConfigDto } from "./dto/update-config.dto";

/** Lo que pertenece a la oferta de una organización y no a la ficha del producto. */
const OFFER_FIELDS = new Set([
  "price",
  "finalPrice",
  "currency",
  "ivaPercent",
  "stock",
  "stockStatus",
]);

@Injectable()
export class ProvidersService {
  private readonly logger = new Logger(ProvidersService.name);
  private readonly enrichRunning = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly registry: ProviderRegistry,
    private readonly visibility: TenantVisibilityService
  ) {}

  async getConfig(tenantId: string, provider: Provider) {
    const config = await this.prisma.providerSyncConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    return config ?? this.defaultConfig(tenantId, provider);
  }

  private defaultConfig(tenantId: string, provider: Provider) {
    return {
      id: null,
      tenantId,
      provider,
      enabled: false,
      syncIntervalMinutes: 60,
      missingProductAction: "KEEP" as const,
      zeroStockAction: "KEEP" as const,
      priceMarkupPercent: 0,
      minStockThreshold: 0,
      lastSyncedAt: null,
      lastSyncError: null,
      lastSyncCreated: 0,
      lastSyncUpdated: 0,
    };
  }

  async updateConfig(tenantId: string, provider: Provider, dto: UpdateProviderConfigDto) {
    await this.visibility.assertLinked(tenantId, provider);
    return this.prisma.providerSyncConfig.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, ...dto },
      update: { ...dto },
    });
  }

  async sync(tenantId: string, provider: Provider) {
    await this.visibility.assertLinked(tenantId, provider);
    const adapter = this.registry.get(provider);
    if (!adapter) {
      throw new BadRequestException(
        `Todavía no hay integración real para ${provider}. Implementados: ${this.registry.implemented.join(", ")}`
      );
    }

    const stored = await this.credentials.findByProvider(tenantId, provider);
    if (!stored && !adapter.publicCatalog) {
      throw new NotFoundException(`No hay credenciales guardadas para ${provider}`);
    }

    const credentials = stored ? (JSON.parse(stored.credentialsJson) as Record<string, string>) : {};
    const syncedExternalIds: string[] = [];

    const result = await this.runSync(tenantId, provider, async (onPage) => {
      await adapter.syncAll(credentials, async (items) => {
        syncedExternalIds.push(...items.map((i) => i.externalId));
        await onPage(items);
      });
    });

    // Enriquecimiento lento (ej. scrapear ficha por producto) — no bloquea
    // la respuesta de este sync ni el próximo, corre solo en background y
    // se salta si ya hay uno corriendo para este proveedor+organización.
    if (adapter.enrichDetails) {
      const key = `${tenantId}:${provider}`;
      if (!this.enrichRunning.has(key)) {
        this.enrichRunning.add(key);
        adapter
          .enrichDetails(credentials, syncedExternalIds, async (externalId, patch) => {
            await this.patchProduct(tenantId, provider, externalId, patch);
          })
          .catch((err) => this.logger.warn(`Enriquecimiento de detalle ${provider} falló: ${errorMessage(err)}`))
          .finally(() => this.enrichRunning.delete(key));
      }
    }

    return result;
  }

  /**
   * Actualiza solo los campos presentes en `patch` para un producto ya sincronizado
   * — no toca el resto ni dispara historial de precio.
   *
   * El enriquecimiento trae de todo mezclado: datos de la ficha (descripción, fotos)
   * y datos de la oferta (stock, precio), así que hay que repartirlo.
   */
  private async patchProduct(
    tenantId: string,
    provider: Provider,
    externalId: string,
    patch: Record<string, unknown>
  ) {
    const ficha: Record<string, unknown> = {};
    const oferta: Record<string, unknown> = {};
    for (const [campo, valor] of Object.entries(patch)) {
      if (OFFER_FIELDS.has(campo)) oferta[campo] = valor;
      else ficha[campo] = valor;
    }

    // "Disponible (tienda)" es una señal genérica — si ya había algo más
    // específico (ej. "Stock Bajo" del Excel de Invid), no lo pisamos.
    // "Sin stock (tienda)" sí es una corrección real, siempre se aplica.
    if (oferta.stockStatus === "Disponible (tienda)") {
      const current = await this.prisma.tenantProductOffer.findUnique({
        where: { tenantId_provider_externalId: { tenantId, provider, externalId } },
        select: { stockStatus: true },
      });
      if (current?.stockStatus) delete oferta.stockStatus;
    }

    // Si el producto se borró entre medio, el enriquecimiento no tiene que romperse.
    if (Object.keys(ficha).length) {
      await this.prisma.providerSyncCache
        .updateMany({ where: { provider, externalId }, data: ficha })
        .catch(() => undefined);
    }
    if (Object.keys(oferta).length) {
      await this.prisma.tenantProductOffer
        .updateMany({ where: { tenantId, provider, externalId }, data: oferta })
        .catch(() => undefined);
    }
  }

  /** Igual que sync(), pero la fuente de productos es un archivo Excel/CSV subido a mano en vez de la API del proveedor. */
  async importFromRows(tenantId: string, provider: Provider, items: NormalizedProduct[]) {
    await this.visibility.assertLinked(tenantId, provider);
    return this.runSync(tenantId, provider, async (onPage) => {
      await onPage(items);
    });
  }

  private async runSync(
    tenantId: string,
    provider: Provider,
    run: (onPage: (items: NormalizedProduct[]) => Promise<void>) => Promise<void>
  ) {
    const config = await this.getConfig(tenantId, provider);
    const minStock = config.minStockThreshold || 0;

    const totalBefore = await this.prisma.tenantProductOffer.count({ where: { tenantId, provider } });

    const syncStartedAt = new Date();
    let count = 0;

    try {
      await run(async (items) => {
        count += items.length;
        await this.upsertPage(tenantId, provider, items);
      });
    } catch (err) {
      await this.prisma.providerSyncConfig.upsert({
        where: { tenantId_provider: { tenantId, provider } },
        create: { tenantId, provider, lastSyncError: errorMessage(err) },
        update: { lastSyncError: errorMessage(err) },
      });
      throw err;
    }

    const missingCount = await this.applyMissingProductAction(
      tenantId,
      provider,
      syncStartedAt,
      config.missingProductAction
    );
    const zeroStockCount = await this.applyZeroStockAction(
      tenantId,
      provider,
      syncStartedAt,
      config.zeroStockAction,
      minStock
    );

    const totalAfter = await this.prisma.tenantProductOffer.count({ where: { tenantId, provider } });
    const created = Math.max(0, totalAfter - totalBefore);
    const updated = Math.max(0, count - created);

    await this.prisma.providerSyncConfig.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, lastSyncedAt: new Date(), lastSyncError: null, lastSyncCreated: created, lastSyncUpdated: updated },
      update: { lastSyncedAt: new Date(), lastSyncError: null, lastSyncCreated: created, lastSyncUpdated: updated },
    });

    this.logger.log(
      `Sync de ${provider}: ${count} productos (creados: ${created}, actualizados: ${updated}, ` +
        `faltantes afectados: ${missingCount}, stock cero afectados: ${zeroStockCount})`
    );
    return { provider, synced: count, created, updated, missingAffected: missingCount, zeroStockAffected: zeroStockCount };
  }

  /**
   * Productos que esta organización tenía para este proveedor pero no vinieron en la
   * última sincronización. Solo se tocan sus ofertas: la ficha es de todos.
   */
  private async applyMissingProductAction(
    tenantId: string,
    provider: Provider,
    syncStartedAt: Date,
    action: string
  ) {
    if (action === "KEEP") return 0;
    const where = { tenantId, provider, syncedAt: { lt: syncStartedAt } };
    if (action === "DELETE") {
      const res = await this.prisma.tenantProductOffer.deleteMany({ where });
      return res.count;
    }
    if (action === "HIDE") {
      const res = await this.prisma.tenantProductOffer.updateMany({ where, data: { active: false } });
      return res.count;
    }
    if (action === "OUT_OF_STOCK") {
      const res = await this.prisma.tenantProductOffer.updateMany({ where, data: { stock: 0 } });
      return res.count;
    }
    return 0;
  }

  /** Productos que sí vinieron pero quedaron en cero, o por debajo del mínimo vendible. */
  private async applyZeroStockAction(
    tenantId: string,
    provider: Provider,
    syncStartedAt: Date,
    action: string,
    minStock: number
  ) {
    if (action === "KEEP") return 0;
    const where = {
      tenantId,
      provider,
      syncedAt: { gte: syncStartedAt },
      stock: { lte: Math.max(minStock, 0) },
    };
    if (action === "DELETE") {
      const res = await this.prisma.tenantProductOffer.deleteMany({ where });
      return res.count;
    }
    if (action === "HIDE") {
      const res = await this.prisma.tenantProductOffer.updateMany({ where, data: { active: false } });
      return res.count;
    }
    return 0;
  }

  /**
   * Guarda una tanda de productos: la ficha (igual para todos) y la oferta de esta
   * organización (lo que le cuesta y cuánto hay).
   *
   * Los precios se guardan **crudos**, tal como los devolvió el proveedor. El markup
   * y el umbral de stock se aplican al leer, así cambiarlos no obliga a
   * resincronizar y la configuración de un comercio no puede alterar la de otro.
   */
  private async upsertPage(tenantId: string, provider: Provider, items: NormalizedProduct[]) {
    // Historial de precio: se compara contra el precio guardado antes de
    // pisarlo, y solo se graba una fila nueva si realmente cambió (o es un
    // producto nuevo) — evita llenar la tabla con una fila idéntica cada vez
    // que corre el cron sin que haya habido ninguna variación real.
    const existing = await this.prisma.tenantProductOffer.findMany({
      where: { tenantId, provider, externalId: { in: items.map((i) => i.externalId) } },
      select: { externalId: true, price: true, finalPrice: true },
    });
    const previousByExternalId = new Map(existing.map((e) => [e.externalId, e]));
    const historyRows: {
      tenantId: string;
      provider: string;
      externalId: string;
      price: number | undefined;
      finalPrice: number | undefined;
      currency: string | undefined;
    }[] = [];

    // Algunos adapters (ej. Air) traen el catálogo entero en una sola tanda
    // en vez de paginado — sin este chunking, un Promise.all de miles de
    // upserts satura el pool de conexiones de Postgres (33 conexiones) y
    // todo el sync falla con timeout. Se procesa de a tandas chicas.
    const CHUNK_SIZE = 25;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (item) => {
          const ficha = {
            sku: item.sku,
            partNumber: item.partNumber,
            ean: item.ean,
            name: item.name,
            brand: item.brand,
            category: item.category,
            subcategory: item.subcategory,
            description: item.description,
            longDescription: item.longDescription,
            imageUrl: item.imageUrl,
            productUrl: item.productUrl,
            locationAir: item.locationAir,
            warranty: item.warranty,
            weight: item.weight,
            weightUnit: item.weightUnit,
            height: item.height,
            width: item.width,
            length: item.length,
            dimensionsUnit: item.dimensionsUnit,
            volume: item.volume,
            tags: item.tags,
            raw: item.raw as object,
          };

          const oferta = {
            price: item.price,
            finalPrice: item.finalPrice,
            currency: item.currency,
            ivaPercent: item.ivaPercent,
            stock: item.stock,
            stockStatus: item.stockStatus,
            active: true,
            needsResync: false,
          };

          const previous = previousByExternalId.get(item.externalId);
          const priceChanged =
            !previous ||
            numberOrNull(previous.price) !== numberOrNull(oferta.price) ||
            numberOrNull(previous.finalPrice) !== numberOrNull(oferta.finalPrice);
          if (priceChanged && (oferta.price != null || oferta.finalPrice != null)) {
            historyRows.push({
              tenantId,
              provider,
              externalId: item.externalId,
              price: oferta.price,
              finalPrice: oferta.finalPrice,
              currency: oferta.currency,
            });
          }

          // La ficha tiene que existir antes que la oferta: la oferta la referencia.
          await this.prisma.providerSyncCache.upsert({
            where: { provider_externalId: { provider, externalId: item.externalId } },
            create: { provider, externalId: item.externalId, ...ficha },
            update: { ...ficha, syncedAt: new Date() },
          });

          await this.prisma.tenantProductOffer.upsert({
            where: {
              tenantId_provider_externalId: { tenantId, provider, externalId: item.externalId },
            },
            create: { tenantId, provider, externalId: item.externalId, ...oferta },
            update: { ...oferta, syncedAt: new Date() },
          });
        })
      );
    }

    if (historyRows.length) {
      await this.prisma.productPriceHistory.createMany({ data: historyRows });
    }
  }

  async status(tenantId: string, provider: Provider) {
    await this.visibility.assertVisible(tenantId, provider);
    const [credential, total, withStock, last] = await Promise.all([
      this.credentials.findByProvider(tenantId, provider),
      this.prisma.tenantProductOffer.count({ where: { tenantId, provider, active: true } }),
      this.prisma.tenantProductOffer.count({
        where: { tenantId, provider, active: true, stock: { gt: 0 } },
      }),
      this.prisma.tenantProductOffer.findFirst({
        where: { tenantId, provider },
        orderBy: { syncedAt: "desc" },
        select: { syncedAt: true },
      }),
    ]);

    return {
      provider,
      implemented: Boolean(this.registry.get(provider)),
      publicCatalog: Boolean(this.registry.get(provider)?.publicCatalog),
      hasCredentials: Boolean(credential),
      total,
      withStock,
      lastSyncedAt: last?.syncedAt ?? null,
    };
  }

  /**
   * Un comercio solo ve los productos que él mismo sincronizó con su cuenta.
   * Un distribuidor ve la ficha de *su* catálogo, sin las otras integraciones.
   */
  async search(tenant: TenantContext, provider: Provider, name: string) {
    if (!(await this.isProviderVisible(provider))) return [];
    if (tenant.tenantType === "DISTRIBUTOR") {
      return this.searchOwnCatalog(tenant, provider, name);
    }
    const scope = commercialId(tenant);
    if (!(await this.visibility.isLinked(scope, provider))) return [];
    const [offers, rules] = await Promise.all([
      this.prisma.tenantProductOffer.findMany({
        where: {
          tenantId: scope,
          provider,
          active: true,
          product: { name: { contains: name, mode: "insensitive" } },
        },
        include: { product: true },
        orderBy: { product: { name: "asc" } },
        take: 200,
      }),
      this.rulesFor(tenant, provider),
    ]);
    return offers.map((offer) => toProductView(offer.product, offer, rules));
  }

  /** Producto individual — soporta entrar directo por link, sin depender del caché de búsqueda del frontend. */
  async getProduct(tenant: TenantContext, provider: Provider, externalId: string) {
    if (!(await this.isProviderVisible(provider))) return null;
    if (tenant.tenantType === "DISTRIBUTOR") {
      return this.getOwnCatalogProduct(tenant, provider, externalId);
    }
    const scope = commercialId(tenant);
    if (!(await this.visibility.isLinked(scope, provider))) return null;
    const offer = await this.prisma.tenantProductOffer.findUnique({
      where: { tenantId_provider_externalId: { tenantId: scope, provider, externalId } },
      include: { product: true },
    });
    if (!offer) return null;
    return toProductView(offer.product, offer, await this.rulesFor(tenant, provider));
  }

  /**
   * Serie de precios real de esta organización (solo puntos donde el precio
   * efectivamente cambió). Se guarda cruda, así que descuento y markup se aplican
   * al leer y el gráfico sigue el precio de venta actual.
   */
  async getPriceHistory(tenant: TenantContext, provider: Provider, externalId: string) {
    const [points, rules, sheet] = await Promise.all([
      this.prisma.productPriceHistory.findMany({
        where: { tenantId: commercialId(tenant), provider, externalId },
        orderBy: { capturedAt: "asc" },
        select: { price: true, finalPrice: true, currency: true, capturedAt: true },
      }),
      this.rulesFor(tenant, provider),
      this.prisma.providerSyncCache.findUnique({
        where: { provider_externalId: { provider, externalId } },
        select: { brand: true },
      }),
    ]);
    const brandDiscount = rules.brandDiscounts.get(normalizeBrandName(sheet?.brand)) ?? 0;
    return points.map((point) => ({
      ...point,
      price: applyPrice(point.price, rules.discountPercent, brandDiscount, rules.markupPercent),
      finalPrice: applyPrice(point.finalPrice, rules.discountPercent, brandDiscount, rules.markupPercent),
    }));
  }

  /** Markup, umbral y descuentos que hay que aplicar al leer este proveedor. */
  private async rulesFor(tenant: TenantContext, provider: Provider): Promise<OfferRules> {
    if (tenant.tenantType !== "RETAILER") return NO_RULES;
    const scope = commercialId(tenant);
    const [config, link] = await Promise.all([
      this.prisma.providerSyncConfig.findUnique({
        where: { tenantId_provider: { tenantId: scope, provider } },
        select: { priceMarkupPercent: true, minStockThreshold: true },
      }),
      this.prisma.tenantLink.findFirst({
        where: {
          clientTenantId: scope,
          status: "ACTIVE",
          supplierTenant: { providerKey: provider },
        },
        select: { discountPercent: true, supplierTenantId: true },
      }),
    ]);
    const brandDiscounts = await this.brandDiscountsOf(link?.supplierTenantId, scope);
    return {
      markupPercent: Number(config?.priceMarkupPercent) || 0,
      minStockThreshold: config?.minStockThreshold || 0,
      discountPercent: link?.discountPercent == null ? 0 : Number(link.discountPercent),
      brandDiscounts,
    };
  }

  /** Igual que `rulesFor` pero para varios proveedores de una, en las vistas mezcladas. */
  private async rulesByProvider(tenant: TenantContext): Promise<Map<string, OfferRules>> {
    if (tenant.tenantType !== "RETAILER") return new Map();
    const scope = commercialId(tenant);
    const [configs, links] = await Promise.all([
      this.prisma.providerSyncConfig.findMany({
        where: { tenantId: scope },
        select: { provider: true, priceMarkupPercent: true, minStockThreshold: true },
      }),
      this.prisma.tenantLink.findMany({
        where: {
          clientTenantId: scope,
          status: "ACTIVE",
          supplierTenant: { providerKey: { not: null } },
        },
        select: {
          discountPercent: true,
          supplierTenantId: true,
          supplierTenant: { select: { providerKey: true } },
        },
      }),
    ]);
    const configBy = new Map(configs.map((c) => [c.provider, c]));
    const supplierIds = [...new Set(links.map((link) => link.supplierTenantId))];
    const brandRows = supplierIds.length
      ? await this.prisma.tenantBrandDiscount.findMany({
          where: { tenantId: { in: supplierIds } },
          include: { clients: { select: { clientTenantId: true } } },
        })
      : [];
    const brandsBySupplier = new Map<string, Map<string, number>>();
    for (const row of brandRows) {
      if (
        !brandDiscountAppliesToClient(
          row.appliesToAll,
          row.clients.map((client) => client.clientTenantId),
          scope
        )
      ) {
        continue;
      }
      const map = brandsBySupplier.get(row.tenantId) ?? new Map<string, number>();
      map.set(normalizeBrandName(row.brandName), Number(row.discountPercent) || 0);
      brandsBySupplier.set(row.tenantId, map);
    }
    const result = new Map<string, OfferRules>();
    for (const link of links) {
      const key = link.supplierTenant.providerKey;
      if (!key) continue;
      const config = configBy.get(key);
      result.set(key, {
        markupPercent: Number(config?.priceMarkupPercent) || 0,
        minStockThreshold: config?.minStockThreshold || 0,
        discountPercent: link.discountPercent == null ? 0 : Number(link.discountPercent),
        brandDiscounts: brandsBySupplier.get(link.supplierTenantId) ?? new Map(),
      });
    }
    return result;
  }

  private async brandDiscountsOf(supplierTenantId: string | undefined, clientTenantId: string) {
    if (!supplierTenantId) return new Map<string, number>();
    const rows = await this.prisma.tenantBrandDiscount.findMany({
      where: { tenantId: supplierTenantId },
      include: { clients: { select: { clientTenantId: true } } },
    });
    const map = new Map<string, number>();
    for (const row of rows) {
      if (
        !brandDiscountAppliesToClient(
          row.appliesToAll,
          row.clients.map((client) => client.clientTenantId),
          clientTenantId
        )
      ) {
        continue;
      }
      map.set(normalizeBrandName(row.brandName), Number(row.discountPercent) || 0);
    }
    return map;
  }

  private async hiddenProviders(): Promise<Set<string>> {
    const rows = await this.prisma.providerDisplayConfig.findMany({
      where: { visible: false },
      select: { provider: true },
    });
    return new Set(rows.map((r) => r.provider));
  }

  private async isProviderVisible(provider: Provider): Promise<boolean> {
    const row = await this.prisma.providerDisplayConfig.findUnique({ where: { provider } });
    return row?.visible ?? true;
  }

  /**
   * Categorías distintas con conteo, cruzando todos los proveedores visibles — para la
   * landing de Búsqueda.
   *
   * Va en SQL crudo porque hay que agrupar por un campo de la ficha contando ofertas
   * de la organización, y el `groupBy` de Prisma no cruza tablas: la alternativa era
   * traerse el catálogo entero a memoria para contarlo acá.
   */
  async getCategories(tenant: TenantContext) {
    if (tenant.tenantType === "DISTRIBUTOR") {
      return this.ownCatalogCategories(tenant);
    }
    const providers = await this.readableProviders(commercialId(tenant));
    if (providers.length === 0) return [];
    const rows = await this.prisma.$queryRaw<{ category: string; count: bigint }[]>`
      SELECT ficha.category AS category, COUNT(*) AS count
      FROM "TenantProductOffer" oferta
      JOIN "ProviderSyncCache" ficha
        ON ficha.provider = oferta.provider AND ficha."externalId" = oferta."externalId"
      WHERE oferta."tenantId" = ${commercialId(tenant)}
        AND oferta.active
        AND ficha.category IS NOT NULL
        AND oferta.provider = ANY(${providers}::text[])
      GROUP BY ficha.category
      ORDER BY count DESC
      LIMIT 60
    `;
    return rows.map((r) => ({ category: r.category, count: Number(r.count) }));
  }

  /** Muestra de productos con stock entre proveedores visibles, para destacados de la landing. */
  async getFeatured(tenant: TenantContext, take: number) {
    if (tenant.tenantType === "DISTRIBUTOR") {
      return this.ownCatalogFeatured(tenant, take);
    }
    const providers = await this.readableProviders(commercialId(tenant));
    if (providers.length === 0) return [];
    const [offers, rules] = await Promise.all([
      this.prisma.tenantProductOffer.findMany({
        where: { tenantId: commercialId(tenant), active: true, stock: { gt: 0 }, provider: { in: providers } },
        include: { product: true },
        orderBy: { syncedAt: "desc" },
        take: Math.min(Math.max(take, 1), 60),
      }),
      this.rulesByProvider(tenant),
    ]);
    return offers.map((offer) => toProductView(offer.product, offer, rules.get(offer.provider) ?? NO_RULES));
  }

  /** Productos de una categoría, cruzando todos los proveedores visibles — clic en la grilla de categorías de la landing. */
  async getByCategory(tenant: TenantContext, category: string, take: number) {
    if (tenant.tenantType === "DISTRIBUTOR") {
      return this.ownCatalogByCategory(tenant, category, take);
    }
    const providers = await this.readableProviders(commercialId(tenant));
    if (providers.length === 0) return [];
    const [offers, rules] = await Promise.all([
      this.prisma.tenantProductOffer.findMany({
        where: { tenantId: commercialId(tenant), active: true, provider: { in: providers }, product: { category } },
        include: { product: true },
        orderBy: { product: { name: "asc" } },
        take: Math.min(Math.max(take, 1), 200),
      }),
      this.rulesByProvider(tenant),
    ]);
    return offers.map((offer) => toProductView(offer.product, offer, rules.get(offer.provider) ?? NO_RULES));
  }

  /**
   * Proveedores de los que esta organización puede leer catálogo: los que tiene
   * vinculados, menos los que el superadmin escondió de toda la plataforma.
   */
  private async readableProviders(tenantId: string): Promise<string[]> {
    const [linked, hidden] = await Promise.all([
      this.visibility.linkedProviderKeys(tenantId),
      this.hiddenProviders(),
    ]);
    return linked.filter((provider) => !hidden.has(provider));
  }

  private async searchOwnCatalog(tenant: TenantContext, provider: Provider, name: string) {
    const scope = await this.ownCatalogScope(tenant);
    if (!scope || scope.provider !== provider) return [];
    const products = await this.prisma.providerSyncCache.findMany({
      where: {
        provider,
        name: { contains: name, mode: "insensitive" },
        ...this.brandWhere(scope.brands),
      },
      orderBy: { name: "asc" },
      take: 200,
    });
    return this.withLatestOffers(products);
  }

  private async getOwnCatalogProduct(tenant: TenantContext, provider: Provider, externalId: string) {
    const scope = await this.ownCatalogScope(tenant);
    if (!scope || scope.provider !== provider) return null;
    const product = await this.prisma.providerSyncCache.findUnique({
      where: { provider_externalId: { provider, externalId } },
    });
    if (!product) return null;
    if (scope.brands && !scope.brands.has(normalizeBrandName(product.brand))) return null;
    const [view] = await this.withLatestOffers([product]);
    return view ?? null;
  }

  private async ownCatalogCategories(tenant: TenantContext) {
    const scope = await this.ownCatalogScope(tenant);
    if (!scope) return [];
    const rows = await this.prisma.providerSyncCache.groupBy({
      by: ["category"],
      where: {
        provider: scope.provider,
        category: { not: null },
        ...this.brandWhere(scope.brands),
      },
      _count: { _all: true },
    });
    return rows
      .filter((row) => row.category)
      .map((row) => ({ category: row.category as string, count: row._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 60);
  }

  private async ownCatalogFeatured(tenant: TenantContext, take: number) {
    const scope = await this.ownCatalogScope(tenant);
    if (!scope) return [];
    const products = await this.prisma.providerSyncCache.findMany({
      where: { provider: scope.provider, ...this.brandWhere(scope.brands) },
      orderBy: { syncedAt: "desc" },
      take: Math.min(Math.max(take, 1), 60),
    });
    return this.withLatestOffers(products);
  }

  private async ownCatalogByCategory(tenant: TenantContext, category: string, take: number) {
    const scope = await this.ownCatalogScope(tenant);
    if (!scope) return [];
    const products = await this.prisma.providerSyncCache.findMany({
      where: { provider: scope.provider, category, ...this.brandWhere(scope.brands) },
      orderBy: { name: "asc" },
      take: Math.min(Math.max(take, 1), 200),
    });
    return this.withLatestOffers(products);
  }

  private brandWhere(brands: Set<string> | null) {
    if (!brands) return {};
    if (brands.size === 0) return { id: { in: [] as string[] } };
    // `in` no acepta `mode: insensitive` en Prisma: se compara marca a marca.
    return {
      OR: [...brands].map((brand) => ({
        brand: { equals: brand, mode: "insensitive" as const },
      })),
    };
  }

  /**
   * Catálogo propio del mayorista. `brands === null` son todas; un set vacío es un
   * Product Manager sin marcas asignadas (no ve nada).
   */
  private async ownCatalogScope(tenant: TenantContext): Promise<{ provider: string; brands: Set<string> | null } | null> {
    const row = await this.prisma.tenant.findUnique({
      where: { id: tenant.tenantId },
      select: { providerKey: true, type: true },
    });
    if (row?.type !== "DISTRIBUTOR" || !row.providerKey) return null;
    if (tenant.tenantRole !== "PRODUCT_MANAGER") {
      return { provider: row.providerKey, brands: null };
    }
    const scopes = await this.prisma.productManagerScope.findMany({
      where: { tenantId: tenant.tenantId, userId: tenant.userId },
      select: { brandName: true },
    });
    return {
      provider: row.providerKey,
      brands: new Set(scopes.map((scope) => normalizeBrandName(scope.brandName)).filter(Boolean)),
    };
  }

  private async withLatestOffers(products: import("@prisma/client").ProviderSyncCache[]) {
    if (products.length === 0) return [];
    const provider = products[0].provider;
    const ids = products.map((p) => p.externalId);
    const offers = await this.prisma.tenantProductOffer.findMany({
      where: { provider, externalId: { in: ids } },
      orderBy: { syncedAt: "desc" },
    });
    const latest = new Map<string, (typeof offers)[number]>();
    for (const offer of offers) {
      if (!latest.has(offer.externalId)) latest.set(offer.externalId, offer);
    }
    return products.map((product) => toSheetView(product, latest.get(product.externalId) ?? null));
  }

  /**
   * "Limpiar sin stock del proveedor" — saca ya mismo los productos sin stock, sin
   * esperar a la próxima sincronización. Solo afecta al catálogo de esta
   * organización; la ficha queda para el resto.
   */
  async clearZeroStock(tenantId: string, provider: Provider) {
    const config = await this.prisma.providerSyncConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
      select: { minStockThreshold: true },
    });
    const minStockThreshold = config?.minStockThreshold || 0;
    const res = await this.prisma.tenantProductOffer.deleteMany({
      where: { tenantId, provider, stock: { lte: Math.max(minStockThreshold, 0) } },
    });
    return { provider, deleted: res.count };
  }

  /** "Eliminar todos los productos de {proveedor}" en el catálogo de esta organización. */
  async deleteAllProducts(tenantId: string, provider: Provider) {
    const res = await this.prisma.tenantProductOffer.deleteMany({ where: { tenantId, provider } });
    return { provider, deleted: res.count };
  }

  /** Usado por el cron de sincronización automática. Si hay cuenta, corre. */
  async findDueConfigs(): Promise<{ tenantId: string; provider: string }[]> {
    const [configs, credenciales] = await Promise.all([
      this.prisma.providerSyncConfig.findMany({
        where: { tenant: { active: true } },
      }),
      this.prisma.credential.findMany({
        where: { tenant: { active: true } },
        select: { tenantId: true, providerName: true },
      }),
    ]);
    const conCuenta = new Set(credenciales.map((row) => `${row.tenantId}::${row.providerName}`));
    const now = Date.now();
    const due: { tenantId: string; provider: string }[] = [];

    for (const c of configs) {
      const hasAccount = conCuenta.has(`${c.tenantId}::${c.provider}`);
      if (!c.enabled && !hasAccount) continue;
      if (!c.lastSyncedAt || now >= c.lastSyncedAt.getTime() + c.syncIntervalMinutes * 60_000) {
        due.push({ tenantId: c.tenantId, provider: c.provider });
      }
    }

    const already = new Set(due.map((c) => `${c.tenantId}::${c.provider}`));
    const conConfig = new Set(configs.map((c) => `${c.tenantId}::${c.provider}`));
    for (const cred of credenciales) {
      const key = `${cred.tenantId}::${cred.providerName}`;
      if (already.has(key) || conConfig.has(key)) continue;
      due.push({ tenantId: cred.tenantId, provider: cred.providerName });
    }
    return due;
  }
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
}
