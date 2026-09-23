import type { ProviderSyncCache, TenantProductOffer } from "@prisma/client";
import { resolveCatalogDisplay, type CatalogEnrichmentContext } from "../catalog/catalog-enrichment";
import { displayedStock } from "./catalog-stock";

/** Lo que la organización decidió para un proveedor y hay que aplicar al leer. */
export interface OfferRules {
  markupPercent: number;
  minStockThreshold: number;
  /** KEEP = listar stock 0; HIDE/DELETE = no listarlos salvo includeOutOfStock. */
  zeroStockAction: string;
  /**
   * Descuento pactado en el vínculo con un proveedor por lista. Se aplica solo a
   * ofertas materializadas desde la lista base (source BASE_LIST), antes del markup.
   */
  baseListDiscountPercent?: number;
}

export const NO_RULES: OfferRules = { markupPercent: 0, minStockThreshold: 0, zeroStockAction: "KEEP" };

export type ProductView = Omit<ProviderSyncCache, "id" | "updatedAt" | "rawOwnerTenantId"> & {
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
  /** Solo en destacados: precio crudo anterior (con markup) cuando bajó. */
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
 * El markup y el umbral de stock se aplican acá, al leer, y no al guardar: la
 * oferta conserva siempre el valor crudo del proveedor. Por eso cambiar el markup
 * se ve al instante en toda la plataforma y volver atrás es cambiar un número, en
 * vez de tener que resincronizar el catálogo entero.
 */
export function toProductView(
  product: ProviderSyncCache,
  offer: TenantProductOffer,
  rules: OfferRules = NO_RULES,
  enrichment?: CatalogEnrichmentContext
): ProductView {
  const { id: _id, updatedAt: _updatedAt, rawOwnerTenantId, raw, ...ficha } = product;
  const rawStock = offer.stock;
  const display = resolveCatalogDisplay(product, enrichment);
  const discount = offer.source === "BASE_LIST" ? rules.baseListDiscountPercent ?? 0 : 0;

  return {
    ...ficha,
    ...display,
    raw: rawForViewer(raw, rawOwnerTenantId, offer.tenantId) as ProviderSyncCache["raw"],
    price: withMarkup(withDiscount(offer.price, discount), rules.markupPercent),
    finalPrice: withMarkup(withDiscount(offer.finalPrice, discount), rules.markupPercent),
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

function withDiscount(value: unknown, discountPercent: number): number | null {
  if (value == null) return null;
  const price = Number(value);
  if (!Number.isFinite(price)) return null;
  if (!discountPercent) return price;
  return price * (1 - discountPercent / 100);
}

function withMarkup(value: unknown, markupPercent: number): number | null {
  if (value == null) return null;
  const price = Number(value);
  if (!Number.isFinite(price)) return null;
  if (!markupPercent) return round2(price);
  return round2(price * (1 + markupPercent / 100));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * El JSON crudo es de la cuenta que sincronizó. Si es de otro comercio, se le
 * sacan precios y percepciones para que la tarjeta no arme el total con la
 * lista de otro local. Nombre, marca e impuestos de producto quedan.
 *
 * Sin dueño (fichas anteriores a este sello) se deja el raw: hasta el próximo
 * sync no hay forma de saber de quién es.
 */
export function rawForViewer(raw: unknown, ownerTenantId: string | null | undefined, viewerTenantId: string): unknown {
  if (!ownerTenantId || ownerTenantId === viewerTenantId) return raw;
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
