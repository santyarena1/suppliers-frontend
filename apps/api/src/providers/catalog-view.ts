import type { ProviderSyncCache, TenantProductOffer } from "@prisma/client";
import { resolveCatalogDisplay, type CatalogEnrichmentContext } from "../catalog/catalog-enrichment";
import { displayedStock } from "./catalog-stock";

/** Lo que la organización decidió para un proveedor y hay que aplicar al leer. */
export interface OfferRules {
  markupPercent: number;
  minStockThreshold: number;
}

export const NO_RULES: OfferRules = { markupPercent: 0, minStockThreshold: 0 };

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
  /** Solo en destacados: precio crudo anterior (con markup) cuando bajó. */
  previousPrice?: number | null;
  previousFinalPrice?: number | null;
  /** Porcentaje de baja (0–100), si aplica. */
  priceDropPercent?: number | null;
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
  const { id: _id, updatedAt: _updatedAt, ...ficha } = product;
  const rawStock = offer.stock;
  const display = resolveCatalogDisplay(product, enrichment);

  return {
    ...ficha,
    ...display,
    price: withMarkup(offer.price, rules.markupPercent),
    finalPrice: withMarkup(offer.finalPrice, rules.markupPercent),
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
