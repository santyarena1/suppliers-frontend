"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { platformApi } from "./api";
import { applyBrandPreset, BrandPreset, BRAND_PRESETS } from "./brand-presets";

interface BrandingContextValue {
  preset: BrandPreset;
  setPreset: (p: BrandPreset) => void;
  loading: boolean;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [preset, setPresetState] = useState<BrandPreset>("violet");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    applyBrandPreset("violet");
    let alive = true;
    platformApi.settings()
      .then((res) => {
        if (!alive) return;
        const p = res.data.brandPreset as BrandPreset;
        if (BRAND_PRESETS[p]) {
          setPresetState(p);
          applyBrandPreset(p);
        }
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const setPreset = useCallback((p: BrandPreset) => {
    setPresetState(p);
    applyBrandPreset(p);
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
