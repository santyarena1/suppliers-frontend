import type { ApiClientConfig } from "@nodo/shared";
import type { CatalogRow, ProviderInfo } from "./catalog-row";
import { cleanGtin, foldLabel, slugId } from "./ids";
import { priceOffer, type ApiPrice, type Converter } from "./pricing";
import { imagesOf } from "./gallery";

export type StockStatus = "in_stock" | "low" | "out_of_stock" | "unknown";

export interface OfferView {
  id: string;
  productId: string;
  provider: { id: string; name: string; key?: string };
  sku: string | null;
  externalId?: string;
  stock: { quantity: number | null; status: StockStatus; minThresholdApplied: number };
  price: ApiPrice | null;
  freshness: { syncedAt: string; stale: boolean; providerSync: ProviderInfo["status"] };
  updatedAt: string;
  /** Solo en la vista por oferta: los datos del producto para no tener que pedirlo aparte. */
  product?: ProductSummary;
}

export interface ProductSummary {
  name: string;
  brand: { id: string; name: string } | null;
  category: { id: string; name: string; path: string[] } | null;
  ean: string | null;
  partNumber: string | null;
  imageUrl: string | null;
  /** Todas las fotos: la principal primero y después la galería del distribuidor. */
  images: string[];
}

export interface ProductView {
  id: string;
  name: string;
  brand: { id: string; name: string } | null;
  category: { id: string; name: string; path: string[] } | null;
  subcategory: { id: string; name: string; path: string[] } | null;
  ean: string | null;
  partNumber: string | null;
  sku: string | null;
  description: string | null;
  longDescription: string | null;
  images: { url: string; source: "provider" | "ai_suggested" }[];
  specs: {
    warranty: string | null;
    weight: { value: number; unit: string | null } | null;
    dimensions: { height: number | null; width: number | null; length: number | null; unit: string | null } | null;
    volume: number | null;
  };
  tags: string[];
  links: { provider: string[] };
  availability: { inStock: boolean; totalStock: number | null; offers: number };
  bestOffer: OfferView | null;
  priceRange: { min: number; max: number; currency: string } | null;
  offers: OfferView[];
  updatedAt: string;
}

/** Lo que necesita la proyección además de la config: alias y conversión de moneda. */
export interface ProjectionContext {
  config: ApiClientConfig;
  providers: Map<string, ProviderInfo>;
  convert: Converter;
}

/** ¿Entra esta oferta para esta key? (distribuidores elegidos y stock). */
export function rowVisibleForKey(row: CatalogRow, config: ApiClientConfig): boolean {
  if (config.providers.mode === "only" && !config.providers.keys.includes(row.provider)) return false;
  if (config.includeOutOfStock) return true;
  if (row.strictStock && row.stock == null) return false;
  if (row.stock == null) return true;
  return row.stock >= Math.max(1, config.minStock);
}

export function stockStatus(row: Pick<CatalogRow, "stock" | "stockStatus">): StockStatus {
  const text = foldLabel(row.stockStatus ?? "");
  if (row.stock === 0 || /^sin\b|agotad|out/.test(text)) return "out_of_stock";
  if (/bajo|low|poco|ultim/.test(text)) return "low";
  if (row.stock != null && row.stock > 0) return "in_stock";
  return text ? "in_stock" : "unknown";
}

function categoryRef(category: string | null, subcategory: string | null) {
  const cat = category?.trim() ? { id: slugId("cat", category), name: category.trim(), path: [category.trim()] } : null;
  const sub =
    subcategory?.trim() && cat
      ? { id: slugId("cat", `${category}>${subcategory}`), name: subcategory.trim(), path: [cat.name, subcategory.trim()] }
      : null;
  return { cat, sub };
}

function brandRef(brand: string | null) {
  return brand?.trim() ? { id: slugId("brd", brand), name: brand.trim() } : null;
}

export function offerView(row: CatalogRow, ctx: ProjectionContext, withProduct: boolean): OfferView {
  const info = ctx.providers.get(row.provider);
  const visible = ctx.config.providerIdentity === "visible";
  const provider = visible
    ? { id: info?.aliasId ?? row.provider, name: info?.name ?? row.provider, key: row.provider }
    : { id: info?.aliasId ?? "prv_unknown", name: info?.aliasName ?? "Proveedor" };
  const view: OfferView = {
    id: row.offerId,
    productId: row.productId,
    provider,
    sku: row.sku,
    ...(visible ? { externalId: row.externalId } : {}),
    stock: { quantity: row.stock, status: stockStatus(row), minThresholdApplied: row.minStockThreshold },
    price: priceOffer(
      { currency: row.currency, costNet: row.costNet, costTaxes: row.costTaxes, providerMarkupPercent: row.markupPercent, source: row.source },
      ctx.config.price,
      ctx.convert
    ),
    freshness: {
      syncedAt: row.syncedAt.toISOString(),
      stale: info?.stale ?? false,
      providerSync: info?.status ?? "ok",
    },
    updatedAt: row.updatedAt.toISOString(),
  };
  if (withProduct) {
    const { cat } = categoryRef(row.category, row.subcategory);
    view.product = {
      name: row.name,
      brand: brandRef(row.brand),
      category: cat,
      ean: cleanGtin(row.ean) ?? row.ean,
      partNumber: row.partNumber,
      imageUrl: row.imageUrl,
      images: imagesOf(row),
    };
  }
  return view;
}

