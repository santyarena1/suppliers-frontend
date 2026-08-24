"use client";

import { getTenant } from "@/lib/auth";
import { useMyProviders } from "@/lib/myProviders";
import {
  EMPTY_PURCHASE_POLICY,
  parsePurchasePolicy,
  type PurchasePolicy,
} from "@/lib/purchase-pricing";

export function isRetailerSession(): boolean {
  return getTenant()?.type === "RETAILER";
}

export function useIsRetailer(): boolean {
  const { providers } = useMyProviders();
  // Forzar re-render cuando llega la org; la sesión se lee al momento.
  void providers;
  return isRetailerSession();
}

export function usePurchasePolicy(provider: string): PurchasePolicy {
  const { providers } = useMyProviders();
  const found = providers.find((p) => p.provider === provider);
  return parsePurchasePolicy(found?.purchase);
}

export function usePurchasePolicies(): Record<string, PurchasePolicy> {
  const { providers } = useMyProviders();
  const map: Record<string, PurchasePolicy> = {};
  for (const p of providers) {
    map[p.provider] = parsePurchasePolicy(p.purchase);
  }
  return map;
}

export { EMPTY_PURCHASE_POLICY };
export type { PurchasePolicy };
