import type { CartItem } from "@/lib/cart";
import type { PurchasePolicy } from "@/lib/purchase-pricing";
import { purchaseLinePricing, priceModeForCartItem } from "@/lib/purchase-price";
import { taxByKind } from "@/lib/tax";

export type OfflineOrderItemPayload = {
  externalId: string;
  sku?: string;
  name: string;
  qty: number;
  unitPrice: number;
  internosAmount: number;
  ivaPercent: number;
  internosPercent: number;
};

export type OfflineOrderGroupPayload = {
  provider: string;
  notes?: string;
  quoteRate?: number;
  items: OfflineOrderItemPayload[];
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Armado del body de POST /orders/offline a partir del carrito offline. */
export function offlineOrdersFromCart(
  items: CartItem[],
  policies: Record<string, PurchasePolicy>,
  quoteRate?: number | null
): OfflineOrderGroupPayload[] {
  const offline = items.filter((it) => it.channel === "offline");
  const providers = [...new Set(offline.map((it) => it.provider))];
  return providers.map((provider) => {
    const group = offline.filter((it) => it.provider === provider);
    const policy = policies[provider];
    const lines: OfflineOrderItemPayload[] = group.map((it) => {
      const pricing = purchaseLinePricing(it, policy, priceModeForCartItem(it), 1);
      const iva = taxByKind(pricing.lines, "iva");
      const internos = taxByKind(pricing.lines, "internos");
      const unitPrice = round2(pricing.unitNet + (iva?.unitAmount ?? 0));
      return {
        externalId: it.externalId,
        sku: it.sku ?? undefined,
        name: it.name,
        qty: it.qty,
        unitPrice,
        internosAmount: round2(internos?.unitAmount ?? 0),
        ivaPercent: 0,
        internosPercent: internos?.percent ?? 0,
      };
    });
    return {
      provider,
      quoteRate: quoteRate ?? undefined,
      items: lines,
    };
  });
}
