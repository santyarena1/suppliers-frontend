import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Provider } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialsService } from "../credentials/credentials.service";
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
    private readonly registry: ProviderRegistry
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
    return this.prisma.providerSyncConfig.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, ...dto },
      update: { ...dto },
    });
  }

  async sync(tenantId: string, provider: Provider) {
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
    const [offers, rules] = await Promise.all([
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
    ]);
    return offers.map((offer) => toProductView(offer.product, offer, rules));
  }

  /** Producto individual — soporta entrar directo por link, sin depender del caché de búsqueda del frontend. */
  async getProduct(tenantId: string, provider: Provider, externalId: string) {
    if (!(await this.isProviderVisible(provider))) return null;
    const offer = await this.prisma.tenantProductOffer.findUnique({
      where: { tenantId_provider_externalId: { tenantId, provider, externalId } },
      include: { product: true },
    });
    if (!offer) return null;
    return toProductView(offer.product, offer, await this.rulesFor(tenantId, provider));
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

  /** Categorías distintas con conteo, cruzando todos los proveedores visibles — para la landing de Búsqueda. */
  async getCategories(tenantId: string) {
    const hidden = await this.hiddenProviders();
    const rows = await this.prisma.tenantProductOffer.groupBy({
      by: ["provider", "externalId"],
      where: { tenantId, active: true, provider: { notIn: [...hidden] } },
      _count: { _all: true },
    });
    if (rows.length === 0) return [];

    // `groupBy` no puede agrupar por un campo de la ficha, así que se cuentan las
    // categorías de los productos que la organización realmente tiene.
    const counts = new Map<string, number>();
    const CHUNK = 1000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const products = await this.prisma.providerSyncCache.findMany({
        where: { OR: chunk.map((r) => ({ provider: r.provider, externalId: r.externalId })) },
        select: { category: true },
      });
      for (const { category } of products) {
        if (!category) continue;
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 60);
  }

  /** Muestra de productos con stock entre proveedores visibles, para destacados de la landing. */
  async getFeatured(tenantId: string, take: number) {
    const hidden = await this.hiddenProviders();
    const [offers, rules] = await Promise.all([
      this.prisma.tenantProductOffer.findMany({
        where: { tenantId, active: true, stock: { gt: 0 }, provider: { notIn: [...hidden] } },
        include: { product: true },
        orderBy: { syncedAt: "desc" },
        take: Math.min(Math.max(take, 1), 60),
      }),
      this.rulesByProvider(tenantId),
    ]);
    return offers.map((offer) => toProductView(offer.product, offer, rules.get(offer.provider) ?? NO_RULES));
  }

  /** Productos de una categoría, cruzando todos los proveedores visibles — clic en la grilla de categorías de la landing. */
  async getByCategory(tenantId: string, category: string, take: number) {
    const hidden = await this.hiddenProviders();
    const [offers, rules] = await Promise.all([
      this.prisma.tenantProductOffer.findMany({
        where: { tenantId, active: true, provider: { notIn: [...hidden] }, product: { category } },
        include: { product: true },
        orderBy: { product: { name: "asc" } },
        take: Math.min(Math.max(take, 1), 200),
      }),
      this.rulesByProvider(tenantId),
    ]);
    return offers.map((offer) => toProductView(offer.product, offer, rules.get(offer.provider) ?? NO_RULES));
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
