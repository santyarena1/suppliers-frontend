"use client";

import { useEffect, useState } from "react";
import { getTenant, getToken, sessionFromToken } from "@/lib/auth";
import { useMyProviders } from "@/lib/myProviders";
import {
  EMPTY_PURCHASE_POLICY,
  parsePurchasePolicy,
  providerHasIvaRate,
  type PurchasePolicy,
} from "@/lib/purchase-pricing";

export function isRetailerSession(): boolean {
  if (getTenant()?.type === "RETAILER") return true;
  const token = getToken();
  if (!token) return false;
  return sessionFromToken(token).tenantType === "RETAILER";
}

export function useIsRetailer(): boolean {
  const { providers } = useMyProviders();
  const [retailer, setRetailer] = useState(() => isRetailerSession());
  useEffect(() => {
    setRetailer(isRetailerSession());
  }, [providers]);
  return retailer;
}

export function usePurchasePolicy(provider: string): PurchasePolicy {
  const { providers } = useMyProviders();
  const found = providers.find((p) => p.provider === provider);
  const parsed = parsePurchasePolicy(found?.purchase);
  if (!providerHasIvaRate(provider)) {
    return { ...parsed, acceptsOffline: false, acceptsScheme: false };
  }
  return parsed;
}

export function usePurchasePolicies(): Record<string, PurchasePolicy> {
  const { providers } = useMyProviders();
  const map: Record<string, PurchasePolicy> = {};
  for (const p of providers) {
    const parsed = parsePurchasePolicy(p.purchase);
    map[p.provider] = providerHasIvaRate(p.provider)
      ? parsed
      : { ...parsed, acceptsOffline: false, acceptsScheme: false };
  }
  return map;
}

export { EMPTY_PURCHASE_POLICY };
export type { PurchasePolicy };
