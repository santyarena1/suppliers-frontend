import type { ProviderSyncCache, TenantProductOffer } from "@prisma/client";
import { resolveCatalogDisplay, type CatalogEnrichmentContext } from "../catalog/catalog-enrichment";
import { displayedStock } from "./catalog-stock";

/** Lo que la organización decidió para un proveedor y hay que aplicar al leer. */
export interface OfferRules {
  minStockThreshold: number;
  /** KEEP = listar stock 0; HIDE/DELETE = no listarlos salvo includeOutOfStock. */
  zeroStockAction: string;
  /**
   * Descuento pactado en el vínculo con un proveedor por lista. Se aplica solo a
   * ofertas materializadas desde la lista base (source BASE_LIST).
   */
  baseListDiscountPercent?: number;
}

export const NO_RULES: OfferRules = { minStockThreshold: 0, zeroStockAction: "KEEP" };

export type ProductView = Omit<ProviderSyncCache, "id" | "updatedAt"> & {
  price: number | null;
  finalPrice: number | null;
  currency: string | null;
  ivaPercent: number | null;
  stock: number | null;
  stockStatus: string | null;
  active: boolean;
  needsResync: boolean;
  displayBrand?: string | null;
  displayCategory?: string | null;
  displaySubcategory?: string | null;
  /** Solo en destacados: precio anterior cuando bajó. */
  previousPrice?: number | null;
  previousFinalPrice?: number | null;
  /** Porcentaje de baja (0–100), si aplica. */
  priceDropPercent?: number | null;
  /** Día calendario AR de la baja (YYYY-MM-DD). */
  priceDroppedOn?: string | null;
  /** Foto elegida por Serper / Primera foto (no es la del proveedor). */
  imageAiSelected?: boolean;
};

/**
 * Junta la ficha del producto con la oferta de una organización y aplica lo que
 * esa organización configuró.
 *
 * El umbral de stock y el descuento de lista se aplican acá, al leer, y no al
 * guardar: la oferta conserva siempre el valor crudo del proveedor. El costo no
 * lleva margen: el precio de venta es una capa aparte (modo vendedor,
 * pricing/sale-pricing.service.ts).
 */
export function toProductView(
  product: ProviderSyncCache,
  offer: TenantProductOffer,
  rules: OfferRules = NO_RULES,
  enrichment?: CatalogEnrichmentContext
): ProductView {
  const { id: _id, updatedAt: _updatedAt, raw, ...ficha } = product;
  const rawStock = offer.stock;
  const display = resolveCatalogDisplay(product, enrichment);
  const discount = offer.source === "BASE_LIST" ? rules.baseListDiscountPercent ?? 0 : 0;

  return {
    ...ficha,
    ...display,
    raw: fichaRaw(product.provider, raw) as ProviderSyncCache["raw"],
    price: roundPrice(withDiscount(offer.price, discount)),
    finalPrice: roundPrice(withDiscount(offer.finalPrice, discount)),
    currency: offer.currency,
    ivaPercent: offer.ivaPercent == null ? null : Number(offer.ivaPercent),
    // Debajo del mínimo que el comercio considera vendible, es como no tener.
    stock: displayedStock(rawStock, rules.minStockThreshold),
    stockStatus: offer.stockStatus,
    active: offer.active,
    needsResync: offer.needsResync,
    syncedAt: offer.syncedAt,
  };
}

/**
 * Ficha sola, para un local vinculado que todavía no sincronizó su cuenta.
 * El producto se ve. Precio y stock no: no hay oferta de esa organización.
 */
export function toSheetView(
  product: ProviderSyncCache,
  enrichment?: CatalogEnrichmentContext
): ProductView {
  const { id: _id, updatedAt: _updatedAt, raw, ...ficha } = product;
  const display = resolveCatalogDisplay(product, enrichment);
  return {
    ...ficha,
    ...display,
    raw: fichaRaw(product.provider, raw) as ProviderSyncCache["raw"],
    price: null,
    finalPrice: null,
    currency: null,
    ivaPercent: null,
    stock: null,
    stockStatus: null,
    active: true,
    needsResync: false,
    syncedAt: product.syncedAt,
  };
}

function withDiscount(value: unknown, discountPercent: number): number | null {
  if (value == null) return null;
  const price = Number(value);
  if (!Number.isFinite(price)) return null;
  if (!discountPercent) return price;
  return price * (1 - discountPercent / 100);
}

function roundPrice(value: number | null): number | null {
  return value == null ? null : round2(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * La ficha es universal. Aunque el proveedor mande importes en el JSON, no
 * forman parte de la ficha: el precio de cada local está en su oferta.
 */
export function fichaRaw(provider: string, raw: unknown): unknown {
  if (provider === "INVID" && Array.isArray(raw)) {
    const next = raw.map((cell) => cell);
    if (next.length > 9) {
      next[6] = null;
      next[9] = null;
    }
    return next;
  }
  return stripAccountPrices(raw);
}

/** Claves que traen un importe o una percepción de ESA cuenta, no del producto. */
const ACCOUNT_PRICE_KEY =
  /^(price|prices|precio|precios|importe|monto|finalprice|preciolista|precioventa|precioconiva|precioneto|preciofinal|preciosiniva|percepcion|percepciones|perception|perceptionsiibb)$/i;

function stripAccountPrices(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    return raw.map((cell) => (cell && typeof cell === "object" ? stripAccountPrices(cell) : cell));
  }
  if (!raw || typeof raw !== "object") return raw;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const folded = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
    if (ACCOUNT_PRICE_KEY.test(folded)) continue;
    out[key] = value && typeof value === "object" ? stripAccountPrices(value) : value;
  }
  return out;
}
