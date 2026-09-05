import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { isListProviderKey, providerHasIvaRate, LIST_PROVIDER_PREFIX, type Provider } from "@nodo/shared";
import type { IvaAdjustment, OfferSource } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CatalogEnrichmentService } from "../catalog/catalog-enrichment.service";
import { CredentialsService } from "../credentials/credentials.service";
import { TenantVisibilityService } from "../tenants/tenant-visibility.service";
import { NO_RULES, toProductView, type OfferRules } from "./catalog-view";
import { catalogStockWhere, hidesZeroStockFromCatalog, isDisplayedInStock } from "./catalog-stock";
import { mergeProductImage } from "../images/product-image";
import { ProviderRegistry } from "./provider-registry";
import type { NormalizedProduct } from "./types";
import { UpdateProviderConfigDto } from "./dto/update-config.dto";
import { diffCatalogItem, type CatalogSyncDiff } from "./catalog-sync-diff";
import {
  CatalogSyncAlreadyRunningError,
  interruptRunningCatalogSyncRuns,
  interruptStaleCatalogSyncRuns,
  serializeCatalogSyncRun,
  startCatalogSyncRun,
  type CatalogSyncProgress,
  type CatalogSyncSource,
} from "./catalog-sync-progress";

/** Cómo se guarda una tanda: de dónde vienen las ofertas. */
export interface SyncOptions {
  /** SYNC (default): API del proveedor. OWN_LIST / BASE_LIST: listas importadas. */
  offerSource?: OfferSource;
}

