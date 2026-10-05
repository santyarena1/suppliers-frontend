import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { resolveCatalogDisplay, type CatalogEnrichmentContext } from "../../catalog/catalog-enrichment";
import { CatalogEnrichmentService } from "../../catalog/catalog-enrichment.service";
import { NO_RULES, fichaRaw, type OfferRules } from "../../providers/catalog-view";
import { galleryFromRaw } from "./gallery";
import { displayedStock } from "../../providers/catalog-stock";
import { ProvidersService } from "../../providers/providers.service";
import { pricesAreStale } from "../../providers/sync-backoff";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantVisibilityService } from "../../tenants/tenant-visibility.service";
import type { CatalogRow, CatalogSnapshot, ProviderInfo } from "./catalog-row";
import { foldLabel, groupKeyFor, offerIdFor, productIdFor, providerAliasId } from "./ids";
import { costTaxLines, NO_PERCEPTIONS, type PerceptionPolicy } from "./pricing";
import { resolveSaleMargin } from "@nodo/shared";
import { SaleMarginRulesService, baseFor, type TenantSaleRules } from "../../pricing/sale-margin-rules.service";

/** La foto se reusa este tiempo: alcanza para paginar sin rearmar en cada página. */
const SNAPSHOT_TTL_MS = 60_000;
const MAX_SNAPSHOTS = 30;
const BATCH = 5_000;

