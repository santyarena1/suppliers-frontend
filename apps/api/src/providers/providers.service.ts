import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { providerHasIvaRate, type Provider } from "@nodo/shared";
import type { IvaAdjustment } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CatalogEnrichmentService } from "../catalog/catalog-enrichment.service";
import { CredentialsService } from "../credentials/credentials.service";
import { TenantVisibilityService } from "../tenants/tenant-visibility.service";
import { NO_RULES, toProductView, type OfferRules } from "./catalog-view";
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
    private readonly visibility: TenantVisibilityService,
    private readonly catalogEnrichment: CatalogEnrichmentService
  ) {}

  async getConfig(tenantId: string, provider: Provider) {
    const config = await this.prisma.providerSyncConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    return serializeSyncConfig((config ?? this.defaultConfig(tenantId, provider)));
  }

  private defaultConfig(tenantId: string, provider: Provider) {
    return {
      id: null as string | null,
      tenantId,
      provider,
      enabled: false,
      syncIntervalMinutes: 60,
      missingProductAction: "KEEP" as const,
      zeroStockAction: "KEEP" as const,
      priceMarkupPercent: 0,
      minStockThreshold: 0,
      acceptsOffline: false,
      acceptsScheme: false,
      offlineIvaAdjustment: null as IvaAdjustment | null,
      schemeIvaAdjustment: null as IvaAdjustment | null,
      schemeDiscountPercent: null as number | null,
      lastSyncedAt: null as Date | null,
      lastSyncError: null as string | null,
      lastSyncCreated: 0,
      lastSyncUpdated: 0,
    };
  }

  async updateConfig(tenantId: string, provider: Provider, dto: UpdateProviderConfigDto) {
    await this.visibility.assertLinked(tenantId, provider);
    const current = await this.prisma.providerSyncConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    const merged = {
      acceptsOffline: dto.acceptsOffline ?? current?.acceptsOffline ?? false,
      acceptsScheme: dto.acceptsScheme ?? current?.acceptsScheme ?? false,
      offlineIvaAdjustment:
        dto.offlineIvaAdjustment !== undefined
          ? dto.offlineIvaAdjustment
          : (current?.offlineIvaAdjustment ?? null),
      schemeIvaAdjustment:
        dto.schemeIvaAdjustment !== undefined
          ? dto.schemeIvaAdjustment
          : (current?.schemeIvaAdjustment ?? null),
      schemeDiscountPercent:
        dto.schemeDiscountPercent !== undefined
          ? dto.schemeDiscountPercent
          : current?.schemeDiscountPercent == null
            ? null
            : Number(current.schemeDiscountPercent),
    };
    if ((merged.acceptsOffline || merged.acceptsScheme) && !providerHasIvaRate(provider)) {
      throw new BadRequestException(
        "Este distribuidor no informa alícuota de IVA: no se puede configurar pedido offline ni esquema."
      );
    }
    if (merged.acceptsOffline && !merged.offlineIvaAdjustment) {
      throw new BadRequestException("Si acepta pedido offline, hay que elegir cómo tratar el IVA de offline.");
    }
    if (merged.acceptsScheme && !merged.schemeIvaAdjustment) {
      throw new BadRequestException("Si acepta esquema, hay que elegir cómo tratar el IVA de esquema.");
    }
    const data = { ...dto, ...merged };
    const saved = await this.prisma.providerSyncConfig.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, ...data },
      update: data,
    });
    return serializeSyncConfig(saved);
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
   * Un comercio solo ve los productos que él mismo sincronizó con su cuenta: sin
   * oferta no hay precio que mostrar, y un precio traído con la cuenta de otro no
   * sería el suyo.
   */
  async search(tenantId: string, provider: Provider, name: string) {
    if (!(await this.isProviderVisible(provider))) return [];
    if (!(await this.visibility.isLinked(tenantId, provider))) return [];
    const [offers, rules, enrichment] = await Promise.all([
      this.prisma.tenantProductOffer.findMany({
        where: {
          tenantId,
          provider,
          active: true,
          product: { name: { contains: name, mode: "insensitive" } },
        },
        include: { product: true },
        orderBy: { product: { name: "asc" } },
        take: 200,
      }),
      this.rulesFor(tenantId, provider),
      this.catalogEnrichment.getContext(),
    ]);
    return offers.map((offer) => toProductView(offer.product, offer, rules, enrichment));
  }

  /** Producto individual — soporta entrar directo por link, sin depender del caché de búsqueda del frontend. */
  async getProduct(tenantId: string, provider: Provider, externalId: string) {
    if (!(await this.isProviderVisible(provider))) return null;
    if (!(await this.visibility.isLinked(tenantId, provider))) return null;
    const offer = await this.prisma.tenantProductOffer.findUnique({
      where: { tenantId_provider_externalId: { tenantId, provider, externalId } },
      include: { product: true },
    });
    if (!offer) return null;
    const [rules, enrichment] = await Promise.all([
      this.rulesFor(tenantId, provider),
      this.catalogEnrichment.getContext(),
    ]);
    return toProductView(offer.product, offer, rules, enrichment);
  }

  /**
   * Serie de precios real de esta organización (solo puntos donde el precio
   * efectivamente cambió). Se guarda cruda, así que el markup se aplica al leer y
   * el gráfico sigue el precio de venta actual.
   */
  async getPriceHistory(tenantId: string, provider: Provider, externalId: string) {
    const [points, rules] = await Promise.all([
      this.prisma.productPriceHistory.findMany({
        where: { tenantId, provider, externalId },
        orderBy: { capturedAt: "asc" },
        select: { price: true, finalPrice: true, currency: true, capturedAt: true },
      }),
      this.rulesFor(tenantId, provider),
    ]);
    return points.map((point) => ({
      ...point,
      price: withMarkup(point.price, rules.markupPercent),
      finalPrice: withMarkup(point.finalPrice, rules.markupPercent),
    }));
  }

  /** Markup y umbral configurados por la organización para un proveedor. */
  private async rulesFor(tenantId: string, provider: Provider): Promise<OfferRules> {
    const config = await this.prisma.providerSyncConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
      select: { priceMarkupPercent: true, minStockThreshold: true },
    });
    if (!config) return NO_RULES;
    return {
      markupPercent: Number(config.priceMarkupPercent) || 0,
      minStockThreshold: config.minStockThreshold || 0,
    };
  }

  /** Igual que `rulesFor` pero para varios proveedores de una, en las vistas mezcladas. */
  private async rulesByProvider(tenantId: string): Promise<Map<string, OfferRules>> {
    const configs = await this.prisma.providerSyncConfig.findMany({
      where: { tenantId },
      select: { provider: true, priceMarkupPercent: true, minStockThreshold: true },
    });
    return new Map(
      configs.map((c) => [
        c.provider,
        {
          markupPercent: Number(c.priceMarkupPercent) || 0,
          minStockThreshold: c.minStockThreshold || 0,
        },
      ])
    );
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
  async getCategories(tenantId: string) {
    const providers = await this.readableProviders(tenantId);
    if (providers.length === 0) return [];
    const [rows, enrichment] = await Promise.all([
      this.prisma.$queryRaw<{ category: string; count: bigint }[]>`
      SELECT ficha.category AS category, COUNT(*) AS count
      FROM "TenantProductOffer" oferta
      JOIN "ProviderSyncCache" ficha
        ON ficha.provider = oferta.provider AND ficha."externalId" = oferta."externalId"
      WHERE oferta."tenantId" = ${tenantId}
        AND oferta.active
        AND ficha.category IS NOT NULL
        AND oferta.provider = ANY(${providers}::text[])
      GROUP BY ficha.category
      ORDER BY count DESC
      LIMIT 120
    `,
      this.catalogEnrichment.getContext(),
    ]);
    return this.catalogEnrichment
      .groupCategories(
        rows.map((r) => ({ rawCategory: r.category, count: Number(r.count) })),
        enrichment
      )
      .slice(0, 60);
  }

  /** Muestra mixta para la landing: productos con stock de todos los proveedores + bajadas de precio. */
  async getFeatured(tenantId: string, take: number) {
    const providers = await this.readableProviders(tenantId);
    if (providers.length === 0) return [];
    const limit = Math.min(Math.max(take, 1), 60);
    const [rules, enrichment] = await Promise.all([
      this.rulesByProvider(tenantId),
      this.catalogEnrichment.getContext(),
    ]);

    const priceDropSlots = Math.max(4, Math.ceil(limit * 0.4));
    const drops = await this.findRecentPriceDrops(tenantId, providers, priceDropSlots);

    const dropKeys = new Set(drops.map((d) => `${d.provider}::${d.externalId}`));
    const remaining = Math.max(limit - drops.length, 0);

    const stockOffers = remaining > 0
      ? await this.sampleOffersAcrossProviders(tenantId, providers, remaining, dropKeys)
      : [];

    const dropViews = drops.map((d) => {
      const view = toProductView(d.offer.product, d.offer, rules.get(d.offer.provider) ?? NO_RULES, enrichment);
      const markup = rules.get(d.offer.provider)?.markupPercent ?? 0;
      const prevPrice = withMarkup(d.previousPrice, markup);
      const prevFinal = withMarkup(d.previousFinalPrice, markup);
      const current = view.finalPrice ?? view.price;
      const previous = prevFinal ?? prevPrice;
      const priceDropPercent =
        current != null && previous != null && previous > 0 && current < previous
          ? Math.round(((previous - current) / previous) * 1000) / 10
          : null;
      return {
        ...view,
        previousPrice: prevPrice,
        previousFinalPrice: prevFinal,
        priceDropPercent,
      };
    });

    const stockViews = stockOffers.map((offer) =>
      toProductView(offer.product, offer, rules.get(offer.provider) ?? NO_RULES, enrichment),
    );

    // Bajadas primero; después el resto mezclado por proveedor.
    return [...dropViews, ...stockViews].slice(0, limit);
  }

  /**
   * Última baja real por producto (historial de sync): precio actual < punto anterior.
   * Solo ofertas activas con stock.
   */
  private async findRecentPriceDrops(tenantId: string, providers: string[], take: number) {
    if (take <= 0 || providers.length === 0) return [];

    type DropRow = {
      provider: string;
      externalId: string;
      previousPrice: unknown;
      previousFinalPrice: unknown;
    };

    const rows = await this.prisma.$queryRaw<DropRow[]>`
      WITH ranked AS (
        SELECT
          h.provider,
          h."externalId",
          h.price,
          h."finalPrice",
          h."capturedAt",
          LAG(h.price) OVER (
            PARTITION BY h.provider, h."externalId"
            ORDER BY h."capturedAt" ASC
          ) AS prev_price,
          LAG(h."finalPrice") OVER (
            PARTITION BY h.provider, h."externalId"
            ORDER BY h."capturedAt" ASC
          ) AS prev_final,
          ROW_NUMBER() OVER (
            PARTITION BY h.provider, h."externalId"
            ORDER BY h."capturedAt" DESC
          ) AS rn
        FROM "ProductPriceHistory" h
        WHERE h."tenantId" = ${tenantId}
          AND h.provider = ANY(${providers}::text[])
      )
      SELECT
        r.provider,
        r."externalId",
        r.prev_price AS "previousPrice",
        r.prev_final AS "previousFinalPrice"
      FROM ranked r
      INNER JOIN "TenantProductOffer" o
        ON o."tenantId" = ${tenantId}
        AND o.provider = r.provider
        AND o."externalId" = r."externalId"
        AND o.active
        AND o.stock > 0
      WHERE r.rn = 1
        AND (
          (r.prev_final IS NOT NULL AND r."finalPrice" IS NOT NULL AND r."finalPrice" < r.prev_final)
          OR (
            r.prev_final IS NULL AND r.prev_price IS NOT NULL AND r.price IS NOT NULL
            AND r.price < r.prev_price
          )
        )
      ORDER BY r."capturedAt" DESC
      LIMIT ${take}
    `;

    if (rows.length === 0) return [];

    const offers = await this.prisma.tenantProductOffer.findMany({
      where: {
        tenantId,
        active: true,
        OR: rows.map((r) => ({ provider: r.provider, externalId: r.externalId })),
      },
      include: { product: true },
    });

    const byKey = new Map(offers.map((o) => [`${o.provider}::${o.externalId}`, o] as const));

    return rows.flatMap((r) => {
      const offer = byKey.get(`${r.provider}::${r.externalId}`);
      if (!offer) return [];
      return [{
        provider: r.provider,
        externalId: r.externalId,
        previousPrice: numberOrNull(r.previousPrice),
        previousFinalPrice: numberOrNull(r.previousFinalPrice),
        offer,
      }];
    });
  }

  /** Reparto equitativo entre proveedores (evita que un sync reciente tape al resto). */
  private async sampleOffersAcrossProviders(
    tenantId: string,
    providers: string[],
    take: number,
    excludeKeys: Set<string>,
  ) {
    if (take <= 0 || providers.length === 0) return [];
    const perProvider = Math.max(2, Math.ceil(take / providers.length) + 1);

    const batches = await Promise.all(
      providers.map((provider) =>
        this.prisma.tenantProductOffer.findMany({
          where: { tenantId, provider, active: true, stock: { gt: 0 } },
          include: { product: true },
          orderBy: [{ syncedAt: "desc" }, { product: { name: "asc" } }],
          take: perProvider * 2,
        }),
      ),
    );

    type Offer = (typeof batches)[number][number];
    const queues = batches.map((batch) => {
      const withImage = batch.filter((o) => !!o.product.imageUrl?.trim());
      const without = batch.filter((o) => !o.product.imageUrl?.trim());
      return [...withImage, ...without];
    });

    const picked: Offer[] = [];
    const seen = new Set(excludeKeys);
    let progressed = true;
    while (picked.length < take && progressed) {
      progressed = false;
      for (const queue of queues) {
        if (picked.length >= take) break;
        while (queue.length > 0) {
          const offer = queue.shift()!;
          const key = `${offer.provider}::${offer.externalId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          picked.push(offer);
          progressed = true;
          break;
        }
      }
    }
    return picked;
  }

  /** Productos de una categoría, cruzando todos los proveedores visibles — clic en la grilla de categorías de la landing. */
  async getByCategory(tenantId: string, category: string, take: number) {
    const providers = await this.readableProviders(tenantId);
    if (providers.length === 0) return [];
    const limit = Math.min(Math.max(take, 1), 200);
    const [rules, enrichment, match] = await Promise.all([
      this.rulesByProvider(tenantId),
      this.catalogEnrichment.getContext(),
      this.catalogEnrichment.categoryMatchFilters(category),
    ]);

    const offers = await this.prisma.tenantProductOffer.findMany({
      where: {
        tenantId,
        active: true,
        provider: { in: providers },
        OR: [
          { product: { category: { in: match.rawCategories } } },
          ...(match.eans.length ? [{ product: { ean: { in: match.eans } } }] : []),
          ...(match.partNumbers.length ? [{ product: { partNumber: { in: match.partNumbers } } }] : []),
        ],
      },
      include: { product: true },
      orderBy: { product: { name: "asc" } },
      take: limit * 3,
    });

    return offers
      .filter((offer) => this.catalogEnrichment.productMatchesCategory(offer.product, category, enrichment))
      .slice(0, limit)
      .map((offer) => toProductView(offer.product, offer, rules.get(offer.provider) ?? NO_RULES, enrichment));
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

  /**
   * "Limpiar sin stock del proveedor" — saca ya mismo los productos sin stock, sin
   * esperar a la próxima sincronización. Solo afecta al catálogo de esta
   * organización; la ficha queda para el resto.
   */
  async clearZeroStock(tenantId: string, provider: Provider) {
    const { minStockThreshold } = await this.rulesFor(tenantId, provider);
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

  /** Usado por el cron de sincronización automática. */
  async findDueConfigs() {
    const configs = await this.prisma.providerSyncConfig.findMany({
      where: { enabled: true, tenant: { active: true } },
    });
    const now = Date.now();
    return configs.filter((c) => {
      if (!c.lastSyncedAt) return true;
      const dueAt = c.lastSyncedAt.getTime() + c.syncIntervalMinutes * 60_000;
      return now >= dueAt;
    });
  }
}

function withMarkup(value: unknown, markupPercent: number): number | null {
  const price = numberOrNull(value);
  if (price == null) return null;
  return Math.round(price * (1 + markupPercent / 100) * 100) / 100;
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
}

function serializeSyncConfig<T extends object>(c: T) {
  const row = c as T & Record<string, unknown>;
  return {
    ...row,
    priceMarkupPercent: Number(row.priceMarkupPercent) || 0,
    schemeDiscountPercent: row.schemeDiscountPercent == null ? null : Number(row.schemeDiscountPercent),
    acceptsOffline: Boolean(row.acceptsOffline),
    acceptsScheme: Boolean(row.acceptsScheme),
    offlineIvaAdjustment: (row.offlineIvaAdjustment as IvaAdjustment | null | undefined) ?? null,
    schemeIvaAdjustment: (row.schemeIvaAdjustment as IvaAdjustment | null | undefined) ?? null,
  };
}
