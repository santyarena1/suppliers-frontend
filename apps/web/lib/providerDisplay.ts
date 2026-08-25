"use client";

import { useEffect, useState } from "react";
import { catalogApi, ProviderDisplay } from "./api";
import { PROVIDER_TEXT_COLOR } from "./providerColors";
import { assetUrl } from "./assets";

const STORAGE_KEY = "nodo.providerDisplay.v1";

let cache: Record<string, ProviderDisplay> | null = null;
let inflight: Promise<Record<string, ProviderDisplay>> | null = null;

function readPersisted(): Record<string, ProviderDisplay> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, ProviderDisplay>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writePersisted(map: Record<string, ProviderDisplay>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  cache = readPersisted();
}

async function load(): Promise<Record<string, ProviderDisplay>> {
  if (cache && Object.keys(cache).length > 0 && !inflight) {
    // Revalidate in background but return cache immediately via callers that already have it.
  }
  if (!inflight) {
    inflight = catalogApi
      .providerDisplay()
      .then((res) => {
        const map: Record<string, ProviderDisplay> = {};
        for (const p of res.data) map[p.provider] = p;
        cache = map;
        writePersisted(map);
        return map;
      })
      .catch(() => cache ?? {})
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Invalidar tras editar logos/colores en Configuración. */
export function invalidateProviderDisplayCache() {
  cache = null;
  inflight = null;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Devuelve logo/color por proveedor, priorizando lo configurado por el
 * superadmin (`ProviderDisplayConfig`) y cayendo a los defaults estáticos de
 * `providerColors.ts` si el proveedor no tiene override.
 */
export function useProviderDisplay() {
  const [map, setMap] = useState<Record<string, ProviderDisplay>>(() => cache ?? readPersisted() ?? {});

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
    logoUrl: (provider: string): string | null => {
      const raw = map[provider]?.logoUrl ?? null;
      return raw ? assetUrl(raw) : null;
    },
    textColor: (provider: string): string | null => map[provider]?.textColor ?? null,
    /** Clase Tailwind de fallback si no hay color custom cargado. */
    fallbackClass: (provider: string): string => PROVIDER_TEXT_COLOR[provider] || "text-surface-400",
    isHidden: (provider: string): boolean => map[provider]?.visible === false,
  };
}
