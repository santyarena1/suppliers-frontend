"use client";

import { useEffect, useState } from "react";
import { catalogApi, ProviderDisplay } from "./api";
import { PROVIDER_TEXT_COLOR } from "./providerColors";

let cache: Record<string, ProviderDisplay> | null = null;
let inflight: Promise<Record<string, ProviderDisplay>> | null = null;

async function load(): Promise<Record<string, ProviderDisplay>> {
  if (cache) return cache;
  if (!inflight) {
    inflight = catalogApi
      .providerDisplay()
      .then((res) => {
        const map: Record<string, ProviderDisplay> = {};
        for (const p of res.data) map[p.provider] = p;
        cache = map;
        return map;
      })
      .catch(() => ({}));
  }
  return inflight;
}

/**
 * Devuelve logo/color por proveedor, priorizando lo configurado por el
 * superadmin (`ProviderDisplayConfig`) y cayendo a los defaults estáticos de
 * `providerColors.ts` si el proveedor no tiene override.
 */
export function useProviderDisplay() {
  const [map, setMap] = useState<Record<string, ProviderDisplay>>(cache ?? {});

  useEffect(() => {
    let alive = true;
    load().then((m) => {
      if (alive) setMap(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  return {
    logoUrl: (provider: string): string | null => map[provider]?.logoUrl ?? null,
    textColor: (provider: string): string | null => map[provider]?.textColor ?? null,
    /** Clase Tailwind de fallback si no hay color custom cargado. */
    fallbackClass: (provider: string): string => PROVIDER_TEXT_COLOR[provider] || "text-surface-400",
    isHidden: (provider: string): boolean => map[provider]?.visible === false,
  };
}
