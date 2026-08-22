"use client";

import { useEffect } from "react";
import { useCart } from "@/lib/cart";
import { getToken } from "@/lib/auth";
import {
  WARM_PROVIDERS,
  cartLinesFromItems,
  ensureCheckoutWarmup,
  forgetCheckoutWarmup,
} from "@/lib/checkoutWarmup";

export default function ProviderCartPreloader() {
  const { byProvider, hydrated } = useCart();

  useEffect(() => {
    if (!hydrated || !getToken()) return;
    for (const provider of WARM_PROVIDERS) {
      const items = byProvider[provider] ?? [];
      if (items.length === 0) {
        forgetCheckoutWarmup(provider);
        continue;
      }
      ensureCheckoutWarmup(provider, cartLinesFromItems(items), 600);
    }
  }, [hydrated, byProvider]);

  return null;
}