export type SyncResult = {
  provider: string;
  synced: number;
  created: number;
  updated: number;
  unchanged?: number;
  missingAffected: number;
  zeroStockAffected: number;
  runId?: string;
};

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
export class ProvidersService implements OnModuleInit {
  private readonly logger = new Logger(ProvidersService.name);
  private readonly enrichRunning = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly registry: ProviderRegistry,
    private readonly visibility: TenantVisibilityService,
    private readonly catalogEnrichment: CatalogEnrichmentService
  ) {}

  async onModuleInit() {
    await interruptRunningCatalogSyncRuns(this.prisma);
  }

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
      priceChannel: (isListProviderKey(provider) ? "LIST" : "API") as "API" | "LIST",
      manualIibbPercent: null as number | null,
      manualPerceptionsPercent: null as number | null,
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
    const priceChannel = dto.priceChannel ?? current?.priceChannel ?? (isListProviderKey(provider) ? "LIST" : "API");
    if ((merged.acceptsOffline || merged.acceptsScheme) && !providerHasIvaRate(provider, priceChannel)) {
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
    const data = { ...dto, ...merged, priceChannel };
    const saved = await this.prisma.providerSyncConfig.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, ...data },
      update: data,
    });
    return serializeSyncConfig(saved);
  }

  async sync(tenantId: string, provider: Provider, opts: { source?: CatalogSyncSource } = {}) {
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
    }, opts.source ?? "manual");

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
    // "Sin stock (tienda)" sí es una corrección real: stock 0, siempre.
    if (oferta.stockStatus === "Disponible (tienda)") {
      const current = await this.prisma.tenantProductOffer.findUnique({
        where: { tenantId_provider_externalId: { tenantId, provider, externalId } },
        select: { stockStatus: true },
      });
      if (current?.stockStatus) delete oferta.stockStatus;
    }
    if (oferta.stockStatus === "Sin stock (tienda)" && oferta.stock == null) {
      oferta.stock = 0;
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

  /**
   * Guarda en una organización las ofertas que salieron de una lista importada
   * (propia del comercio, o base del proveedor materializada). Mismo pipeline que
   * un sync real: ficha, oferta, historial de precio, corrida de sync y reglas de
   * faltantes / stock cero, pero acotado a las filas del mismo origen para que una
   * lista propia parcial no esconda lo que viene de la lista base, ni al revés.
   *
   * No valida vínculo: el módulo de importación ya decidió quién puede escribir.
   */
  async applyListOffers(params: {
    tenantId: string;
    provider: Provider;
    items: NormalizedProduct[];
    source: Exclude<OfferSource, "SYNC">;
  }): Promise<SyncResult> {
    return this.runSync(
      params.tenantId,
      params.provider,
      async (onPage) => {
        await onPage(params.items);
      },
      "import",
      { offerSource: params.source }
    );
  }

  /**
   * Copia la lista base de un proveedor (SupplierBaseOffer) a las ofertas de una
   * organización, como source BASE_LIST. Donde la organización ya tiene una oferta
   * OWN_LIST no pisa nada: sus precios mandan. Es lo que corre al aplicar una lista
   * base y al crear un vínculo nuevo con un proveedor por lista.
   */
  async materializeBaseOffers(tenantId: string, provider: Provider): Promise<SyncResult | null> {
    if (!isListProviderKey(provider)) return null;
    const rows = await this.prisma.supplierBaseOffer.findMany({ where: { provider } });
    if (rows.length === 0) return null;
    const fichas = await this.prisma.providerSyncCache.findMany({
      where: { provider, externalId: { in: rows.map((r) => r.externalId) } },
    });
    const fichaById = new Map(fichas.map((f) => [f.externalId, f]));
    const items: NormalizedProduct[] = [];
    for (const row of rows) {
      const ficha = fichaById.get(row.externalId);
      if (!ficha) continue;
      items.push({
        externalId: row.externalId,
        sku: ficha.sku ?? undefined,
        partNumber: ficha.partNumber ?? undefined,
        ean: ficha.ean ?? undefined,
        name: ficha.name,
        brand: ficha.brand ?? undefined,
        category: ficha.category ?? undefined,
        subcategory: ficha.subcategory ?? undefined,
        description: ficha.description ?? undefined,
        longDescription: ficha.longDescription ?? undefined,
        imageUrl: ficha.imageUrl ?? undefined,
        productUrl: ficha.productUrl ?? undefined,
        warranty: ficha.warranty ?? undefined,
        weight: numberOrUndefined(ficha.weight),
        weightUnit: ficha.weightUnit ?? undefined,
        height: numberOrUndefined(ficha.height),
        width: numberOrUndefined(ficha.width),
        length: numberOrUndefined(ficha.length),
        dimensionsUnit: ficha.dimensionsUnit ?? undefined,
        volume: numberOrUndefined(ficha.volume),
        tags: ficha.tags ?? undefined,
        price: numberOrUndefined(row.price),
        finalPrice: numberOrUndefined(row.finalPrice),
        currency: row.currency ?? undefined,
        ivaPercent: numberOrUndefined(row.ivaPercent),
        stock: row.stock ?? undefined,
        stockStatus: row.stockStatus ?? undefined,
        raw: ficha.raw,
      });
    }
    return this.applyListOffers({ tenantId, provider, items, source: "BASE_LIST" });
  }

  private async runSync(
    tenantId: string,
    provider: Provider,
    run: (onPage: (items: NormalizedProduct[]) => Promise<void>) => Promise<void>,
    source: CatalogSyncSource = "manual",
    opts: SyncOptions = {}
  ): Promise<SyncResult> {
    const offerSource: OfferSource = opts.offerSource ?? "SYNC";
    const config = await this.getConfig(tenantId, provider);
    const minStock = config.minStockThreshold || 0;
    const expectedTotal = await this.prisma.tenantProductOffer.count({ where: { tenantId, provider } });

    let progress: CatalogSyncProgress;
    try {
      progress = await startCatalogSyncRun(this.prisma, {
        tenantId,
        provider,
        source,
        expectedTotal,
      });
    } catch (err) {
      if (err instanceof CatalogSyncAlreadyRunningError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    const syncStartedAt = new Date();

    try {
      await run(async (items) => {
        await this.upsertPage(tenantId, provider, items, progress, offerSource);
      });
    } catch (err) {
      await progress.fail(errorMessage(err));
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
      config.missingProductAction,
      offerSource
    );
    const zeroStockCount = await this.applyZeroStockAction(
      tenantId,
      provider,
      syncStartedAt,
      config.zeroStockAction,
      minStock,
      offerSource
    );

    const finished = await progress.succeed({
      missingAffected: missingCount,
      zeroStockAffected: zeroStockCount,
    });
    const created = finished.created;
    const updated = finished.updated;
    const count = finished.processed;

    await this.prisma.providerSyncConfig.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, lastSyncedAt: new Date(), lastSyncError: null, lastSyncCreated: created, lastSyncUpdated: updated },
      update: { lastSyncedAt: new Date(), lastSyncError: null, lastSyncCreated: created, lastSyncUpdated: updated },
    });

    this.logger.log(
      `Sync de ${provider}: ${count} productos (creados: ${created}, actualizados: ${updated}, ` +
        `sin cambios: ${finished.unchanged}, faltantes afectados: ${missingCount}, stock cero afectados: ${zeroStockCount})`
    );

    if (provider === "AIR") {
      this.catalogEnrichment.purgeAirImportCodes().catch((err) => {
        this.logger.warn(
          `No se pudieron limpiar códigos viejos de Air: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }
    if (provider === "INVID") {
      this.catalogEnrichment.repairInvidEncoding().catch((err) => {
        this.logger.warn(
          `No se pudieron reparar categorías de Invid: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }

    return {
      provider,
      synced: count,
      created,
      updated,
      unchanged: finished.unchanged,
      missingAffected: missingCount,
      zeroStockAffected: zeroStockCount,
      runId: finished.id,
    };
  }

  /**
   * Productos que esta organización tenía para este proveedor pero no vinieron en la
   * última sincronización. Solo se tocan sus ofertas: la ficha es de todos.
   * KEEP / OUT_OF_STOCK / HIDE / DELETE salen de la config del distribuidor.
   */
  private async applyMissingProductAction(
    tenantId: string,
    provider: Provider,
    syncStartedAt: Date,
    action: string,
    source: OfferSource = "SYNC"
  ) {
    if (action === "KEEP") return 0;
    // Una lista solo decide sobre las filas de su mismo origen: la propia del
    // comercio no esconde lo que viene de la base, ni la base lo propio.
    const where = { tenantId, provider, syncedAt: { lt: syncStartedAt }, ...(source === "SYNC" ? {} : { source }) };
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
    minStock: number,
    source: OfferSource = "SYNC"
  ) {
    if (action === "KEEP") return 0;
    const where = {
      tenantId,
      provider,
      syncedAt: { gte: syncStartedAt },
      stock: { lte: Math.max(minStock, 0) },
      ...(source === "SYNC" ? {} : { source }),
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
  private async upsertPage(
    tenantId: string,
    provider: Provider,
    items: NormalizedProduct[],
    progress?: CatalogSyncProgress,
    offerSource: OfferSource = "SYNC"
  ): Promise<CatalogSyncDiff[]> {
    // Historial de precio: se compara contra el precio guardado antes de
    // pisarlo, y solo se graba una fila nueva si realmente cambió (o es un
    // producto nuevo) — evita llenar la tabla con una fila idéntica cada vez
    // que corre el cron sin que haya habido ninguna variación real.
    const existing = await this.prisma.tenantProductOffer.findMany({
      where: { tenantId, provider, externalId: { in: items.map((i) => i.externalId) } },
      select: {
        externalId: true,
        price: true,
        finalPrice: true,
        currency: true,
        ivaPercent: true,
        stock: true,
        stockStatus: true,
        source: true,
      },
    });
    const previousByExternalId = new Map(existing.map((e) => [e.externalId, e]));
    const diffs: CatalogSyncDiff[] = [];
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
      const previousFichas = await this.prisma.providerSyncCache.findMany({
        where: { provider, externalId: { in: chunk.map((it) => it.externalId) } },
        select: {
          externalId: true,
          imageUrl: true,
          name: true,
          brand: true,
          category: true,
          subcategory: true,
          sku: true,
        },
      });
      const previousFichaById = new Map(previousFichas.map((f) => [f.externalId, f]));
      const chunkDiffs = await Promise.all(
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
            imageUrl: mergeProductImage(item.imageUrl, previousFichaById.get(item.externalId)?.imageUrl),
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
            source: offerSource,
          };

          const previous = previousByExternalId.get(item.externalId);
          const previousFicha = previousFichaById.get(item.externalId);
          // La lista base nunca pisa los precios propios del comercio.
          const keepOwnPrice = offerSource === "BASE_LIST" && previous?.source === "OWN_LIST";
          const priceChanged =
            !keepOwnPrice &&
            (!previous ||
              numberOrNull(previous.price) !== numberOrNull(oferta.price) ||
              numberOrNull(previous.finalPrice) !== numberOrNull(oferta.finalPrice));
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

          const diff = diffCatalogItem(
            item,
            previous
              ? {
                  name: previousFicha?.name,
                  brand: previousFicha?.brand,
                  category: previousFicha?.category,
                  subcategory: previousFicha?.subcategory,
                  sku: previousFicha?.sku,
                  price: previous.price,
                  finalPrice: previous.finalPrice,
                  currency: previous.currency,
                  ivaPercent: previous.ivaPercent,
                  stock: previous.stock,
                  stockStatus: previous.stockStatus,
                }
              : null
          );

          // La ficha tiene que existir antes que la oferta: la oferta la referencia.
          await this.prisma.providerSyncCache.upsert({
            where: { provider_externalId: { provider, externalId: item.externalId } },
            create: { provider, externalId: item.externalId, ...ficha },
            update: { ...ficha, syncedAt: new Date() },
          });

          if (keepOwnPrice) return diff;
          await this.prisma.tenantProductOffer.upsert({
            where: {
              tenantId_provider_externalId: { tenantId, provider, externalId: item.externalId },
            },
            create: { tenantId, provider, externalId: item.externalId, ...oferta },
            update: { ...oferta, syncedAt: new Date() },
          });

          return diff;
        })
      );
      diffs.push(...chunkDiffs);
      if (progress) {
        progress.record(chunkDiffs);
        await progress.flush();
      }
    }

    if (historyRows.length) {
      await this.prisma.productPriceHistory.createMany({ data: historyRows });
    }
    return diffs;
  }

  async status(tenantId: string, provider: Provider) {
    await this.visibility.assertVisible(tenantId, provider);
    await interruptStaleCatalogSyncRuns(this.prisma, { tenantId, provider });
    const [credential, total, withStock, last, currentRun] = await Promise.all([
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
      this.prisma.catalogSyncRun.findFirst({
        where: { tenantId, provider },
        orderBy: { startedAt: "desc" },
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
      currentRun: currentRun ? serializeCatalogSyncRun(currentRun) : null,
    };
  }

  async getCurrentSyncRun(tenantId: string, provider: Provider) {
    await this.visibility.assertVisible(tenantId, provider);
    await interruptStaleCatalogSyncRuns(this.prisma, { tenantId, provider });
    const run = await this.prisma.catalogSyncRun.findFirst({
      where: { tenantId, provider },
      orderBy: { startedAt: "desc" },
    });
    return run ? serializeCatalogSyncRun(run) : null;
  }

  async listSyncRuns(tenantId: string, provider: Provider, take = 20) {
    await this.visibility.assertVisible(tenantId, provider);
    const runs = await this.prisma.catalogSyncRun.findMany({
      where: { tenantId, provider },
      orderBy: { startedAt: "desc" },
      take: Math.min(Math.max(take, 1), 50),
    });
    return runs.map(serializeCatalogSyncRun);
  }

  async getSyncRun(tenantId: string, provider: Provider, runId: string) {
    await this.visibility.assertVisible(tenantId, provider);
    const run = await this.prisma.catalogSyncRun.findFirst({
      where: { id: runId, tenantId, provider },
      include: {
        changes: { orderBy: [{ action: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!run) throw new NotFoundException("Corrida no encontrada");
    return {
      ...serializeCatalogSyncRun(run),
      changes: run.changes.map((change) => ({
        id: change.id,
        externalId: change.externalId,
        name: change.name,
        action: change.action,
        changedFields: Array.isArray(change.changedFields)
          ? change.changedFields.filter((field): field is string => typeof field === "string")
          : [],
        before: change.before,
        after: change.after,
      })),
    };
  }

  /**
   * Un comercio solo ve los productos que él mismo sincronizó con su cuenta: sin
   * oferta no hay precio que mostrar, y un precio traído con la cuenta de otro no
   * sería el suyo.
   */
  async search(
    tenantId: string,
    provider: Provider,
    name: string,
    opts: { includeOutOfStock?: boolean; brand?: string } = {}
  ) {
    if (!(await this.isProviderVisible(provider))) return [];
    if (!(await this.visibility.isLinked(tenantId, provider))) return [];
    const rules = await this.rulesFor(tenantId, provider);
    const stockWhere = catalogStockWhere(
      Boolean(opts.includeOutOfStock),
      rules.minStockThreshold,
      rules.zeroStockAction
    );
    const q = name.trim();
    const brand = opts.brand?.trim();
    if (!q && !brand) return [];

    // Si q es vacío o igual a la marca, filtrar solo por marca (no exigir name contains q).
    const distinctQ = Boolean(q && brand && q.toLowerCase() !== brand.toLowerCase());

    const enrichment = await this.catalogEnrichment.getContext();
    const rawBrands = brand
      ? (await this.catalogEnrichment.brandMatchFilters(brand, enrichment)).rawBrands
      : [];

    const brandClause = brand
      ? {
          OR: [
            ...(rawBrands.length
              ? [{ brand: { in: rawBrands } }]
              : []),
            { brand: { contains: brand, mode: "insensitive" as const } },
            // Fallback: algunos proveedores meten la marca en el nombre y dejan brand vacío.
            { name: { contains: brand, mode: "insensitive" as const } },
          ],
        }
      : null;

    const productWhere = {
      AND: [
        ...(brandClause ? [brandClause] : []),
        ...(distinctQ || (!brand && q)
          ? [{ name: { contains: q, mode: "insensitive" as const } }]
          : []),
      ],
    };

    const offers = await this.prisma.tenantProductOffer.findMany({
      where: {
        tenantId,
        provider,
        active: true,
        AND: [
          ...(Object.keys(stockWhere).length ? [stockWhere] : []),
          { product: productWhere },
        ],
      },
      include: { product: true },
      orderBy: { product: { name: "asc" } },
      take: 200,
    });

    const views = brand
      ? offers
          .filter((offer) =>
            this.catalogEnrichment.productMatchesBrand(offer.product, brand!, enrichment) ||
            // fallback name-contains ya entró por SQL; aceptar esos también
            (offer.product.name?.toLowerCase().includes(brand!.toLowerCase()) ?? false)
          )
          .map((offer) => toProductView(offer.product, offer, rules, enrichment))
      : offers.map((offer) => toProductView(offer.product, offer, rules, enrichment));

    return this.withImageAiFlags(views);
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
    const [view] = await this.withImageAiFlags([
      toProductView(offer.product, offer, rules, enrichment),
    ]);
    return view;
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
    const [config, baseListDiscountPercent] = await Promise.all([
      this.prisma.providerSyncConfig.findUnique({
        where: { tenantId_provider: { tenantId, provider } },
        select: { priceMarkupPercent: true, minStockThreshold: true, zeroStockAction: true },
      }),
      this.baseListDiscountFor(tenantId, provider),
    ]);
    if (!config) return { ...NO_RULES, baseListDiscountPercent };
    return {
      markupPercent: Number(config.priceMarkupPercent) || 0,
      minStockThreshold: config.minStockThreshold || 0,
      zeroStockAction: config.zeroStockAction || "KEEP",
      baseListDiscountPercent,
    };
  }

  /**
   * Descuento pactado en el vínculo con un proveedor por lista. Solo se aplica a
   * ofertas BASE_LIST (ver catalog-view): las propias del comercio ya son su precio.
   */
  private async baseListDiscountFor(tenantId: string, provider: Provider): Promise<number> {
    if (!isListProviderKey(provider)) return 0;
    const link = await this.prisma.tenantLink.findFirst({
      where: { clientTenantId: tenantId, status: { in: ["ACTIVE", "LIST_CONNECTED"] }, supplierTenant: { providerKey: provider } },
      select: { discountPercent: true },
    });
    return Number(link?.discountPercent) || 0;
  }

  /** Igual que `rulesFor` pero para varios proveedores de una, en las vistas mezcladas. */
  private async rulesByProvider(tenantId: string): Promise<Map<string, OfferRules>> {
    const [configs, listLinks] = await Promise.all([
      this.prisma.providerSyncConfig.findMany({
        where: { tenantId },
        select: { provider: true, priceMarkupPercent: true, minStockThreshold: true, zeroStockAction: true },
      }),
      this.prisma.tenantLink.findMany({
        where: {
          clientTenantId: tenantId,
          status: { in: ["ACTIVE", "LIST_CONNECTED"] },
          supplierTenant: { providerKey: { startsWith: LIST_PROVIDER_PREFIX } },
        },
        select: { discountPercent: true, supplierTenant: { select: { providerKey: true } } },
      }),
    ]);
    const discountByProvider = new Map(
      listLinks.map((l) => [l.supplierTenant.providerKey ?? "", Number(l.discountPercent) || 0])
    );
    const rules = new Map<string, OfferRules>(
      configs.map((c) => [
        c.provider,
        {
          markupPercent: Number(c.priceMarkupPercent) || 0,
          minStockThreshold: c.minStockThreshold || 0,
          zeroStockAction: c.zeroStockAction || "KEEP",
          baseListDiscountPercent: discountByProvider.get(c.provider) ?? 0,
        },
      ])
    );
    for (const [provider, discount] of discountByProvider) {
      if (provider && !rules.has(provider)) rules.set(provider, { ...NO_RULES, baseListDiscountPercent: discount });
    }
    return rules;
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
        AND (oferta.stock IS NULL OR oferta.stock > 0)
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

  /**
   * Marcas distintas con conteo, cruzando proveedores visibles — filtros generales
   * del buscador (no facetas post-resultado).
   */
  async getBrands(tenantId: string) {
    const providers = await this.readableProviders(tenantId);
    if (providers.length === 0) return [];
    const [rows, enrichment] = await Promise.all([
      this.prisma.$queryRaw<{ brand: string; count: bigint }[]>`
      SELECT ficha.brand AS brand, COUNT(*) AS count
      FROM "TenantProductOffer" oferta
      JOIN "ProviderSyncCache" ficha
        ON ficha.provider = oferta.provider AND ficha."externalId" = oferta."externalId"
      WHERE oferta."tenantId" = ${tenantId}
        AND oferta.active
        AND (oferta.stock IS NULL OR oferta.stock > 0)
        AND ficha.brand IS NOT NULL
        AND oferta.provider = ANY(${providers}::text[])
      GROUP BY ficha.brand
      ORDER BY count DESC
      LIMIT 200
    `,
      this.catalogEnrichment.getContext(),
    ]);
    return this.catalogEnrichment
      .groupBrands(
        rows.map((r) => ({ rawBrand: r.brand, count: Number(r.count) })),
        enrichment
      )
      .slice(0, 80);
  }

  /**
   * Landing del buscador: por defecto solo productos que bajaron de precio.
   * `mixed=true` conserva el muestreo viejo (bajadas + stock mixto).
   */
  async getFeatured(tenantId: string, take: number, opts: { mixed?: boolean } = {}) {
    const providers = await this.readableProviders(tenantId);
    if (providers.length === 0) return [];
    const limit = Math.min(Math.max(take, 1), 60);
    const [rules, enrichment] = await Promise.all([
      this.rulesByProvider(tenantId),
      this.catalogEnrichment.getContext(),
    ]);

    const drops = await this.findRecentPriceDrops(tenantId, providers, limit);

    const dropViews = drops
      .map((d) => {
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
      })
      // Mayor baja % primero (lo que más bajó → lo que menos).
      .sort((a, b) => (b.priceDropPercent ?? 0) - (a.priceDropPercent ?? 0));

    if (!opts.mixed) {
      return this.withImageAiFlags(dropViews.slice(0, limit));
    }

    const dropKeys = new Set(drops.map((d) => `${d.provider}::${d.externalId}`));
    const remaining = Math.max(limit - drops.length, 0);
    const stockOffers = remaining > 0
      ? await this.sampleOffersAcrossProviders(tenantId, providers, remaining, dropKeys)
      : [];
    const stockViews = stockOffers.map((offer) =>
      toProductView(offer.product, offer, rules.get(offer.provider) ?? NO_RULES, enrichment),
    );

    return this.withImageAiFlags([...dropViews, ...stockViews].slice(0, limit));
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
      ORDER BY
        CASE
          WHEN r.prev_final IS NOT NULL AND r."finalPrice" IS NOT NULL AND r.prev_final > 0
            THEN (r.prev_final - r."finalPrice") / r.prev_final
          WHEN r.prev_price IS NOT NULL AND r.price IS NOT NULL AND r.prev_price > 0
            THEN (r.prev_price - r.price) / r.prev_price
          ELSE 0
        END DESC,
        r."capturedAt" DESC
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
  async getByCategory(
    tenantId: string,
    category: string,
    take: number,
    opts: { includeOutOfStock?: boolean } = {}
  ) {
    const providers = await this.readableProviders(tenantId);
    if (providers.length === 0) return [];
    const limit = Math.min(Math.max(take, 1), 200);
    const includeOutOfStock = Boolean(opts.includeOutOfStock);
    const [rules, enrichment, match] = await Promise.all([
      this.rulesByProvider(tenantId),
      this.catalogEnrichment.getContext(),
      this.catalogEnrichment.categoryMatchFilters(category),
    ]);

    const keepProviders = providers.filter(
      (p) => !hidesZeroStockFromCatalog((rules.get(p) ?? NO_RULES).zeroStockAction)
    );
    const hideProviders = providers.filter(
      (p) => hidesZeroStockFromCatalog((rules.get(p) ?? NO_RULES).zeroStockAction)
    );
    const stockOr = [
      ...(keepProviders.length ? [{ provider: { in: keepProviders } }] : []),
      ...(hideProviders.length
        ? [{ AND: [{ provider: { in: hideProviders } }, catalogStockWhere(false, 0, "HIDE")] }]
        : []),
    ];
    const stockConstraint = includeOutOfStock || stockOr.length === 0 ? [] : [{ OR: stockOr }];

    const offers = await this.prisma.tenantProductOffer.findMany({
      where: {
        tenantId,
        active: true,
        provider: { in: providers },
        AND: [
          ...stockConstraint,
          {
            OR: [
              { product: { category: { in: match.rawCategories } } },
              ...(match.eans.length ? [{ product: { ean: { in: match.eans } } }] : []),
              ...(match.partNumbers.length ? [{ product: { partNumber: { in: match.partNumbers } } }] : []),
            ],
          },
        ],
      },
      include: { product: true },
      orderBy: { product: { name: "asc" } },
      take: limit * 3,
    });

    const views = offers
      .filter((offer) => this.catalogEnrichment.productMatchesCategory(offer.product, category, enrichment))
      .map((offer) => toProductView(offer.product, offer, rules.get(offer.provider) ?? NO_RULES, enrichment))
      .filter((product) => {
        if (includeOutOfStock) return true;
        const action = (rules.get(product.provider) ?? NO_RULES).zeroStockAction;
        if (!hidesZeroStockFromCatalog(action)) return true;
        return isDisplayedInStock(product.stock, 0);
      })
      .slice(0, limit);
    return this.withImageAiFlags(views);
  }

  /** Productos de una marca unificada, cruzando proveedores visibles. */
  async getByBrand(
    tenantId: string,
    brand: string,
    take: number,
    opts: { includeOutOfStock?: boolean } = {}
  ) {
    const providers = await this.readableProviders(tenantId);
    if (providers.length === 0) return [];
    const limit = Math.min(Math.max(take, 1), 200);
    const includeOutOfStock = Boolean(opts.includeOutOfStock);
    const [rules, enrichment, match] = await Promise.all([
      this.rulesByProvider(tenantId),
      this.catalogEnrichment.getContext(),
      this.catalogEnrichment.brandMatchFilters(brand),
    ]);

    const keepProviders = providers.filter(
      (p) => !hidesZeroStockFromCatalog((rules.get(p) ?? NO_RULES).zeroStockAction)
    );
    const hideProviders = providers.filter(
      (p) => hidesZeroStockFromCatalog((rules.get(p) ?? NO_RULES).zeroStockAction)
    );
    const stockOr = [
      ...(keepProviders.length ? [{ provider: { in: keepProviders } }] : []),
      ...(hideProviders.length
        ? [{ AND: [{ provider: { in: hideProviders } }, catalogStockWhere(false, 0, "HIDE")] }]
        : []),
    ];
    const stockConstraint = includeOutOfStock || stockOr.length === 0 ? [] : [{ OR: stockOr }];

    const offers = await this.prisma.tenantProductOffer.findMany({
      where: {
        tenantId,
        active: true,
        provider: { in: providers },
        AND: [
          ...stockConstraint,
          {
            OR: [
              { product: { brand: { in: match.rawBrands } } },
              {
                product: {
                  brand: { contains: brand, mode: "insensitive" as const },
                },
              },
              ...(match.eans.length ? [{ product: { ean: { in: match.eans } } }] : []),
              ...(match.partNumbers.length
                ? [{ product: { partNumber: { in: match.partNumbers } } }]
                : []),
            ],
          },
        ],
      },
      include: { product: true },
      orderBy: { product: { name: "asc" } },
      take: limit * 3,
    });

    const views = offers
      .filter((offer) =>
        this.catalogEnrichment.productMatchesBrand(offer.product, brand, enrichment)
      )
      .map((offer) =>
        toProductView(offer.product, offer, rules.get(offer.provider) ?? NO_RULES, enrichment)
      )
      .filter((product) => {
        if (includeOutOfStock) return true;
        const action = (rules.get(product.provider) ?? NO_RULES).zeroStockAction;
        if (!hidesZeroStockFromCatalog(action)) return true;
        return isDisplayedInStock(product.stock, 0);
      })
      .slice(0, limit);
    return this.withImageAiFlags(views);
  }

  /**
   * Marca productos cuya foto actual vino de Serper / Primera foto (no del proveedor).
   * Sirve para la leyenda de “imagen sugerida por IA” en búsqueda y ficha.
   */
  private async withImageAiFlags<T extends { provider: string; externalId: string; imageUrl?: string | null }>(
    products: T[],
  ): Promise<(T & { imageAiSelected: boolean })[]> {
    if (products.length === 0) return [];
    const withImg = products.filter((p) => Boolean(p.imageUrl?.trim()));
    if (withImg.length === 0) {
      return products.map((p) => ({ ...p, imageAiSelected: false }));
    }
    const fills = await this.prisma.imageSyncFill.findMany({
      where: {
        status: "filled",
        source: { in: ["serper", "serper_pick"] },
        OR: withImg.map((p) => ({ provider: p.provider, externalId: p.externalId })),
      },
      select: { provider: true, externalId: true },
    });
    const flagged = new Set(fills.map((f) => `${f.provider}::${f.externalId}`));
    return products.map((p) => ({
      ...p,
      imageAiSelected: Boolean(p.imageUrl?.trim()) && flagged.has(`${p.provider}::${p.externalId}`),
    }));
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
    // Los comercios que reciben precios por lista no sincronizan por API.
    const configs = await this.prisma.providerSyncConfig.findMany({
      where: { enabled: true, priceChannel: "API", tenant: { active: true } },
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

function numberOrUndefined(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
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
    manualIibbPercent: row.manualIibbPercent == null ? null : Number(row.manualIibbPercent),
    manualPerceptionsPercent: row.manualPerceptionsPercent == null ? null : Number(row.manualPerceptionsPercent),
    acceptsOffline: Boolean(row.acceptsOffline),
    acceptsScheme: Boolean(row.acceptsScheme),
    offlineIvaAdjustment: (row.offlineIvaAdjustment as IvaAdjustment | null | undefined) ?? null,
    schemeIvaAdjustment: (row.schemeIvaAdjustment as IvaAdjustment | null | undefined) ?? null,
  };
}
