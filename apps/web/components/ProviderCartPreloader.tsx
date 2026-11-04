"use client";

import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart";
import { getToken, isTokenExpired } from "@/lib/auth";
import {
  WARM_PROVIDERS,
  cartLinesFromItems,
  ensureCheckoutWarmup,
  forgetCheckoutWarmup,
} from "@/lib/checkoutWarmup";
import { capabilityAllowed, loadSubscription } from "@/lib/subscription";

export default function ProviderCartPreloader() {
  const { orderOnlineByProvider: onlineByProvider, hydrated } = useCart();

  // Al volver a la pestaña después de un rato se vuelve a armar lo que ya venció (WARM_TTL_MS).
  const [visibleTick, setVisibleTick] = useState(0);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setVisibleTick((t) => t + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!hydrated || !getToken() || isTokenExpired()) return;
    let alive = true;
    // Con NODO Base no hay checkout directo: el carrito queda solo en Nodo.
    void loadSubscription().then((sub) => {
      if (!alive || !capabilityAllowed(sub, "directCheckout")) return;
      for (const provider of WARM_PROVIDERS) {
        const items = onlineByProvider[provider] ?? [];
        if (items.length === 0) {
          forgetCheckoutWarmup(provider);
          continue;
        }
        // Sync inmediato Nodo → portal: al agregar desde búsqueda ya queda en el carrito del distribuidor.
        ensureCheckoutWarmup(provider, cartLinesFromItems(items), 80);
      }
    });
    return () => {
      alive = false;
    };
  }, [hydrated, onlineByProvider, visibleTick]);

  return null;
}
