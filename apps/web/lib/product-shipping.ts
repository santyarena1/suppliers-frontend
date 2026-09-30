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
  const estimate = ctx.estimates[product.provider]?.estimate ?? null;
  if (!estimate || estimate.pickup) return null;
  const costUsd = shippingCostUsd(estimate, ctx.arsPerUsd);
  if (costUsd == null || costUsd <= 0) return null;

  let cartUnits = 0;
  let cartValue = 0;
  let inCartQty = 0;
  for (const it of ctx.byProvider[product.provider] ?? []) {
    cartUnits += it.qty;
    cartValue += linePricing(it).unitNet * it.qty;
    if (it.externalId === product.externalId) inCartQty += it.qty;
  }
  const share = shippingShare({
    cost: costUsd,
    split: ctx.split,
    cartUnits,
    cartValue,
    inCartQty,
    unitPrice: linePricing(product).unitNet,
  });
  return { estimate, costUsd, perUnitUsd: share.perUnit, basis: share.basis };
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
