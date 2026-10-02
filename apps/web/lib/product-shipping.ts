"use client";

import { useMemo } from "react";
import type { ProductDTO } from "@/lib/api";
import { useCart, type CartItem } from "@/lib/cart";
import { usePrefs } from "@/lib/prefs";
import { linePricing } from "@/lib/tax";
import {
  shippingCostUsd,
  shippingShare,
  useShippingEstimates,
  freeShippingThresholdUsd,
  qualifiesForFreeShipping,
  type FreeShippingThreshold,
  type ProviderShipping,
  type ShippingEstimate,
  type ShippingShareBasis,
  type ShippingSplit,
} from "@/lib/shipping";

export interface ProductShipping {
  estimate: ShippingEstimate;
  /** Envío del pedido completo, en USD. */
  costUsd: number;
  /** Lo que carga cada unidad de este producto, en USD. */
  perUnitUsd: number;
  basis: ShippingShareBasis;
  /** Envío gratis configurado para este distribuidor. */
  freeShipping: FreeShippingThreshold | null;
  /** El pedido (con este producto) ya llega al envío gratis: el envío no suma. */
  free: boolean;
  /** Cuánto le falta al pedido para el envío gratis, en USD. */
  missingUsd: number | null;
}

export interface ShippingContext {
  estimates: Record<string, ProviderShipping>;
  byProvider: Record<string, CartItem[]>;
  split: ShippingSplit;
  arsPerUsd: number;
}

/**
 * El envío estimado de un producto según el carrito actual de ese
 * distribuidor. `null` si no hay forma de envío conocida, si es retiro o si no
 * se sabe cuánto sale.
 */
export function productShipping(product: ProductDTO, ctx: ShippingContext): ProductShipping | null {
  const info = ctx.estimates[product.provider];
  const estimate = info?.estimate ?? null;
  if (!estimate || estimate.pickup) return null;
  const costUsd = shippingCostUsd(estimate, ctx.arsPerUsd);
  if (costUsd == null || costUsd <= 0) return null;

  let cartUnits = 0;
  let cartValue = 0;
  let cartGross = 0;
  let inCartQty = 0;
  for (const it of ctx.byProvider[product.provider] ?? []) {
    cartUnits += it.qty;
    const lp = linePricing(it);
    cartValue += lp.unitNet * it.qty;
    cartGross += lp.unitGross * it.qty;
    if (it.externalId === product.externalId) inCartQty += it.qty;
  }
  // Envío gratis: el total con IVA del pedido de este distribuidor, contando
  // este producto si todavía no está en el carrito.
  const freeShipping = info?.freeShipping ?? null;
  const orderGross = cartGross + (inCartQty > 0 ? 0 : linePricing(product).unitGross);
  const limit = freeShippingThresholdUsd(freeShipping, ctx.arsPerUsd);
  if (qualifiesForFreeShipping(orderGross, freeShipping, ctx.arsPerUsd)) {
    return { estimate, costUsd: 0, perUnitUsd: 0, basis: "unit", freeShipping, free: true, missingUsd: 0 };
  }
  const missingUsd = limit != null ? Math.max(0, limit - orderGross) : null;
  const share = shippingShare({
    cost: costUsd,
    split: ctx.split,
    cartUnits,
    cartValue,
    inCartQty,
    unitPrice: linePricing(product).unitNet,
  });
  return { estimate, costUsd, perUnitUsd: share.perUnit, basis: share.basis, freeShipping, free: false, missingUsd };
}

export function useShippingContext(): ShippingContext {
  const estimates = useShippingEstimates();
  const { byProvider } = useCart();
  const { shippingSplit, currentRate } = usePrefs();
  const arsPerUsd = currentRate?.venta ?? 0;
  return useMemo(
    () => ({ estimates, byProvider, split: shippingSplit, arsPerUsd }),
    [estimates, byProvider, shippingSplit, arsPerUsd]
  );
}

export function useProductShipping(product: ProductDTO): ProductShipping | null {
  return productShipping(product, useShippingContext());
}
