"use client";

import { useEffect, useState } from "react";
import { isListProvider, listImportsApi, type ListFreshness } from "./api";
import { getTenant, isAdmin } from "./auth";

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { value: ListFreshness | null; at: number }>();
const inflight = new Map<string, Promise<ListFreshness | null>>();

/** Roles que pueden subir listas: son los que ven la leyenda "lista vencida". */
const ROLES_CAN_UPLOAD = new Set(["OWNER", "ADMIN", "PRODUCT_MANAGER"]);

export function canUploadLists(): boolean {
  if (isAdmin()) return true;
  const role = getTenant()?.role;
  return Boolean(role && ROLES_CAN_UPLOAD.has(role));
}

export async function loadListFreshness(provider: string, force = false): Promise<ListFreshness | null> {
  if (!isListProvider(provider)) return null;
  const hit = cache.get(provider);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const pending = inflight.get(provider);
  if (!force && pending) return pending;
  const p = listImportsApi
    .freshness(provider)
    .then((r) => r.data)
    .catch(() => null)
    .then((value) => {
      cache.set(provider, { value, at: Date.now() });
      return value;
    })
    .finally(() => inflight.delete(provider));
  inflight.set(provider, p);
  return p;
}

export function invalidateListFreshness(provider?: string) {
  if (provider) cache.delete(provider);
  else cache.clear();
}

/** Frescura de la lista de un proveedor por lista. `null` para proveedores con API o si falla. */
export function useListFreshness(provider: string | null | undefined, refreshKey?: unknown): ListFreshness | null {
  const [value, setValue] = useState<ListFreshness | null>(() => (provider ? cache.get(provider)?.value ?? null : null));
  useEffect(() => {
    let alive = true;
    if (!provider || !isListProvider(provider)) {
      setValue(null);
      return;
    }
    loadListFreshness(provider, refreshKey !== undefined).then((v) => {
      if (alive) setValue(v);
    });
    return () => {
      alive = false;
    };
  }, [provider, refreshKey]);
  return value;
}

export function freshnessLabel(f: ListFreshness): { text: string; tone: "ok" | "warn" | "bad" | "muted" } {
  switch (f.status) {
    case "OVERDUE":
      return { text: "Lista vencida, se sugiere actualizar", tone: "bad" };
    case "DUE_SOON":
      return { text: "Lista por vencer", tone: "warn" };
    case "OK":
      return { text: "Lista al día", tone: "ok" };
    case "NO_CADENCE":
      return { text: "Sin cadencia definida", tone: "muted" };
    default:
      return { text: "Sin listas cargadas", tone: "muted" };
  }
}
