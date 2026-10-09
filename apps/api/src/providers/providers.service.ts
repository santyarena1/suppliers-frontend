import { isDemoDistributorKey } from "../onboarding/onboarding-demo";
import { incompleteSyncMessage, missingActionIsSafe, shouldUnhideOnConfigChange } from "./missing-guard";
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import {
  isListProviderKey,
  providerLabel,
  parsePaymentOptions,
  parseShippingMethods,
  providerHasIvaRate,
  LIST_PROVIDER_PREFIX,
  type PaymentOption,
  type Provider,
  type ShippingMethod,
  providerHasCatalogAdapter,
} from "@nodo/shared";
import type { IvaAdjustment, OfferSource, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CatalogEnrichmentService } from "../catalog/catalog-enrichment.service";
import { CredentialsService } from "../credentials/credentials.service";
import { TenantVisibilityService } from "../tenants/tenant-visibility.service";
import { fichaRaw, NO_RULES, toProductView, toSheetView, type OfferRules, type ProductView } from "./catalog-view";
import { scoreCatalogMatch, searchTokens } from "./catalog-search";
import { snapshotJson } from "./json-value";
import {
  catalogHideEmptyOfferWhere,
  catalogPricedOnlyWhere,
  catalogStockWhere,
  hidesZeroStockFromCatalog,
  isDisplayedInStock,
} from "./catalog-stock";
import {
  fillPriceHistoryDays,
  argentinaDayKey,
  addCalendarDay,
  priceHistoryRetentionCutoff,
  pgDateToYmd,
  PRICE_DROP_LOOKBACK_DAYS,
} from "./price-history";
import { mergeProductImage } from "../images/product-image";
import { ProviderRegistry } from "./provider-registry";
import type { NormalizedProduct, ProviderAdapter } from "./types";
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
import { SYNC_MAX_FAILURES, isSyncDue, pricesAreStale, syncFailureReason } from "./sync-backoff";

/** Corridas RUNNING con latido más viejo que esto se dan por muertas al arrancar. */
const RESTART_GRACE_MS = 30_000;
const RESTART_RECHECK_MS = 60_000;
/** Fichas de Solution Box que se enriquecen por corrida (el portal limita con 429). */
const ENRICH_BATCH_SOLUTION_BOX = 150;
/** Con "faltantes = sin stock", lo que no aparece hace esta cantidad de días se da de baja. */
const ZOMBIE_DAYS = 14;
const DAY_MS = 24 * 60 * 60_000;

/** Lo que pasó en una corrida además de los diffs. */
type UpsertStats = { lostPrice: number };

/** Fallos ya contados por runSync: el cron no los vuelve a contar. */
const recordedFailures = new WeakSet<object>();

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
  /** POST manual: la corrida sigue en background; pollear `status.currentRun`. */
  accepted?: boolean;
  status?: string;
};

