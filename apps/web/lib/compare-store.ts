"use client";

import type { ProductDTO, RetailSearchHit } from "@/lib/api";
import type { PriceMode } from "@/lib/purchase-price";

export type CompareProviderEntry = {
  kind: "provider";
  id: string;
  product: ProductDTO;
  mode: PriceMode;
};

export type CompareRetailEntry = {
  kind: "retail";
  id: string;
  hit: RetailSearchHit;
  /** Costo de referencia (USD neto) al agregarlo desde un producto del tablero. */
  costUsd?: number | null;
  linkedName?: string | null;
  /** Si se cambió esta columna de mayorista → local, para volver a Normal/Esquema/Offline. */
  sourceProduct?: ProductDTO | null;
  sourceMode?: PriceMode | null;
};

export type CompareEntry = CompareProviderEntry | CompareRetailEntry;

const STORAGE_KEY = "nodo_comparador_v1";
const MANUAL_KEY = "nodo_comparador_manual_v1";

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newProviderEntry(product: ProductDTO, mode: PriceMode = "list"): CompareProviderEntry {
  return { kind: "provider", id: uid("p"), product, mode };
}

export function newRetailEntry(
  hit: RetailSearchHit,
  opts?: {
    costUsd?: number | null;
    linkedName?: string | null;
    sourceProduct?: ProductDTO | null;
    sourceMode?: PriceMode | null;
    id?: string;
  }
): CompareRetailEntry {
  return {
    kind: "retail",
    id: opts?.id ?? uid("r"),
    hit,
    costUsd: opts?.costUsd ?? null,
    linkedName: opts?.linkedName ?? null,
    sourceProduct: opts?.sourceProduct ?? null,
    sourceMode: opts?.sourceMode ?? null,
  };
}

export function entryKey(entry: CompareEntry): string {
  if (entry.kind === "retail") return `retail:${entry.hit.id}`;
  return `provider:${entry.product.provider}:${entry.product.externalId}:${entry.mode}`;
}

/** Misma pieza de mayorista, sin importar modo / local de referencia. */
export function sameProviderProduct(entry: CompareEntry, product: ProductDTO): boolean {
  if (entry.kind === "provider") {
    return entry.product.provider === product.provider && entry.product.externalId === product.externalId;
  }
  const src = entry.sourceProduct;
  return !!src && src.provider === product.provider && src.externalId === product.externalId;
}

export function loadCompareEntries(): CompareEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CompareEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => e && (e.kind === "provider" || e.kind === "retail") && e.id);
  } catch {
    return [];
  }
}

export function saveCompareEntries(entries: CompareEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* quota */
  }
}

export function loadManualOrder(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MANUAL_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveManualOrder(on: boolean) {
  try {
    localStorage.setItem(MANUAL_KEY, on ? "1" : "0");
  } catch {
    /* quota */
  }
}

export const MODE_LABEL: Record<PriceMode | "local", string> = {
  list: "Normal",
  offline: "Offline",
  scheme: "Esquema",
  local: "Local",
};

export const MODE_HINT: Record<PriceMode | "local", string> = {
  list: "Precio de lista del portal",
  offline: "Sin facturar · sin percepciones",
  scheme: "Facturado con ajuste del comercio",
  local: "Precio de venta de un local (todo incluido)",
};
