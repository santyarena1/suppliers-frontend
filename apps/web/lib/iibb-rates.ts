"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "pref_iibb_rates";
const EVENT = "nodo:iibb-rates";

/**
 * Alícuotas documentadas (puntos: 3 = 3% sobre neto).
 * Invid la informa al validar stock; el parser de checkout la trata como típica ~3%.
 * El resto se aprende de cotizaciones reales del carrito.
 */
const BUILTIN_RATES: Record<string, number> = {
  INVID: 3,
};

function readStored(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n > 0 && n <= 100) out[k] = Math.round(n * 100) / 100;
    }
    return out;
  } catch {
    return {};
  }
}

/** Alícuota IIBB/percepciones conocida para el proveedor, o null. */
export function getIibbRatePercent(provider: string | null | undefined): number | null {
  if (!provider) return null;
  const stored = readStored()[provider];
  if (stored != null) return stored;
  return BUILTIN_RATES[provider] ?? null;
}

/** Guarda la alícuota observada en una cotización del carrito. */
export function rememberIibbRate(provider: string, percent: number): void {
  if (!provider || !Number.isFinite(percent) || percent <= 0 || percent > 100) return;
  const next = Math.round(percent * 100) / 100;
  const prev = getIibbRatePercent(provider);
  if (prev != null && Math.abs(prev - next) < 0.005) return;

  const map = { ...readStored(), [provider]: next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    return;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT));
  }
}

/** Fuerza re-render cuando se aprende una alícuota nueva. */
export function useIibbRatesEpoch(): number {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const onChange = () => setEpoch((e) => e + 1);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return epoch;
}
