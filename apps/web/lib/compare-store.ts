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
};

export type CompareEntry = CompareProviderEntry | CompareRetailEntry;

const STORAGE_KEY = "nodo_comparador_v1";

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newProviderEntry(product: ProductDTO, mode: PriceMode = "list"): CompareProviderEntry {
  return { kind: "provider", id: uid("p"), product, mode };
}

export function newRetailEntry(
  hit: RetailSearchHit,
  opts?: { costUsd?: number | null; linkedName?: string | null }
): CompareRetailEntry {
  return {
    kind: "retail",
    id: uid("r"),
    hit,
    costUsd: opts?.costUsd ?? null,
    linkedName: opts?.linkedName ?? null,
  };
}

export function entryKey(entry: CompareEntry): string {
  if (entry.kind === "retail") return `retail:${entry.hit.id}`;
  return `provider:${entry.product.provider}:${entry.product.externalId}:${entry.mode}`;
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

export const MODE_LABEL: Record<PriceMode, string> = {
  list: "Normal",
  offline: "Offline",
  scheme: "Esquema",
};

export const MODE_HINT: Record<PriceMode, string> = {
  list: "Precio de lista del portal",
  offline: "Sin facturar · sin percepciones",
  scheme: "Facturado con ajuste del comercio",
};
