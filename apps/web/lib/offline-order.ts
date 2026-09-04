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
  pricingMode?: "list" | "scheme" | "offline";
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

/**
 * Pedido por mensaje para un proveedor que cotiza por lista: toma lo que haya en
 * el carrito de ese proveedor (online, esquema u offline) y arma el body de
 * POST /orders/offline con el modo de precio de cada línea.
 */
export function messageOrdersFromCart(
  items: CartItem[],
  policies: Record<string, PurchasePolicy>,
  provider: string,
  quoteRate?: number | null
): OfflineOrderGroupPayload[] {
  const group = items.filter((it) => it.provider === provider);
  if (group.length === 0) return [];
  const policy = policies[provider];
  const lines: OfflineOrderItemPayload[] = group.map((it) => {
    const mode = priceModeForCartItem(it);
    const pricing = purchaseLinePricing(it, policy, mode, 1);
    const iva = taxByKind(pricing.lines, "iva");
    const internos = taxByKind(pricing.lines, "internos");
    return {
      externalId: it.externalId,
      sku: it.sku ?? undefined,
      name: it.name,
      qty: it.qty,
      unitPrice: round2(pricing.unitNet + (iva?.unitAmount ?? 0)),
      internosAmount: round2(internos?.unitAmount ?? 0),
      ivaPercent: 0,
      internosPercent: internos?.percent ?? 0,
      pricingMode: pricing.mode,
    };
  });
  return [{ provider, quoteRate: quoteRate ?? undefined, items: lines }];
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
        pricingMode: "offline",
      };
    });
    return {
      provider,
      quoteRate: quoteRate ?? undefined,
      items: lines,
    };
  });
}
