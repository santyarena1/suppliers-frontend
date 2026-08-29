"use client";

import { useEffect, useState } from "react";
import { getUser, tenantSeesIibbPerceptions } from "@/lib/auth";

const STORAGE_KEY = "pref_iibb_rates";
const EVENT = "nodo:iibb-rates";

/** Cada comercio (y, si no hay org, cada usuario) tiene su mapa. No se comparte. */
function storageKey(): string {
  const user = getUser();
  if (user?.tenantId) return `${STORAGE_KEY}:t:${user.tenantId}`;
  if (user?.id) return `${STORAGE_KEY}:u:${user.id}`;
  return STORAGE_KEY;
}

export type IibbRateSource = "cart" | "manual" | "none";

const RATE_LABELS: Record<string, string> = {
  NEW_BYTES: "New Bytes",
  INVID: "Invid",
  ELIT: "Elit",
  GRUPO_NUCLEO: "Grupo Núcleo",
  AIR: "Air",
  CEVEN: "Ceven",
  DIAPSTORE: "Diapstore",
  NEW_TREE: "New Tree",
  GC: "GC",
  POLYTECH: "Polytech",
  ASHIR: "Ashir",
  HDC: "HDC",
  SOLUTION_BOX: "Solution Box",
  DISTECNA: "Distecna",
};

const RATE_ORDER = [
  "NEW_BYTES", "INVID", "ELIT", "GRUPO_NUCLEO", "AIR",
  "CEVEN", "DIAPSTORE", "NEW_TREE", "GC", "POLYTECH", "ASHIR", "HDC", "SOLUTION_BOX", "DISTECNA",
];

export const IIBB_SOURCE_LABEL: Record<IibbRateSource, string> = {
  cart: "del carrito",
  manual: "manual",
  none: "cargar a mano",
};

function formatPct(percent: number): string {
  const n = Math.round(percent * 10) / 10;
  return `${Number.isInteger(n) ? String(n) : n.toFixed(1)}%`;
}

function clampRate(n: number): number | null {
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

type StoredFile = {
  rates: Record<string, number>;
  sources: Record<string, "cart" | "manual">;
};

function parseRateMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    const clamped = clampRate(n);
    if (clamped != null) out[k] = clamped;
  }
  return out;
}

function readFile(): StoredFile {
  if (typeof window === "undefined") return { rates: {}, sources: {} };
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return { rates: {}, sources: {} };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && parsed.rates && typeof parsed.rates === "object") {
      const sources: Record<string, "cart" | "manual"> = {};
      const srcRaw = parsed.sources && typeof parsed.sources === "object"
        ? (parsed.sources as Record<string, unknown>)
        : {};
      for (const [k, v] of Object.entries(srcRaw)) {
        if (v === "cart" || v === "manual") sources[k] = v;
      }
      return { rates: parseRateMap(parsed.rates), sources };
    }
    const rates = parseRateMap(parsed);
    const sources: Record<string, "cart" | "manual"> = {};
    for (const k of Object.keys(rates)) sources[k] = "cart";
    return { rates, sources };
  } catch {
    return { rates: {}, sources: {} };
  }
}

function writeFile(file: StoredFile): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(file));
  } catch {
    return;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT));
  }
}

/** Alícuota de ESTE comercio (carrito o manual). No hay % global por proveedor. */
export function getIibbRatePercent(provider: string | null | undefined): number | null {
  if (!provider || !tenantSeesIibbPerceptions()) return null;
  const stored = readFile().rates;
  if (Object.prototype.hasOwnProperty.call(stored, provider)) return stored[provider];
  return null;
}

export function getIibbRateSource(provider: string | null | undefined): IibbRateSource {
  if (!provider || !tenantSeesIibbPerceptions()) return "none";
  const file = readFile();
  if (Object.prototype.hasOwnProperty.call(file.rates, provider)) {
    return file.sources[provider] ?? "manual";
  }
  return "none";
}

export type IibbRateRow = {
  provider: string;
  label: string;
  percent: number | null;
  source: IibbRateSource;
};

export function listIibbRateRows(providers: string[]): IibbRateRow[] {
  const seen = new Set<string>();
  const ordered = [
    ...RATE_ORDER.filter((p) => providers.includes(p)),
    ...providers.filter((p) => !RATE_ORDER.includes(p)),
  ];
  const rows: IibbRateRow[] = [];
  for (const provider of ordered) {
    if (seen.has(provider)) continue;
    seen.add(provider);
    rows.push({
      provider,
      label: RATE_LABELS[provider] ?? provider.replace(/_/g, " "),
      percent: getIibbRatePercent(provider),
      source: getIibbRateSource(provider),
    });
  }
  return rows;
}

export function knownIibbRatesHint(): string {
  return listIibbRateRows(RATE_ORDER)
    .filter((r) => r.percent != null && r.percent > 0)
    .map((r) => `${r.label} ${formatPct(r.percent!)}`)
    .join(" · ");
}

/** true si este comercio no tiene alícuota cargada (o está en 0). */
export function providerOmitsIibb(provider: string | null | undefined): boolean {
  const pct = getIibbRatePercent(provider);
  return pct == null || pct <= 0;
}

export function setIibbRate(
  provider: string,
  percent: number,
  source: "cart" | "manual"
): void {
  if (!tenantSeesIibbPerceptions()) return;
  const next = clampRate(percent);
  if (!provider || next == null) return;
  const prev = getIibbRatePercent(provider);
  const prevSource = getIibbRateSource(provider);
  if (prev != null && Math.abs(prev - next) < 0.005 && prevSource === source) return;

  const file = readFile();
  file.rates[provider] = next;
  file.sources[provider] = source;
  writeFile(file);
}

export function clearIibbRate(provider: string): void {
  if (!provider || !tenantSeesIibbPerceptions()) return;
  const file = readFile();
  if (!Object.prototype.hasOwnProperty.call(file.rates, provider)) return;
  delete file.rates[provider];
  delete file.sources[provider];
  writeFile(file);
}

/** Guarda la alícuota observada en una cotización del carrito. 0 no pisa un valor cargado. */
export function rememberIibbRate(provider: string, percent: number): void {
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return;
  setIibbRate(provider, percent, "cart");
}

export function useIibbRatesEpoch(): number {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const onChange = () => setEpoch((e) => e + 1);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return epoch;
}
