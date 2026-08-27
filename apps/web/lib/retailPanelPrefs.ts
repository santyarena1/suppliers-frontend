/** Preferencias del panel de precios de venta (cliente). */

export type RetailSortKey = "relevance" | "price_asc" | "price_desc" | "store_asc";

const SORT_KEY = "tgs_retail_sort_v1";
const REMEMBER_KEY = "tgs_retail_hide_remember_v1";
const HIDDEN_KEY = "tgs_retail_hidden_stores_v1";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadRetailSort(): RetailSortKey {
  const v = readJson<string>(SORT_KEY, "price_asc");
  if (v === "price_asc" || v === "price_desc" || v === "store_asc" || v === "relevance") return v;
  return "price_asc";
}

export function saveRetailSort(sort: RetailSortKey) {
  try {
    localStorage.setItem(SORT_KEY, JSON.stringify(sort));
  } catch { /**/ }
}

export function loadRememberHiddenStores(): boolean {
  return readJson<boolean>(REMEMBER_KEY, false);
}

export function saveRememberHiddenStores(on: boolean) {
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify(on));
  } catch { /**/ }
}

export function loadHiddenStoreIds(): string[] {
  const arr = readJson<unknown>(HIDDEN_KEY, []);
  return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
}

export function saveHiddenStoreIds(ids: string[]) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...new Set(ids)]));
  } catch { /**/ }
}

export function clearHiddenStoreIds() {
  try {
    localStorage.removeItem(HIDDEN_KEY);
  } catch { /**/ }
}