const OFFER_SELECT = {
  id: true,
  provider: true,
  externalId: true,
  price: true,
  finalPrice: true,
  currency: true,
  ivaPercent: true,
  stock: true,
  stockStatus: true,
  source: true,
  syncedAt: true,
  updatedAt: true,
  product: {
    select: {
      provider: true,
      externalId: true,
      sku: true,
      partNumber: true,
      ean: true,
      name: true,
      brand: true,
      category: true,
      subcategory: true,
      description: true,
      longDescription: true,
      imageUrl: true,
      productUrl: true,
      warranty: true,
      weight: true,
      weightUnit: true,
      height: true,
      width: true,
      length: true,
      dimensionsUnit: true,
      volume: true,
      tags: true,
      raw: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.TenantProductOfferSelect;

type OfferWithProduct = Prisma.TenantProductOfferGetPayload<{ select: typeof OFFER_SELECT }>;

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * El catálogo del comercio tal como lo puede exponer la API: solo distribuidores
 * vinculados y visibles (nunca uno oculto por la plataforma), solo ofertas activas
 * con precio, y con las mismas reglas que la búsqueda de NODO (umbral de stock,
 * «ocultar sin precio», descuento de lista base). Se arma una vez por minuto por
 * comercio y se reusa entre keys y páginas.
 */
@Injectable()
export class CatalogSnapshotService {
  private readonly logger = new Logger(CatalogSnapshotService.name);
  private readonly cache = new Map<string, { at: number; snapshot: CatalogSnapshot }>();
  private readonly building = new Map<string, Promise<CatalogSnapshot>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProvidersService,
    private readonly visibility: TenantVisibilityService,
    private readonly enrichment: CatalogEnrichmentService,
    private readonly saleRules: SaleMarginRulesService
  ) {}

  async get(tenantId: string): Promise<CatalogSnapshot> {
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < SNAPSHOT_TTL_MS) return hit.snapshot;
    let pending = this.building.get(tenantId);
    if (!pending) {
      pending = this.build(tenantId).finally(() => this.building.delete(tenantId));
      this.building.set(tenantId, pending);
    }
    return pending;
  }

  invalidate(tenantId: string) {
    this.cache.delete(tenantId);
  }

  /** Distribuidores que la API puede exponer para este comercio, con su estado. */
  async providerInfo(tenantId: string): Promise<Map<string, ProviderInfo>> {
    return (await this.get(tenantId)).providers;
  }

  private async build(tenantId: string): Promise<CatalogSnapshot> {
    const started = Date.now();
    const visibles = (await this.visibility.listFor(tenantId)).filter((v) => v.linked && !v.platformHidden);
    const keys = visibles.map((v) => v.provider as string);
    const [rules, strict, configs, enrichment, aiImages, saleRules] = await Promise.all([
      this.providers.rulesByProvider(tenantId),
      this.providers.providersHidingUnsynced(tenantId, keys),
      this.prisma.providerSyncConfig.findMany({
        where: { tenantId, provider: { in: keys } },
        select: {
          provider: true,
          enabled: true,
          syncIntervalMinutes: true,
          lastSyncedAt: true,
          lastSyncError: true,
          consecutiveFailures: true,
          pausedAt: true,
          pauseReason: true,
          manualIibbPercent: true,
          manualPerceptionsPercent: true,
          learnedIibbPercent: true,
          createdAt: true,
        },
      }),
      this.enrichment.getContext(),
      this.aiImageKeys(keys),
      this.saleRules.get(tenantId),
    ]);
    const configBy = new Map(configs.map((c) => [c.provider, c]));
    const providers = this.providerInfos(tenantId, visibles, configBy);

    const rows: CatalogRow[] = [];
    let cursor: string | undefined;
    for (;;) {
      const batch: OfferWithProduct[] = await this.prisma.tenantProductOffer.findMany({
        where: {
          tenantId,
          provider: { in: keys },
          active: true,
          // Un precio 0 es "sin precio": no se puede comprar ni publicar.
          OR: [{ price: { gt: 0 } }, { finalPrice: { gt: 0 } }],
        },
        select: OFFER_SELECT,
        orderBy: { id: "asc" },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      for (const offer of batch) {
        const config = configBy.get(offer.provider);
        const policy: PerceptionPolicy = config
          ? {
              manualIibbPercent: num(config.manualIibbPercent),
              manualPerceptionsPercent: num(config.manualPerceptionsPercent),
              learnedIibbPercent: num(config.learnedIibbPercent),
            }
          : NO_PERCEPTIONS;
        const row = toRow(offer, rules.get(offer.provider) ?? NO_RULES, strict.has(offer.provider), policy, enrichment, aiImages, saleRules);
        if (row) rows.push(row);
      }
      if (batch.length < BATCH) break;
      cursor = batch[batch.length - 1].id;
    }

    const snapshot: CatalogSnapshot = { tenantId, builtAt: new Date(), rows, providers };
    if (this.cache.size >= MAX_SNAPSHOTS) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
    this.cache.set(tenantId, { at: Date.now(), snapshot });
    this.logger.debug(`Catálogo ${tenantId}: ${rows.length} ofertas en ${Date.now() - started} ms`);
    return snapshot;
  }

  private providerInfos(
    tenantId: string,
    visibles: { provider: string; name: string }[],
    configBy: Map<string, { createdAt: Date; enabled: boolean; syncIntervalMinutes: number; lastSyncedAt: Date | null; lastSyncError: string | null; consecutiveFailures: number; pausedAt: Date | null; pauseReason: string | null }>
  ): Map<string, ProviderInfo> {
    // "Proveedor N" sigue el orden de alta: no cambia aunque se sume otro distribuidor.
    const ordered = [...visibles].sort((a, b) => {
      const ca = configBy.get(a.provider)?.createdAt.getTime() ?? Number.MAX_SAFE_INTEGER;
      const cb = configBy.get(b.provider)?.createdAt.getTime() ?? Number.MAX_SAFE_INTEGER;
      return ca - cb || a.provider.localeCompare(b.provider);
    });
    const out = new Map<string, ProviderInfo>();
    ordered.forEach((v, i) => {
      const c = configBy.get(v.provider);
      out.set(v.provider, {
        key: v.provider,
        name: v.name,
        aliasId: providerAliasId(tenantId, v.provider),
        aliasName: `Proveedor ${i + 1}`,
        lastSyncedAt: c?.lastSyncedAt ?? null,
        stale: c ? pricesAreStale(c) : false,
        status: c?.pausedAt ? "paused" : c && c.consecutiveFailures > 0 && c.lastSyncError ? "error" : "ok",
        pauseReason: c?.pauseReason ?? null,
      });
    });
    return out;
  }

  /** Productos cuya foto eligió la búsqueda de imágenes (no la mandó el distribuidor). */
  private async aiImageKeys(providers: string[]): Promise<Set<string>> {
    if (providers.length === 0) return new Set();
    const rows = await this.prisma.imageSyncFill.findMany({
      where: { provider: { in: providers }, status: "filled", source: { in: ["serper", "serper_pick"] } },
      select: { provider: true, externalId: true },
    });
    return new Set(rows.map((r) => `${r.provider}:${r.externalId}`));
  }
}

/** De la fila de la base a la oferta resuelta. `null` si no tiene un costo publicable. */
export function toRow(
  offer: OfferWithProduct,
  rules: OfferRules,
  strictStock: boolean,
  policy: PerceptionPolicy,
  enrichment: CatalogEnrichmentContext | undefined,
  aiImages: Set<string>,
  saleRules?: TenantSaleRules
): CatalogRow | null {
  const p = offer.product;
  const discount = offer.source === "BASE_LIST" ? rules.baseListDiscountPercent ?? 0 : 0;
  const applyDiscount = (v: unknown) => {
    const n = num(v);
    return n == null ? null : discount ? n * (1 - discount / 100) : n;
  };
  const costNet = applyDiscount(offer.price);
  if (costNet == null || !(costNet > 0)) return null;
  const costListed = applyDiscount(offer.finalPrice);
  const ivaPercent = num(offer.ivaPercent);
  const display = resolveCatalogDisplay(p, enrichment);
  const brand = display.displayBrand ?? p.brand;
  const groupKey = groupKeyFor({ provider: offer.provider, externalId: offer.externalId, ean: p.ean, partNumber: p.partNumber, brand });
  const tags = (p.tags ?? "")
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    offerId: offerIdFor(offer.provider, offer.externalId),
    provider: offer.provider,
    externalId: offer.externalId,
    groupKey,
    productId: productIdFor(groupKey),
    sku: p.sku,
    partNumber: p.partNumber,
    ean: p.ean,
    name: p.name,
    brand,
    category: display.displayCategory ?? p.category,
    subcategory: display.displaySubcategory ?? p.subcategory,
    description: p.description,
    longDescription: p.longDescription,
    imageUrl: p.imageUrl?.trim() || null,
    gallery: galleryFromRaw(p.raw),
    imageAiSelected: aiImages.has(`${offer.provider}:${offer.externalId}`),
    productUrl: p.productUrl,
    warranty: p.warranty,
    weight: num(p.weight),
    weightUnit: p.weightUnit,
    height: num(p.height),
    width: num(p.width),
    length: num(p.length),
    dimensionsUnit: p.dimensionsUnit,
    volume: num(p.volume),
    tags,
    currency: (offer.currency || "USD").toUpperCase(),
    costNet,
    // La ficha es universal: los importes de la cuenta que la sincronizó no cuentan (igual que en la web).
    costTaxes: costTaxLines({ price: costNet, finalPrice: costListed, ivaPercent, raw: fichaRaw(offer.provider, p.raw) }, policy),
    ivaPercent,
    // Margen de venta con la categoría cruda del distribuidor (como la nombra él).
    saleMarginPercent: saleRules
      ? resolveSaleMargin(saleRules.rules, { provider: offer.provider, externalId: offer.externalId, category: p.category }).percent
      : 0,
    saleMarginBase: saleRules ? baseFor(saleRules, offer.provider) : "FINAL",
    stock: displayedStock(offer.stock, rules.minStockThreshold),
    stockStatus: offer.stockStatus,
    minStockThreshold: rules.minStockThreshold,
    strictStock,
    source: offer.source,
    syncedAt: offer.syncedAt,
    updatedAt: offer.updatedAt > p.updatedAt ? offer.updatedAt : p.updatedAt,
    searchText: foldLabel([p.name, brand, p.sku, p.partNumber, p.ean, offer.externalId].filter(Boolean).join(" ")),
  };
}