/** Precio con el que se compara y ordena: venta final; si la key no la expone, costo final. */
export function sortablePrice(row: CatalogRow, ctx: ProjectionContext): number | null {
  const price = priceOffer(
    { currency: row.currency, costNet: row.costNet, costTaxes: row.costTaxes, providerMarkupPercent: row.markupPercent, source: row.source },
    { ...ctx.config.price, includeCost: true, includeSalePrice: true, includeTaxes: true },
    ctx.convert
  );
  return price?.sale?.gross ?? null;
}

/** El mejor primero: con stock antes que sin, y más barato antes que más caro. */
function bestFirst(a: { row: CatalogRow; price: number | null }, b: { row: CatalogRow; price: number | null }) {
  const sa = a.row.stock === 0 ? 1 : 0;
  const sb = b.row.stock === 0 ? 1 : 0;
  if (sa !== sb) return sa - sb;
  if (a.price == null || b.price == null) return a.price == null ? 1 : -1;
  return a.price - b.price || a.row.offerId.localeCompare(b.row.offerId);
}

export interface ProductGroup {
  productId: string;
  rows: { row: CatalogRow; price: number | null }[];
  /** Fila que da nombre, fotos y datos (la del mejor precio con más información). */
  lead: CatalogRow;
  minPrice: number | null;
  updatedAt: Date;
  searchText: string;
}

/** Junta las ofertas del mismo producto (mismo EAN, o misma marca + part number). */
export function groupRows(rows: CatalogRow[], ctx: ProjectionContext): ProductGroup[] {
  const groups = new Map<string, { row: CatalogRow; price: number | null }[]>();
  for (const row of rows) {
    const list = groups.get(row.productId) ?? [];
    list.push({ row, price: sortablePrice(row, ctx) });
    groups.set(row.productId, list);
  }
  return [...groups.entries()].map(([productId, list]) => {
    list.sort(bestFirst);
    const richest = [...list].sort((a, b) => richness(b.row) - richness(a.row))[0].row;
    const prices = list.map((x) => x.price).filter((p): p is number => p != null);
    return {
      productId,
      rows: list,
      lead: richest,
      minPrice: prices.length ? Math.min(...prices) : null,
      updatedAt: list.reduce((max, x) => (x.row.updatedAt > max ? x.row.updatedAt : max), list[0].row.updatedAt),
      searchText: list.map((x) => x.row.searchText).join(" "),
    };
  });
}

/** Cuánta información trae una ficha: la más completa da los datos del producto agrupado. */
function richness(row: CatalogRow): number {
  return (
    (row.imageUrl ? 4 : 0) +
    (row.longDescription ? 3 : 0) +
    (row.description ? 2 : 0) +
    (row.ean ? 1 : 0) +
    (row.weight != null ? 1 : 0) +
    (row.warranty ? 1 : 0)
  );
}

export function productView(group: ProductGroup, ctx: ProjectionContext): ProductView {
  const lead = group.lead;
  const offers = group.rows.map((x) => offerView(x.row, ctx, false));
  const { cat, sub } = categoryRef(lead.category, lead.subcategory);
  const images: ProductView["images"] = [];
  const seen = new Set<string>();
  for (const { row } of group.rows) {
    for (const url of imagesOf(row)) {
      if (seen.has(url)) continue;
      seen.add(url);
      // Solo la principal puede venir de la búsqueda de imágenes; la galería es del distribuidor.
      const ai = url === row.imageUrl && row.imageAiSelected;
      images.push({ url, source: ai ? "ai_suggested" : "provider" });
    }
  }
  // Fotos del distribuidor primero; las sugeridas por la búsqueda de imágenes al final.
  images.sort((a, b) => Number(a.source === "ai_suggested") - Number(b.source === "ai_suggested"));
  const known = group.rows.map((x) => x.row.stock).filter((s): s is number => s != null);
  const prices = offers.map((o) => o.price?.sale?.gross ?? o.price?.cost?.gross).filter((p): p is number => p != null);
  const currency = ctx.config.price.currency;
  return {
    id: group.productId,
    name: lead.name,
    brand: brandRef(lead.brand),
    category: cat,
    subcategory: sub,
    ean: cleanGtin(lead.ean) ?? group.rows.map((x) => cleanGtin(x.row.ean)).find(Boolean) ?? lead.ean,
    partNumber: lead.partNumber ?? group.rows.find((x) => x.row.partNumber)?.row.partNumber ?? null,
    sku: lead.sku,
    description: lead.description,
    longDescription: lead.longDescription,
    images,
    specs: {
      warranty: lead.warranty,
      weight: lead.weight != null ? { value: lead.weight, unit: lead.weightUnit } : null,
      dimensions:
        lead.height != null || lead.width != null || lead.length != null
          ? { height: lead.height, width: lead.width, length: lead.length, unit: lead.dimensionsUnit }
          : null,
      volume: lead.volume,
    },
    tags: [...new Set(group.rows.flatMap((x) => x.row.tags))],
    links: {
      provider:
        ctx.config.providerIdentity === "visible"
          ? [...new Set(group.rows.map((x) => x.row.productUrl).filter((u): u is string => Boolean(u)))]
          : [],
    },
    availability: {
      inStock: group.rows.some((x) => x.row.stock == null || x.row.stock > 0),
      // Suma lo que se informa; `null` si ningún distribuidor informa cantidad.
      totalStock: known.length ? known.reduce((s, n) => s + n, 0) : null,
      offers: offers.length,
    },
    bestOffer: offers[0] ?? null,
    priceRange: prices.length ? { min: Math.min(...prices), max: Math.max(...prices), currency } : null,
    offers,
    updatedAt: group.updatedAt.toISOString(),
  };
}
