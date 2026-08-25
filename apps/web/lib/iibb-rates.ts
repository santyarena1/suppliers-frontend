"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "pref_iibb_rates";
const EVENT = "nodo:iibb-rates";

/**
 * Alícuotas IIBB/percepciones sobre neto (puntos: 7 = 7%).
 *
 * New Bytes: el carrito suma `perceptionsIIBB` ≈ 7% del subtotal.
 * Invid: al validar stock manda `percepcion` = 3.
 * Elit: Percep. II.BB. C.A.B.A típica 3% (p. ej. 1.5 / 50.01).
 * Grupo Núcleo: línea `Percepción IIBB` 3% en `impuestos[]` (fallback si el producto no la trae).
 *
 * Air: el canasto NV suma IVA (21 / 10,5) e impuestos internos (`ii`).
 * No hay percepción/IIBB en checkout ni en el CSV; no se inventa un %.
 * Ceven y Diapstore tampoco cargan percepción.
 * Una cotización real del carrito pisa estos valores.
 */
const BUILTIN_RATES: Record<string, number> = {
  NEW_BYTES: 7,
  INVID: 3,
  ELIT: 3,
  GRUPO_NUCLEO: 3,
};

/** Distribuidores cuyo checkout no carga percepción/IIBB. */
const NO_IIBB: Record<string, string> = {
  AIR: "Air no (IVA e internos)",
  CEVEN: "Ceven no",
  DIAPSTORE: "Diapstore no",
};

const RATE_LABELS: Record<string, string> = {
  NEW_BYTES: "New Bytes",
  INVID: "Invid",
  ELIT: "Elit",
  GRUPO_NUCLEO: "Grupo Núcleo",
};

const RATE_ORDER = ["NEW_BYTES", "INVID", "ELIT", "GRUPO_NUCLEO"];

function formatPct(percent: number): string {
  const n = Math.round(percent * 10) / 10;
  return `${Number.isInteger(n) ? String(n) : n.toFixed(1)}%`;
}

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

export function listKnownIibbRates(): { provider: string; label: string; percent: number }[] {
  const stored = readStored();
  const providers = new Set([...Object.keys(BUILTIN_RATES), ...Object.keys(stored)]);
  const rest = [...providers].filter((p) => !RATE_ORDER.includes(p)).sort();
  const ordered = [...RATE_ORDER.filter((p) => providers.has(p)), ...rest];
  return ordered
    .map((provider) => {
      const percent = stored[provider] ?? BUILTIN_RATES[provider];
      if (percent == null || percent <= 0) return null;
      return {
        provider,
        label: RATE_LABELS[provider] ?? provider.replace(/_/g, " "),
        percent,
      };
    })
    .filter((r): r is { provider: string; label: string; percent: number } => r != null);
}

export function providerOmitsIibb(provider: string | null | undefined): boolean {
  if (!provider) return false;
  return provider in NO_IIBB;
}

/** Texto corto para el toggle: "New Bytes 7% · Invid 3% · … · Air no (IVA e internos)" */
export function knownIibbRatesHint(): string {
  const withRates = listKnownIibbRates()
    .map((r) => `${r.label} ${formatPct(r.percent)}`)
    .join(" · ");
  const without = Object.values(NO_IIBB).join(" · ");
  return [withRates, without].filter(Boolean).join(" · ");
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
