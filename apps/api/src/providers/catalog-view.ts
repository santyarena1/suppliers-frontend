import type { ProviderSyncCache, TenantProductOffer } from "@prisma/client";

/** Lo que hay que aplicar al leer el precio: markup del comercio, descuento de cuenta y de marca. */
export interface OfferRules {
  markupPercent: number;
  minStockThreshold: number;
  /** Descuento del vínculo comercio–mayorista, en porcentaje. */
  discountPercent: number;
  /** Descuento por marca que cargó el mayorista o su Product Manager. Clave normalizada. */
  brandDiscounts: Map<string, number>;
}

export const NO_RULES: OfferRules = {
  markupPercent: 0,
  minStockThreshold: 0,
  discountPercent: 0,
  brandDiscounts: new Map(),
};

export type ProductView = Omit<ProviderSyncCache, "id" | "updatedAt"> & {
  price: number | null;
  finalPrice: number | null;
  currency: string | null;
  ivaPercent: number | null;
  stock: number | null;
  stockStatus: string | null;
  active: boolean;
  needsResync: boolean;
};

export function normalizeBrandName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase("es");
}

/** Lista general, o este local está entre los asignados. */
export function brandDiscountAppliesToClient(
  appliesToAll: boolean,
  clientTenantIds: readonly string[],
  clientTenantId: string
): boolean {
  return appliesToAll || clientTenantIds.includes(clientTenantId);
}

/**
 * Junta la ficha del producto con la oferta de una organización y aplica lo que
 * esa organización configuró.
 *
 * El markup, el descuento de cuenta y el de marca se aplican acá, al leer, y no
 * al guardar: la oferta conserva siempre el valor crudo del proveedor.
 */
export function toProductView(
  product: ProviderSyncCache,
  offer: TenantProductOffer,
  rules: OfferRules = NO_RULES
): ProductView {
  const { id: _id, updatedAt: _updatedAt, ...ficha } = product;
  const rawStock = offer.stock;
  const brandDiscount = rules.brandDiscounts.get(normalizeBrandName(product.brand)) ?? 0;

  return {
    ...ficha,
    price: applyPrice(offer.price, rules.discountPercent, brandDiscount, rules.markupPercent),
    finalPrice: applyPrice(offer.finalPrice, rules.discountPercent, brandDiscount, rules.markupPercent),
    currency: offer.currency,
    ivaPercent: offer.ivaPercent == null ? null : Number(offer.ivaPercent),
    stock: rawStock != null && rules.minStockThreshold > 0 && rawStock <= rules.minStockThreshold ? 0 : rawStock,
    stockStatus: offer.stockStatus,
    active: offer.active,
    needsResync: offer.needsResync,
    syncedAt: offer.syncedAt,
  };
}

/** Ficha sin oferta propia: el mayorista mira su catálogo aunque ningún comercio lo haya sincronizado. */
export function toSheetView(product: ProviderSyncCache, offer?: TenantProductOffer | null): ProductView {
  const { id: _id, updatedAt: _updatedAt, ...ficha } = product;
  return {
    ...ficha,
    price: offer?.price == null ? null : Number(offer.price),
    finalPrice: offer?.finalPrice == null ? null : Number(offer.finalPrice),
    currency: offer?.currency ?? null,
    ivaPercent: offer?.ivaPercent == null ? null : Number(offer.ivaPercent),
    stock: offer?.stock ?? null,
    stockStatus: offer?.stockStatus ?? null,
    active: offer?.active ?? true,
    needsResync: false,
    syncedAt: offer?.syncedAt ?? product.syncedAt,
  };
}

/**
 * Primero el descuento de cuenta, después el de marca, después el markup del local.
 * El comercio no ve los porcentajes: ve el precio que le queda.
 */
export function applyPrice(
  value: unknown,
  accountDiscountPercent: number,
  brandDiscountPercent: number,
  markupPercent: number
): number | null {
  if (value == null) return null;
  const price = Number(value);
  if (!Number.isFinite(price)) return null;
  const afterAccount = withPercentOff(price, accountDiscountPercent);
  const afterBrand = withPercentOff(afterAccount, brandDiscountPercent);
  return withMarkup(afterBrand, markupPercent);
}

function withPercentOff(price: number, percent: number): number {
  if (!percent) return price;
  return price * (1 - percent / 100);
}

export function withMarkup(value: number, markupPercent: number): number {
  if (!markupPercent) return round2(value);
  return round2(value * (1 + markupPercent / 100));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
