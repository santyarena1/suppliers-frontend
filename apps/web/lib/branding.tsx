"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { platformApi } from "./api";
import {
  applyBrandPreset,
  BrandPreset,
  BRAND_PRESETS,
  isBrandPreset,
  readCachedBrandPreset,
  writeCachedBrandPreset,
} from "./brand-presets";

interface BrandingContextValue {
  preset: BrandPreset;
  setPreset: (p: BrandPreset) => void;
  loading: boolean;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

function initialPreset(): BrandPreset {
  return readCachedBrandPreset() ?? "violet";
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [preset, setPresetState] = useState<BrandPreset>(initialPreset);
  const [loading, setLoading] = useState(() => readCachedBrandPreset() == null);

  useEffect(() => {
    const cached = readCachedBrandPreset();
    if (cached) applyBrandPreset(cached);

    let alive = true;
    platformApi.settings()
      .then((res) => {
        if (!alive) return;
        const p = res.data.brandPreset;
        if (isBrandPreset(p) && BRAND_PRESETS[p]) {
          setPresetState(p);
          applyBrandPreset(p);
          writeCachedBrandPreset(p);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const setPreset = useCallback((p: BrandPreset) => {
    setPresetState(p);
    applyBrandPreset(p);
    writeCachedBrandPreset(p);
  }, []);

  return (
    <BrandingContext.Provider value={{ preset, setPreset, loading }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error("useBranding must be used inside BrandingProvider");
  return ctx;
}