/** Cuántos productos devuelve una búsqueda, y cuántos se miran para elegirlos. */
const SEARCH_LIMIT = 200;
const SEARCH_CANDIDATES = 400;
const CATALOG_PAGE = 50;
const CATALOG_PAGE_MAX = 200;

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
    // En un deploy rolling la otra réplica puede estar sincronizando: solo se
    // cierran las corridas sin latido reciente (el latido es cada 5 s). Un rato
    // después se repasa, por las que murieron justo antes de este arranque.
    await interruptRunningCatalogSyncRuns(this.prisma, { olderThanMs: RESTART_GRACE_MS });
    const later = setTimeout(() => {
      void interruptRunningCatalogSyncRuns(this.prisma, { olderThanMs: RESTART_GRACE_MS }).catch(() => undefined);
    }, RESTART_RECHECK_MS);
    later.unref?.();
  }

  async getConfig(tenantId: string, provider: Provider) {
    const config = await this.prisma.providerSyncConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    const view = serializeSyncConfig(config ?? this.defaultConfig(tenantId, provider));
    if (!this.registry.get(provider)) return { ...view, priceChannel: "LIST" as const };
    return view;
  }

  /** Sin adapter (Ashir, HDC, Gaming City) el precio entra por la planilla de ese local. */
  private defaultPriceChannel(provider: Provider): "API" | "LIST" {
    if (isListProviderKey(provider) || !this.registry.get(provider)) return "LIST";
    return "API";
  }

  private defaultConfig(tenantId: string, provider: Provider) {
    return {
      id: null as string | null,
      tenantId,
      provider,
      enabled: false,
      syncIntervalMinutes: 60,
      priceChannel: this.defaultPriceChannel(provider),
      manualIibbPercent: null as number | null,
      manualPerceptionsPercent: null as number | null,
      paymentOptions: [] as PaymentOption[],
      shippingMethods: [] as ShippingMethod[],
      freeShippingFrom: null as number | null,
      freeShippingCurrency: null as "ARS" | "USD" | null,
      missingProductAction: "KEEP" as const,
      zeroStockAction: "KEEP" as const,
      hideUnsyncedCatalog: false,
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
    const priceChannel = this.registry.get(provider)
      ? (dto.priceChannel ?? current?.priceChannel ?? "API")
      : "LIST";
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
    const { paymentOptions, shippingMethods, freeShippingFrom, freeShippingCurrency, ...rest } = dto;
    // Envío gratis: monto > 0 con su moneda; 0 o vacío lo apaga.
    const free =
      freeShippingFrom === undefined
        ? {}
        : freeShippingFrom && freeShippingFrom > 0
          ? { freeShippingFrom, freeShippingCurrency: freeShippingCurrency ?? "ARS" }
          : { freeShippingFrom: null, freeShippingCurrency: null };
    const data = {
      ...rest,
      ...merged,
      priceChannel,
      ...(paymentOptions !== undefined
        ? { paymentOptions: snapshotJson(parsePaymentOptions(paymentOptions)) }
        : {}),
      ...(shippingMethods !== undefined
        ? { shippingMethods: snapshotJson(parseShippingMethods(shippingMethods)) }
        : {}),
      ...free,
    };
    const saved = await this.prisma.providerSyncConfig.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, ...data },
      update: data,
    });
    if (shouldUnhideOnConfigChange(current, saved)) {
      await this.prisma.tenantProductOffer.updateMany({
        where: { tenantId, provider, active: false },
        data: { active: true },
      });
    }
    return serializeSyncConfig(saved);
  }

  async sync(tenantId: string, provider: Provider, opts: { source?: CatalogSyncSource } = {}) {
    if (isDemoDistributorKey(provider)) {
      throw new BadRequestException("Es un distribuidor de ejemplo: con uno real, acá traés su catálogo con tu cuenta.");
    }
    await this.visibility.assertLinked(tenantId, provider);
    const adapter = this.registry.get(provider);
    if (!adapter) {
      throw new BadRequestException(
        `${provider} no tiene API. Los precios entran por el Excel de este comercio, en la pestaña Listas.`
      );
    }

    const stored = await this.credentials.findByProvider(tenantId, provider);
    if (!stored && !adapter.publicCatalog) {
      throw new NotFoundException(`No hay credenciales guardadas para ${provider}`);
    }

    const credentials = stored ? (JSON.parse(stored.credentialsJson) as Record<string, string>) : {};
    const source = opts.source ?? "manual";

    // El cron espera el resultado para loguear. El botón "Sincronizar ahora"
    // no: si el POST se queda colgado (proxy, 504, catálogo grande) la barra
    // del front nunca llega a pintar la corrida RUNNING.
    if (source === "cron") {
      return this.executeProviderSync(tenantId, provider, adapter, credentials, source);
    }

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
    await progress.touch();

    this.enqueueManualSync(tenantId, provider, adapter, credentials, source, progress);

    return {
      provider,
      runId: progress.runId,
      accepted: true,
      status: "RUNNING",
      synced: 0,
      created: 0,
      updated: 0,
      missingAffected: 0,
      zeroStockAffected: 0,
    };
  }

  /** Arranca después de mandar el 200, para que el POST no se quede preso del primer GET a Distecna. */
  private enqueueManualSync(
    tenantId: string,
    provider: Provider,
    adapter: ProviderAdapter,
    credentials: Record<string, string>,
    source: CatalogSyncSource,
    progress: CatalogSyncProgress
  ) {
    const start = () => {
      void this.executeProviderSync(tenantId, provider, adapter, credentials, source, progress).catch((err) => {
        this.logger.warn(`Sync en background de ${provider} falló: ${errorMessage(err)}`);
      });
    };
    if (typeof setImmediate === "function") setImmediate(start);
    else setTimeout(start, 0);
  }

  private async executeProviderSync(
    tenantId: string,
    provider: Provider,
    adapter: ProviderAdapter,
    credentials: Record<string, string>,
    source: CatalogSyncSource,
    progress?: CatalogSyncProgress
  ) {
    const syncedExternalIds: string[] = [];
    const result = await this.runSync(
      tenantId,
      provider,
      async (onPage, onMeta) => {
        await adapter.syncAll(
          credentials,
          async (items) => {
            syncedExternalIds.push(...items.map((i) => i.externalId));
            await onPage(items);
          },
          onMeta
        );
      },
      source,
      {},
      progress
    );

    // Enriquecimiento lento (ficha por producto): no bloquea el próximo sync
    // y se salta si ya hay uno corriendo para este proveedor+organización.
    if (adapter.enrichDetails) {
      const key = `${tenantId}:${provider}`;
      if (!this.enrichRunning.has(key)) {
        this.enrichRunning.add(key);
        const ids = await this.idsToEnrich(provider, syncedExternalIds);
        adapter
          .enrichDetails(credentials, ids, async (externalId, patch) => {
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
   * Qué fichas vale la pena enriquecer. Solution Box lee la ficha de a una: pedir
   * las 2000 en cada sync horaria lo hacía chocar con el límite del portal (429).
   * Ahí solo van las que todavía no tienen descripción, y como mucho un lote por
   * corrida. El resto de los proveedores enriquece también datos de la oferta
   * (stock de tienda, IVA) y sigue pidiendo todo.
   */
  private async idsToEnrich(provider: Provider, syncedIds: string[]): Promise<string[]> {
    if (provider !== "SOLUTION_BOX" || syncedIds.length === 0) return syncedIds;
    const missing = await this.prisma.providerSyncCache.findMany({
      where: { provider, externalId: { in: syncedIds }, longDescription: null },
      select: { externalId: true },
      orderBy: { syncedAt: "desc" },
      take: ENRICH_BATCH_SOLUTION_BOX,
    });
    return missing.map((m) => m.externalId);
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
    run: (
      onPage: (items: NormalizedProduct[]) => Promise<void>,
      onMeta: (meta: { expectedTotal?: number }) => Promise<void>
    ) => Promise<void>,
    source: CatalogSyncSource = "manual",
    opts: SyncOptions = {},
    existingProgress?: CatalogSyncProgress
  ): Promise<SyncResult> {
    const offerSource: OfferSource = opts.offerSource ?? "SYNC";
    const config = await this.getConfig(tenantId, provider);
    const minStock = config.minStockThreshold || 0;

    let progress: CatalogSyncProgress;
    if (existingProgress) {
      progress = existingProgress;
    } else {
      const expectedTotal = await this.prisma.tenantProductOffer.count({ where: { tenantId, provider } });
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
    }
    await progress.touch();

    const sourceFilter = offerSource === "SYNC" ? {} : { source: offerSource };
    const offersBefore = await this.prisma.tenantProductOffer.count({
      where: { tenantId, provider, active: true, ...sourceFilter },
    });
    const syncStartedAt = new Date();
    const stats: UpsertStats = { lostPrice: 0 };
    const beat = setInterval(() => {
      void progress.touch().catch(() => undefined);
    }, 5_000);

    try {
      await run(
        async (items) => {
          await this.upsertPage(tenantId, provider, items, progress, offerSource, stats);
        },
        async (meta) => {
          if (meta.expectedTotal != null) await progress.setExpectedTotal(meta.expectedTotal);
        }
      );
    } catch (err) {
      await progress.fail(errorMessage(err));
      if (offerSource === "SYNC") {
        await this.recordSyncFailure(tenantId, provider, err, source);
      } else {
        await this.prisma.providerSyncConfig.upsert({
          where: { tenantId_provider: { tenantId, provider } },
          create: { tenantId, provider, lastSyncError: errorMessage(err), priceChannel: this.defaultPriceChannel(provider) },
          update: { lastSyncError: errorMessage(err) },
        });
      }
      throw err;
    } finally {
      clearInterval(beat);
    }

    // Freno: una sincronización que trajo mucho menos no da de baja faltantes.
    const offersSeen = await this.prisma.tenantProductOffer.count({
      where: { tenantId, provider, syncedAt: { gte: syncStartedAt }, ...sourceFilter },
    });
    const missingSafe = missingActionIsSafe(offersBefore, offersSeen);
    // Queda como aviso en el panel (lastSyncError) en vez de limpiarse al terminar.
    const syncWarning =
      !missingSafe ? incompleteSyncMessage(offersBefore, offersSeen) : null;
    if (syncWarning) this.logger.warn(`${provider} (${tenantId}): ${syncWarning}`);
    // Recién con la corrida completa vuelve a mostrarse lo que llegó y estaba
    // oculto: una sync cortada a mitad no deshace las reglas de stock y faltantes.
    await this.prisma.tenantProductOffer.updateMany({
      where: { tenantId, provider, active: false, syncedAt: { gte: syncStartedAt }, ...sourceFilter },
      data: { active: true },
    });
    const missingCount = missingSafe
      ? await this.applyMissingProductAction(
          tenantId,
          provider,
          syncStartedAt,
          config.missingProductAction,
          offerSource,
          config.zeroStockAction
        )
      : 0;
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

    const lostPriceWarning =
      stats.lostPrice > 0
        ? `${stats.lostPrice} producto${stats.lostPrice === 1 ? "" : "s"} llegaron sin precio del proveedor y quedaron sin precio (no se muestran).`
        : null;
    const warning = [syncWarning, lostPriceWarning].filter(Boolean).join(" ") || null;
    const now = new Date();
    const okFields = {
      lastSyncedAt: now,
      lastAttemptAt: now,
      lastSyncError: warning,
      lastSyncCreated: created,
      lastSyncUpdated: updated,
      consecutiveFailures: 0,
      pausedAt: null,
      pauseReason: null,
    };
    await this.prisma.providerSyncConfig.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, priceChannel: this.defaultPriceChannel(provider), ...okFields },
      update: okFields,
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
   * Nunca queda a la vista con el precio viejo: KEEP y OUT_OF_STOCK (configs
   * anteriores) se tratan como HIDE. DELETE además lo borra. Si el proveedor lo
   * vuelve a mandar, la próxima sync OK lo muestra de nuevo.
   */
  private async applyMissingProductAction(
    tenantId: string,
    provider: Provider,
    syncStartedAt: Date,
    action: string,
    source: OfferSource = "SYNC",
    zeroStockAction = "KEEP"
  ) {
    if (action === "KEEP" || action === "OUT_OF_STOCK") action = "HIDE";
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
      // Sin stock, y si además se ocultan los de stock cero, oculto ya. Lo que el
      // proveedor dejó de mandar hace más de ZOMBIE_DAYS días se da de baja: si
      // no, quedaba para siempre con el precio de cuando desapareció.
      const hide = zeroStockAction === "HIDE" || zeroStockAction === "DELETE";
      const res = await this.prisma.tenantProductOffer.updateMany({
        where,
        data: hide ? { stock: 0, active: false } : { stock: 0 },
      });
      await this.prisma.tenantProductOffer.updateMany({
        where: { ...where, active: true, syncedAt: { lt: new Date(syncStartedAt.getTime() - ZOMBIE_DAYS * DAY_MS) } },
        data: { active: false },
      });
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
    offerSource: OfferSource = "SYNC",
    stats?: UpsertStats
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
            raw: fichaRaw(provider, item.raw) as object,
          };

          // Una lista es la verdad completa de la oferta: lo que no trae (stock,
          // moneda…) queda en null, no arrastra el valor de una carga anterior.
          // Un sync por API sí deja intacto lo que no manda (undefined = sin cambio).
          const fromList = offerSource !== "SYNC";
          const orNull = <T,>(v: T | undefined): T | null | undefined => (fromList ? (v ?? null) : v);
          const previous = previousByExternalId.get(item.externalId);
          // El proveedor mandó el producto pero sin ningún precio (cambió el
          // formato, campo vacío): no se deja el precio viejo con fecha nueva.
          const noPrice = !fromList && item.price === undefined && item.finalPrice === undefined;
          if (noPrice && previous && (previous.price != null || previous.finalPrice != null) && stats) stats.lostPrice++;
          const oferta = {
            price: noPrice ? null : orNull(item.price),
            finalPrice: noPrice ? null : orNull(item.finalPrice),
            currency: orNull(item.currency),
            ivaPercent: orNull(item.ivaPercent),
            stock: orNull(item.stock),
            stockStatus: orNull(item.stockStatus),
            needsResync: noPrice,
            source: offerSource,
          };

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
              price: oferta.price ?? undefined,
              finalPrice: oferta.finalPrice ?? undefined,
              currency: oferta.currency ?? undefined,
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
            // Nueva: visible. Existente: `active` no se toca acá; si estaba oculta y
            // volvió, se reactiva al terminar bien la corrida (ver runSync).
            create: { tenantId, provider, externalId: item.externalId, ...oferta, active: true },
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
    const [credential, total, withStock, last, currentRun, config] = await Promise.all([
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
      this.prisma.providerSyncConfig.findUnique({
        where: { tenantId_provider: { tenantId, provider } },
        select: {
          enabled: true,
          priceChannel: true,
          syncIntervalMinutes: true,
          lastSyncedAt: true,
          lastAttemptAt: true,
          lastSyncError: true,
          consecutiveFailures: true,
          pausedAt: true,
          pauseReason: true,
        },
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
      health: this.syncHealth(provider, config, total),
    };
  }

  /**
   * Estado de la sincronización para el comercio: si los precios están viejos,
   * si viene fallando o si se pausó, y el motivo en criollo.
   */
  private syncHealth(
    provider: Provider,
    config: {
      enabled: boolean;
      priceChannel: string;
      syncIntervalMinutes: number;
      lastSyncedAt: Date | null;
      lastAttemptAt: Date | null;
      lastSyncError: string | null;
      consecutiveFailures: number;
      pausedAt: Date | null;
      pauseReason: string | null;
    } | null,
    offers: number
  ) {
    if (!config || config.priceChannel !== "API" || !this.registry.get(provider)) return null;
    const failing = config.consecutiveFailures > 0;
    return {
      lastOkAt: config.lastSyncedAt,
      lastAttemptAt: config.lastAttemptAt,
      failing,
      consecutiveFailures: config.consecutiveFailures,
      failureReason: failing && config.lastSyncError ? syncFailureReason(config.lastSyncError) : null,
      paused: Boolean(config.pausedAt),
      pausedAt: config.pausedAt,
      pauseReason: config.pauseReason,
      autoSync: config.enabled,
      stalePrices: offers > 0 && pricesAreStale(config),
    };
  }

  /**
   * Una sync de proveedor falló: queda el intento y el contador para el backoff
   * del cron. Tras SYNC_MAX_FAILURES seguidos se pausa el auto-sync (el cron no lo
   * vuelve a intentar: se reactiva a mano) y se avisa al comercio. Los precios que
   * ya tenía siguen (con aviso de desactualizados).
   */
  async recordSyncFailure(tenantId: string, provider: Provider, err: unknown, source: CatalogSyncSource = "cron") {
    if (err && typeof err === "object") recordedFailures.add(err);
    const message = errorMessage(err);
    const now = new Date();
    const row = await this.prisma.providerSyncConfig.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: {
        tenantId,
        provider,
        priceChannel: this.defaultPriceChannel(provider),
        lastSyncError: message,
        lastAttemptAt: now,
        consecutiveFailures: 1,
      },
      update: { lastSyncError: message, lastAttemptAt: now, consecutiveFailures: { increment: 1 } },
    });
    if (!row.enabled || row.pausedAt || row.consecutiveFailures < SYNC_MAX_FAILURES) return;
    const reason = syncFailureReason(message);
    const paused = await this.prisma.providerSyncConfig.updateMany({
      where: { id: row.id, pausedAt: null },
      data: { pausedAt: now, pauseReason: reason },
    });
    if (paused.count === 0) return;
    this.logger.warn(`Auto-sync de ${provider} (${tenantId}) pausado tras ${row.consecutiveFailures} fallos (${source}): ${message}`);
    const name = providerLabel(provider);
    await this.prisma.orgNotification
      .create({
        data: {
          toTenantId: tenantId,
          fromTenantId: null,
          kind: "SYSTEM",
          title: `Sync pausado por error de ${name}`,
          body:
            `${reason} Falló ${row.consecutiveFailures} veces seguidas, así que la sincronización automática quedó pausada, no se reintenta sola y sus productos salieron del buscador. ` +
            `Para reactivarla, entrá a ${name} en Proveedores y tocá "Reactivar sincronización" (o revisá la cuenta si el problema es la clave). ` +
            `Al reactivarla y sincronizar bien, vuelven con precios al día.`,
          landingKey: `sync-paused:${provider}`,
        },
      })
      .catch((e) => this.logger.warn(`No se pudo avisar la pausa de ${provider}: ${errorMessage(e)}`));
  }

  /** El cron falló antes de arrancar la corrida (sin cuenta, sin vínculo): también cuenta para el backoff. */
  async noteCronFailure(tenantId: string, provider: Provider, err: unknown) {
    if (err && typeof err === "object" && recordedFailures.has(err)) return;
    if (/ya hay una sincronizaci/i.test(errorMessage(err))) return;
    await this.recordSyncFailure(tenantId, provider, err, "cron");
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
   * Vinculado, ve la ficha universal del distribuidor. El precio y el stock salen
   * solo de su oferta: si todavía no sincronizó su cuenta, el producto se lista
   * igual, sin importe ni stock. Nunca se lee la oferta de otro local.
   */
  async search(
    tenantId: string,
    provider: Provider,
    name: string,
    opts: { includeOutOfStock?: boolean; brand?: string; viewerUserId?: string } = {}
  ) {
    if (!(await this.visibility.canSearch(tenantId, provider, opts.viewerUserId))) return [];
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

    // Cada palabra tiene que aparecer, pero no pegada a las otras: "monitor msi"
    // tiene que traer también "MONITOR 24 MSI". La marca entra en el OR porque
    // hay proveedores que la dejan fuera del nombre.
    const tokens = searchTokens(q);
    const tokenClauses = tokens.map((t) => ({
      OR: [
        { name: { contains: t, mode: "insensitive" as const } },
        { brand: { contains: t, mode: "insensitive" as const } },
        // También por código: SKU, part number, EAN o el código del distribuidor.
        { sku: { contains: t, mode: "insensitive" as const } },
        { partNumber: { contains: t, mode: "insensitive" as const } },
        { ean: { contains: t, mode: "insensitive" as const } },
        { externalId: { contains: t, mode: "insensitive" as const } },
      ],
    }));
    const buscaPorNombre = (distinctQ || (!brand && q)) && tokenClauses.length > 0;

    const productWhere = {
      AND: [
        ...(brandClause ? [brandClause] : []),
        ...(buscaPorNombre ? tokenClauses : []),
      ],
    };

    const take = buscaPorNombre ? SEARCH_CANDIDATES : SEARCH_LIMIT;
    const [hidesUnsynced, priced] = await Promise.all([
      this.hidesUnsyncedCatalog(tenantId, provider),
      this.providersWithOwnPrices(tenantId, [provider]),
    ]);
    const hideSheets = hidesUnsynced || priced.has(provider);
    const [offers, sheets] = await Promise.all([
      this.prisma.tenantProductOffer.findMany({
        where: {
          tenantId,
          provider,
          active: true,
          AND: [
            ...(Object.keys(stockWhere).length ? [stockWhere] : []),
            ...(hidesUnsynced
              ? [catalogHideEmptyOfferWhere(rules.minStockThreshold, Boolean(opts.includeOutOfStock))]
              : []),
            ...catalogPricedOnlyWhere(priced),
            { product: productWhere },
          ],
        },
        include: { product: true },
        orderBy: { product: { name: "asc" } },
        take,
      }),
      hideSheets
        ? Promise.resolve([])
        : this.prisma.providerSyncCache.findMany({
            where: {
              provider,
              offers: { none: { tenantId } },
              AND: productWhere.AND,
            },
            orderBy: { name: "asc" },
            take,
          }),
    ]);

    const matchesBrand = (product: {
      provider: string;
      name: string;
      brand: string | null;
      category: string | null;
      subcategory: string | null;
      ean: string | null;
      partNumber: string | null;
    }) =>
      !brand ||
      this.catalogEnrichment.productMatchesBrand(product, brand, enrichment) ||
      product.name.toLowerCase().includes(brand.toLowerCase());

    const ranked = [
      ...offers
        .filter((offer) => matchesBrand(offer.product))
        .map((offer) => ({
          product: offer.product,
          score: buscaPorNombre ? scoreCatalogMatch(offer.product, q, tokens) : 0,
          view: toProductView(offer.product, offer, rules, enrichment),
        })),
      ...sheets
        .filter((product) => matchesBrand(product))
        .map((product) => ({
          product,
          score: buscaPorNombre ? scoreCatalogMatch(product, q, tokens) : 0,
          view: toSheetView(product, enrichment),
        })),
    ];

    if (buscaPorNombre) {
      ranked.sort(
        (a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name, "es")
      );
    }
    ranked.splice(SEARCH_LIMIT);

    const flagged = await this.withImageAiFlags(ranked.map((row) => row.view));
    return this.withPriceDropMeta(tenantId, flagged);
  }

  /**
   * Catálogo de un distribuidor tal como lo ve este local, paginado y con total:
   * la pestaña Catálogo de la ficha del proveedor. Sin texto lista todo, por
   * nombre. Mismas reglas que la búsqueda (stock, precio propio, visibilidad):
   * primero las ofertas del local y, si corresponde, las fichas sin oferta.
   */
  async listCatalog(
    tenantId: string,
    provider: Provider,
    opts: { q?: string; skip?: number; take?: number; includeOutOfStock?: boolean; viewerUserId?: string } = {}
  ) {
    if (!(await this.visibility.canReadCatalog(tenantId, provider, opts.viewerUserId))) {
      return { total: 0, items: [] as ProductView[] };
    }
    const skip = Math.max(0, Math.floor(opts.skip ?? 0));
    const take = Math.min(Math.max(Math.floor(opts.take ?? CATALOG_PAGE), 1), CATALOG_PAGE_MAX);
    const includeOutOfStock = Boolean(opts.includeOutOfStock);
    const [rules, enrichment, hidesUnsynced, priced] = await Promise.all([
      this.rulesFor(tenantId, provider),
      this.catalogEnrichment.getContext(),
      this.hidesUnsyncedCatalog(tenantId, provider),
      this.providersWithOwnPrices(tenantId, [provider]),
    ]);
    const stockWhere = catalogStockWhere(includeOutOfStock, rules.minStockThreshold, rules.zeroStockAction);
    const tokenClauses = searchTokens(opts.q ?? "").map((t) => ({
      OR: [
        { name: { contains: t, mode: "insensitive" as const } },
        { brand: { contains: t, mode: "insensitive" as const } },
        // También por código: SKU, part number, EAN o el código del distribuidor.
        { sku: { contains: t, mode: "insensitive" as const } },
        { partNumber: { contains: t, mode: "insensitive" as const } },
        { ean: { contains: t, mode: "insensitive" as const } },
        { externalId: { contains: t, mode: "insensitive" as const } },
      ],
    }));

    const offerWhere: Prisma.TenantProductOfferWhereInput = {
      tenantId,
      provider,
      active: true,
      AND: [
        ...(Object.keys(stockWhere).length ? [stockWhere] : []),
        ...(hidesUnsynced ? [catalogHideEmptyOfferWhere(rules.minStockThreshold, includeOutOfStock)] : []),
        ...catalogPricedOnlyWhere(priced),
        ...(tokenClauses.length ? [{ product: { AND: tokenClauses } }] : []),
      ],
    };
    const sheetWhere: Prisma.ProviderSyncCacheWhereInput | null =
      hidesUnsynced || priced.has(provider)
        ? null
        : { provider, offers: { none: { tenantId } }, AND: tokenClauses };

    const [offerTotal, sheetTotal] = await Promise.all([
      this.prisma.tenantProductOffer.count({ where: offerWhere }),
      sheetWhere ? this.prisma.providerSyncCache.count({ where: sheetWhere }) : Promise.resolve(0),
    ]);

    const views: ProductView[] = [];
    if (skip < offerTotal) {
      const offers = await this.prisma.tenantProductOffer.findMany({
        where: offerWhere,
        include: { product: true },
        orderBy: [{ product: { name: "asc" } }, { externalId: "asc" }],
        skip,
        take,
      });
      views.push(...offers.map((offer) => toProductView(offer.product, offer, rules, enrichment)));
    }
    const remaining = take - views.length;
    if (sheetWhere && remaining > 0) {
      const sheets = await this.prisma.providerSyncCache.findMany({
        where: sheetWhere,
        orderBy: [{ name: "asc" }, { externalId: "asc" }],
        skip: Math.max(0, skip - offerTotal),
        take: remaining,
      });
      views.push(...sheets.map((product) => toSheetView(product, enrichment)));
    }

    const flagged = await this.withImageAiFlags(views);
    return { total: offerTotal + sheetTotal, items: await this.withPriceDropMeta(tenantId, flagged) };
  }

  /** Producto individual — soporta entrar directo por link, sin depender del caché de búsqueda del frontend. */
  async getProduct(tenantId: string, provider: Provider, externalId: string, viewerUserId?: string) {
    if (!(await this.visibility.canReadCatalog(tenantId, provider, viewerUserId))) return null;
    const [offer, enrichment] = await Promise.all([
      this.prisma.tenantProductOffer.findUnique({
        where: { tenantId_provider_externalId: { tenantId, provider, externalId } },
        include: { product: true },
      }),
      this.catalogEnrichment.getContext(),
    ]);
    if (offer) {
      const rules = await this.rulesFor(tenantId, provider);
      const [view] = await this.withImageAiFlags([
        toProductView(offer.product, offer, rules, enrichment),
      ]);
      return view;
    }
    const sheet = await this.prisma.providerSyncCache.findUnique({
      where: { provider_externalId: { provider, externalId } },
    });
    if (!sheet) return null;
    const [view] = await this.withImageAiFlags([toSheetView(sheet, enrichment)]);
    return view;
  }

  /**
   * Serie de precios real de esta organización (solo puntos donde el precio
   * efectivamente cambió). Se guarda cruda, así que el markup se aplica al leer y
   * el gráfico sigue el precio de venta actual. Ventana máxima: 12 meses.
   */
  async getPriceHistory(
    tenantId: string,
    provider: Provider,
    externalId: string,
    opts: { from?: Date; to?: Date } = {}
  ) {
    const now = new Date();
    const retentionStart = priceHistoryRetentionCutoff(now);
    const to = opts.to && opts.to.getTime() < now.getTime() ? opts.to : now;
    const fromRaw = opts.from && !Number.isNaN(opts.from.getTime()) ? opts.from : retentionStart;
    const from = fromRaw.getTime() < retentionStart.getTime() ? retentionStart : fromRaw;

    const [points, before, offer] = await Promise.all([
      this.prisma.productPriceHistory.findMany({
        where: {
          tenantId,
          provider,
          externalId,
          capturedAt: { gte: from, lte: to },
        },
        orderBy: { capturedAt: "asc" },
        select: { price: true, finalPrice: true, currency: true, capturedAt: true },
      }),
      // Precio vigente al inicio del rango (último cambio anterior).
      this.prisma.productPriceHistory.findFirst({
        where: {
          tenantId,
          provider,
          externalId,
          capturedAt: { lt: from, gte: retentionStart },
        },
        orderBy: { capturedAt: "desc" },
        select: { price: true, finalPrice: true, currency: true, capturedAt: true },
      }),
      this.prisma.tenantProductOffer.findUnique({
        where: { tenantId_provider_externalId: { tenantId, provider, externalId } },
        select: { price: true, finalPrice: true, currency: true, syncedAt: true },
      }),
    ]);

    const raw = before ? [before, ...points] : points;
    const serie = raw.map((point, idx) => ({
      price: roundPrice(point.price),
      finalPrice: roundPrice(point.finalPrice),
      currency: point.currency,
      // El punto “antes del rango” se ancla al inicio para no alargar la serie hacia atrás.
      capturedAt: before && idx === 0 ? from : point.capturedAt,
    }));

    // El precio vigente es el último tramo de la serie hasta `to`.
    if (offer && (offer.price != null || offer.finalPrice != null)) {
      const ultimo = serie[serie.length - 1];
      const vigenteAt = offer.syncedAt.getTime() > to.getTime() ? to : offer.syncedAt;
      const hoy = {
        price: roundPrice(offer.price),
        finalPrice: roundPrice(offer.finalPrice),
        currency: offer.currency,
        capturedAt: vigenteAt,
      };
      if (!ultimo || ultimo.capturedAt.getTime() < hoy.capturedAt.getTime()) serie.push(hoy);
    }

    const filled = fillPriceHistoryDays(serie, to);
    const fromKey = argentinaDayKey(from);
    return filled.filter((p) => argentinaDayKey(p.capturedAt) >= fromKey);
  }

  /** Borra historial más viejo que 12 meses. */
  async purgeOldPriceHistory() {
    const cutoff = priceHistoryRetentionCutoff();
    const res = await this.prisma.productPriceHistory.deleteMany({
      where: { capturedAt: { lt: cutoff } },
    });
    return { deleted: res.count, cutoff };
  }

  /** Este local eligió no ver fichas de este distribuidor hasta sincronizar su cuenta. */
  private async hidesUnsyncedCatalog(tenantId: string, provider: string): Promise<boolean> {
    const hidden = await this.providersHidingUnsynced(tenantId, [provider]);
    return hidden.has(provider);
  }

  async providersHidingUnsynced(tenantId: string, providers: string[]): Promise<Set<string>> {
    if (providers.length === 0) return new Set();
    const rows = await this.prisma.providerSyncConfig.findMany({
      where: { tenantId, provider: { in: providers }, hideUnsyncedCatalog: true },
      select: { provider: true },
    });
    return new Set(rows.map((row) => row.provider));
  }

  /**
   * Proveedores en los que solo se lista lo que tiene precio propio del comercio.
   * Son todos: un proveedor sin credenciales ni lista cargada no muestra nada,
   * ni siquiera la ficha universal "sin precio" como vista previa. Lo que no se
   * puede comprar no aparece en búsqueda, catálogo, categorías ni marcas.
   */
  private async providersWithOwnPrices(_tenantId: string, providers: string[]): Promise<Set<string>> {
    return new Set(providers);
  }

  /**
   * Con el interruptor activo, una oferta que el distribuidor mandó sin precio
   * o sin stock no entra al listado. El resto de los distribuidores no cambia.
   */
  private emptyOfferConstraint(
    providers: string[],
    hidden: Set<string>,
    rules: Map<string, OfferRules>,
    includeOutOfStock: boolean
  ) {
    const strict = providers.filter((provider) => hidden.has(provider));
    if (strict.length === 0) return [];
    return [
      {
        OR: [
          { provider: { notIn: strict } },
          ...strict.map((provider) => ({
            AND: [
              { provider },
              catalogHideEmptyOfferWhere(
                (rules.get(provider) ?? NO_RULES).minStockThreshold,
                includeOutOfStock
              ),
            ],
          })),
        ],
      },
    ];
  }

  /** Umbral de stock y descuento de lista configurados por la organización para un proveedor. */
  private async rulesFor(tenantId: string, provider: Provider): Promise<OfferRules> {
    const [config, baseListDiscountPercent] = await Promise.all([
      this.prisma.providerSyncConfig.findUnique({
        where: { tenantId_provider: { tenantId, provider } },
        select: { minStockThreshold: true, zeroStockAction: true },
      }),
      this.baseListDiscountFor(tenantId, provider),
    ]);
    if (!config) return { ...NO_RULES, baseListDiscountPercent };
    return {
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
  async rulesByProvider(tenantId: string): Promise<Map<string, OfferRules>> {
    const [configs, listLinks] = await Promise.all([
      this.prisma.providerSyncConfig.findMany({
        where: { tenantId },
        select: { provider: true, minStockThreshold: true, zeroStockAction: true },
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

  /**
   * Categorías distintas con conteo, cruzando todos los proveedores visibles — para la
   * landing de Búsqueda.
   *
   * Va en SQL crudo porque hay que agrupar por un campo de la ficha contando ofertas
   * de la organización, y el `groupBy` de Prisma no cruza tablas: la alternativa era
   * traerse el catálogo entero a memoria para contarlo acá.
   */
  async getCategories(tenantId: string, viewerUserId?: string) {
    const providers = await this.readableProviders(tenantId, viewerUserId);
    if (providers.length === 0) return [];
    const priced = [...(await this.providersWithOwnPrices(tenantId, providers))];
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
        AND (oferta.provider <> ALL(${priced}::text[]) OR oferta.price > 0 OR oferta."finalPrice" > 0)
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
  async getBrands(tenantId: string, viewerUserId?: string) {
    const providers = await this.readableProviders(tenantId, viewerUserId);
    if (providers.length === 0) return [];
    const priced = [...(await this.providersWithOwnPrices(tenantId, providers))];
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
        AND (oferta.provider <> ALL(${priced}::text[]) OR oferta.price > 0 OR oferta."finalPrice" > 0)
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
   * Landing / “Ver todas”: bajas de los últimos {@link PRICE_DROP_LOOKBACK_DAYS}
   * días (AR). Prioriza el día más reciente y completa con jornadas anteriores
   * hasta `take`. `all` queda por compat (misma ventana).
   */
  async getFeatured(tenantId: string, take: number, opts: { mixed?: boolean; all?: boolean; viewerUserId?: string } = {}) {
    void opts.all;
    const providers = await this.readableProviders(tenantId, opts.viewerUserId);
    if (providers.length === 0) return [];
    const limit = Math.min(Math.max(take, 1), 300);
    const [rules, enrichment] = await Promise.all([
      this.rulesByProvider(tenantId),
      this.catalogEnrichment.getContext(),
    ]);

    const drops = await this.findRecentPriceDrops(tenantId, providers, limit);

    const dropViews = drops
      .map((d) => {
        const view = toProductView(d.offer.product, d.offer, rules.get(d.offer.provider) ?? NO_RULES, enrichment);
        const prevPrice = roundPrice(d.previousPrice);
        const prevFinal = roundPrice(d.previousFinalPrice);
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
          priceDroppedOn: d.droppedOn,
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
   * Bajas (un punto por día AR vs el día anterior con dato) dentro de la
   * ventana de 7 días. Incluye primero el día más reciente y completa con
   * jornadas previas hasta `take`. Un producto entra una sola vez (su baja
   * más reciente en la ventana).
   */
  private async findRecentPriceDrops(
    tenantId: string,
    providers: string[],
    take: number,
  ) {
    if (take <= 0 || providers.length === 0) return [];

    type DropRow = {
      provider: string;
      externalId: string;
      previousPrice: unknown;
      previousFinalPrice: unknown;
      day: Date;
    };

    const today = argentinaDayKey(new Date());
    const cutoff = addCalendarDay(today, -(PRICE_DROP_LOOKBACK_DAYS - 1));

    // Pedimos de más para poder completar día a día sin quedarnos cortos
    // si un mismo SKU aparece en varias jornadas (DISTINCT lo aplana después).
    const fetchLimit = Math.min(Math.max(take * 4, take), 1200);

    const rows = await this.prisma.$queryRaw<DropRow[]>`
      WITH daily AS (
        SELECT DISTINCT ON (
          h.provider,
          h."externalId",
          ((h."capturedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        )
          h.provider,
          h."externalId",
          h.price,
          h."finalPrice",
          h."capturedAt",
          ((h."capturedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS day
        FROM "ProductPriceHistory" h
        WHERE h."tenantId" = ${tenantId}
          AND h.provider = ANY(${providers}::text[])
          AND ((h."capturedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
            >= (${cutoff}::date - 14)
        ORDER BY
          h.provider,
          h."externalId",
          ((h."capturedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
          h."capturedAt" DESC
      ),
      compared AS (
        SELECT
          d.*,
          LAG(d.price) OVER (PARTITION BY d.provider, d."externalId" ORDER BY d.day) AS prev_price,
          LAG(d."finalPrice") OVER (PARTITION BY d.provider, d."externalId" ORDER BY d.day) AS prev_final
        FROM daily d
      ),
      drops AS (
        SELECT *
        FROM compared
        WHERE
          day >= ${cutoff}::date
          AND (
            (prev_final IS NOT NULL AND "finalPrice" IS NOT NULL AND "finalPrice" < prev_final)
            OR (
              prev_final IS NULL AND prev_price IS NOT NULL AND price IS NOT NULL
              AND price < prev_price
            )
          )
      ),
      scored AS (
        SELECT
          d.provider,
          d."externalId",
          d.prev_price AS "previousPrice",
          d.prev_final AS "previousFinalPrice",
          d.day,
          CASE
            WHEN d.prev_final IS NOT NULL AND d."finalPrice" IS NOT NULL AND d.prev_final > 0
              THEN (d.prev_final - d."finalPrice") / d.prev_final
            WHEN d.prev_price IS NOT NULL AND d.price IS NOT NULL AND d.prev_price > 0
              THEN (d.prev_price - d.price) / d.prev_price
            ELSE 0
          END AS drop_pct
        FROM drops d
        INNER JOIN "TenantProductOffer" o
          ON o."tenantId" = ${tenantId}
          AND o.provider = d.provider
          AND o."externalId" = d."externalId"
          AND o.active
          AND o.stock > 0
      ),
      -- Una fila por producto: la baja más reciente en la ventana.
      picked AS (
        SELECT DISTINCT ON (provider, "externalId")
          provider,
          "externalId",
          "previousPrice",
          "previousFinalPrice",
          day,
          drop_pct
        FROM scored
        ORDER BY provider, "externalId", day DESC
      )
      SELECT provider, "externalId", "previousPrice", "previousFinalPrice", day
      FROM picked
      -- Primero hoy, después ayer, …; dentro del día, mayor %.
      ORDER BY day DESC, drop_pct DESC
      LIMIT ${fetchLimit}
    `;

    if (rows.length === 0) return [];

    // Completar hasta `take` respetando el orden día→% (ya viene ordenado).
    const chosen: DropRow[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const key = `${r.provider}::${r.externalId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chosen.push(r);
      if (chosen.length >= take) break;
    }

    const offers = await this.prisma.tenantProductOffer.findMany({
      where: {
        tenantId,
        active: true,
        OR: chosen.map((r) => ({ provider: r.provider, externalId: r.externalId })),
      },
      include: { product: true },
    });

    const byKey = new Map(offers.map((o) => [`${o.provider}::${o.externalId}`, o] as const));

    return chosen.flatMap((r) => {
      const offer = byKey.get(`${r.provider}::${r.externalId}`);
      if (!offer) return [];
      return [{
        provider: r.provider,
        externalId: r.externalId,
        previousPrice: numberOrNull(r.previousPrice),
        previousFinalPrice: numberOrNull(r.previousFinalPrice),
        droppedOn: pgDateToYmd(r.day),
        offer,
      }];
    });
  }

  /**
   * Para resultados de búsqueda / catálogo: adjunta baja % si el SKU bajó
   * en los últimos {@link PRICE_DROP_LOOKBACK_DAYS} días.
   */
  private async withPriceDropMeta<
    T extends {
      provider: string;
      externalId: string;
      price?: number | null;
      finalPrice?: number | null;
      previousPrice?: number | null;
      previousFinalPrice?: number | null;
      priceDropPercent?: number | null;
      priceDroppedOn?: string | null;
    },
  >(tenantId: string, products: T[]): Promise<T[]> {
    if (products.length === 0) return products;
    const keys = products.map((p) => `${p.provider}::${p.externalId}`);
    const today = argentinaDayKey(new Date());
    const cutoff = addCalendarDay(today, -(PRICE_DROP_LOOKBACK_DAYS - 1));
    const rules = await this.rulesByProvider(tenantId);

    type DropRow = {
      provider: string;
      externalId: string;
      previousPrice: unknown;
      previousFinalPrice: unknown;
      day: Date;
      dropPct: unknown;
    };

    const rows = await this.prisma.$queryRaw<DropRow[]>`
      WITH daily AS (
        SELECT DISTINCT ON (
          h.provider,
          h."externalId",
          ((h."capturedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        )
          h.provider,
          h."externalId",
          h.price,
          h."finalPrice",
          h."capturedAt",
          ((h."capturedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS day
        FROM "ProductPriceHistory" h
        WHERE h."tenantId" = ${tenantId}
          AND (h.provider || '::' || h."externalId") = ANY(${keys}::text[])
          AND ((h."capturedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
            >= (${cutoff}::date - 14)
        ORDER BY
          h.provider,
          h."externalId",
          ((h."capturedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
          h."capturedAt" DESC
      ),
      compared AS (
        SELECT
          d.*,
          LAG(d.price) OVER (PARTITION BY d.provider, d."externalId" ORDER BY d.day) AS prev_price,
          LAG(d."finalPrice") OVER (PARTITION BY d.provider, d."externalId" ORDER BY d.day) AS prev_final
        FROM daily d
      ),
      drops AS (
        SELECT *
        FROM compared
        WHERE
          day >= ${cutoff}::date
          AND (
            (prev_final IS NOT NULL AND "finalPrice" IS NOT NULL AND "finalPrice" < prev_final)
            OR (
              prev_final IS NULL AND prev_price IS NOT NULL AND price IS NOT NULL
              AND price < prev_price
            )
          )
      ),
      picked AS (
        SELECT DISTINCT ON (provider, "externalId")
          provider,
          "externalId",
          prev_price AS "previousPrice",
          prev_final AS "previousFinalPrice",
          day,
          CASE
            WHEN prev_final IS NOT NULL AND "finalPrice" IS NOT NULL AND prev_final > 0
              THEN (prev_final - "finalPrice") / prev_final
            WHEN prev_price IS NOT NULL AND price IS NOT NULL AND prev_price > 0
              THEN (prev_price - price) / prev_price
            ELSE 0
          END AS "dropPct"
        FROM drops
        ORDER BY provider, "externalId", day DESC
      )
      SELECT * FROM picked
    `;

    if (rows.length === 0) {
      return products.map((p) => ({
        ...p,
        previousPrice: null,
        previousFinalPrice: null,
        priceDropPercent: null,
        priceDroppedOn: null,
      }));
    }

    const byKey = new Map(
      rows.map((r) => [
        `${r.provider}::${r.externalId}`,
        {
          previousPrice: numberOrNull(r.previousPrice),
          previousFinalPrice: numberOrNull(r.previousFinalPrice),
          droppedOn: pgDateToYmd(r.day),
          dropPct: numberOrNull(r.dropPct),
        },
      ] as const),
    );

    return products.map((p) => {
      const drop = byKey.get(`${p.provider}::${p.externalId}`);
      if (!drop) {
        return {
          ...p,
          previousPrice: null,
          previousFinalPrice: null,
          priceDropPercent: null,
          priceDroppedOn: null,
        };
      }
      const priceDropPercent =
        drop.dropPct != null && drop.dropPct > 0
          ? Math.round(drop.dropPct * 1000) / 10
          : null;
      return {
        ...p,
        previousPrice: roundPrice(drop.previousPrice),
        previousFinalPrice: roundPrice(drop.previousFinalPrice),
        priceDropPercent,
        priceDroppedOn: drop.droppedOn,
      };
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
          where: {
            tenantId,
            provider,
            active: true,
            stock: { gt: 0 },
            OR: [{ price: { gt: 0 } }, { finalPrice: { gt: 0 } }],
          },
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
    opts: { includeOutOfStock?: boolean; viewerUserId?: string } = {}
  ) {
    const providers = await this.readableProviders(tenantId, opts.viewerUserId);
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
    const [hidden, priced] = await Promise.all([
      this.providersHidingUnsynced(tenantId, providers),
      this.providersWithOwnPrices(tenantId, providers),
    ]);

    const offers = await this.prisma.tenantProductOffer.findMany({
      where: {
        tenantId,
        active: true,
        provider: { in: providers },
        AND: [
          ...stockConstraint,
          ...this.emptyOfferConstraint(providers, hidden, rules, includeOutOfStock),
          ...catalogPricedOnlyWhere(priced),
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
    const flagged = await this.withImageAiFlags(views);
    return this.withPriceDropMeta(tenantId, flagged);
  }

  /** Productos de una marca unificada, cruzando proveedores visibles. */
  /**
   * Catálogo de uno o varios distribuidores, sin texto ni marca ni categoría.
   *
   * Existía por marca y por categoría, pero no por distribuidor solo: elegir un
   * distribuidor y tocar Buscar no devolvía nada. Es la misma consulta que
   * getByBrand sin el filtro de marca.
   */
  async getByProvider(
    tenantId: string,
    providersWanted: string[],
    take: number,
    opts: { includeOutOfStock?: boolean; viewerUserId?: string } = {}
  ) {
    const readable = await this.readableProviders(tenantId, opts.viewerUserId);
    const wanted = providersWanted.length ? new Set(providersWanted) : null;
    const providers = wanted ? readable.filter((p) => wanted.has(p)) : readable;
    if (providers.length === 0) return [];
    const limit = Math.min(Math.max(take, 1), 200);
    const includeOutOfStock = Boolean(opts.includeOutOfStock);
    const [rules, enrichment] = await Promise.all([
      this.rulesByProvider(tenantId),
      this.catalogEnrichment.getContext(),
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
    const [hidden, priced] = await Promise.all([
      this.providersHidingUnsynced(tenantId, providers),
      this.providersWithOwnPrices(tenantId, providers),
    ]);

    const offers = await this.prisma.tenantProductOffer.findMany({
      where: {
        tenantId,
        active: true,
        provider: { in: providers },
        AND: [
          ...stockConstraint,
          ...this.emptyOfferConstraint(providers, hidden, rules, includeOutOfStock),
          ...catalogPricedOnlyWhere(priced),
        ],
      },
      include: { product: true },
      orderBy: { product: { name: "asc" } },
      take: limit * 2,
    });

    const views = offers
      .map((offer) =>
        toProductView(offer.product, offer, rules.get(offer.provider) ?? NO_RULES, enrichment)
      )
      .filter((product) => {
        if (includeOutOfStock) return true;
        const action = (rules.get(product.provider) ?? NO_RULES).zeroStockAction;
        if (!hidesZeroStockFromCatalog(action)) return true;
        return isDisplayedInStock(product.stock, 0);
      });
    if (views.length < limit) {
      const visible = providers.filter((provider) => !hidden.has(provider) && !priced.has(provider));
      if (visible.length > 0) {
        const sheets = await this.prisma.providerSyncCache.findMany({
          where: { provider: { in: visible }, offers: { none: { tenantId } } },
          orderBy: { name: "asc" },
          take: limit - views.length,
        });
        views.push(...sheets.map((product) => toSheetView(product, enrichment)));
      }
    }
    const flagged = await this.withImageAiFlags(views.slice(0, limit));
    return this.withPriceDropMeta(tenantId, flagged);
  }

  async getByBrand(
    tenantId: string,
    brand: string,
    take: number,
    opts: { includeOutOfStock?: boolean; providers?: string[]; viewerUserId?: string } = {}
  ) {
    // Si el comercio filtró por distribuidor, se busca solo ahí: así el tope de
    // resultados no deja afuera a un proveedor cuyos nombres ordenan al final.
    const readable = await this.readableProviders(tenantId, opts.viewerUserId);
    const wanted = opts.providers?.length ? new Set(opts.providers) : null;
    const providers = wanted ? readable.filter((p) => wanted.has(p)) : readable;
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
    const [hidden, priced] = await Promise.all([
      this.providersHidingUnsynced(tenantId, providers),
      this.providersWithOwnPrices(tenantId, providers),
    ]);

    const offers = await this.prisma.tenantProductOffer.findMany({
      where: {
        tenantId,
        active: true,
        provider: { in: providers },
        AND: [
          ...stockConstraint,
          ...this.emptyOfferConstraint(providers, hidden, rules, includeOutOfStock),
          ...catalogPricedOnlyWhere(priced),
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
    const flagged = await this.withImageAiFlags(views);
    return this.withPriceDropMeta(tenantId, flagged);
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
   * vinculados, menos los que el superadmin escondió de toda la plataforma
   * (salvo lo que el comercio cargó con su propia lista) y menos los que quedan
   * fuera del buscador por el tope del plan Base.
   */
  private async readableProviders(tenantId: string, viewerUserId?: string): Promise<string[]> {
    return this.visibility.searchableCatalogKeys(tenantId, viewerUserId);
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
    const now = new Date();
    // Sin integración (Ashir, GC, HDC) no hay portal: una config vieja en API no se intenta.
    return configs.filter((c) => providerHasCatalogAdapter(c.provider) && isSyncDue(c, now));
  }
}

function roundPrice(value: unknown): number | null {
  const price = numberOrNull(value);
  if (price == null) return null;
  return Math.round(price * 100) / 100;
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
    paymentOptions: parsePaymentOptions(row.paymentOptions),
    shippingMethods: parseShippingMethods(row.shippingMethods),
    freeShippingFrom: row.freeShippingFrom == null ? null : Number(row.freeShippingFrom),
    freeShippingCurrency: row.freeShippingFrom == null ? null : ((row.freeShippingCurrency as "ARS" | "USD" | null | undefined) ?? "ARS"),
    acceptsOffline: Boolean(row.acceptsOffline),
    acceptsScheme: Boolean(row.acceptsScheme),
    hideUnsyncedCatalog: Boolean(row.hideUnsyncedCatalog),
    offlineIvaAdjustment: (row.offlineIvaAdjustment as IvaAdjustment | null | undefined) ?? null,
    schemeIvaAdjustment: (row.schemeIvaAdjustment as IvaAdjustment | null | undefined) ?? null,
  };
}
