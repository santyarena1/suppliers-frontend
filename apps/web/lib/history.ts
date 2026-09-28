import { getUser } from "./auth";

const BASE_KEY = "tgs_search_history_v1";

/**
 * Una por usuario: en una misma computadora (o al "Entrar como") cada persona
 * ve solo sus búsquedas.
 */
function historyKey(): string {
  const id = getUser()?.id;
  return id ? `${BASE_KEY}:${id}` : BASE_KEY;
}

export interface SearchEntry {
  query: string;
  count: number;
  lastAt: number;
}

export function trackSearch(query: string) {
  if (typeof window === "undefined") return;
  const q = query.trim();
  if (!q) return;
  try {
    const raw = localStorage.getItem(historyKey());
    const arr: SearchEntry[] = raw ? JSON.parse(raw) : [];
    const idx = arr.findIndex((e) => e.query.toLowerCase() === q.toLowerCase());
    if (idx >= 0) {
      arr[idx] = { ...arr[idx], count: arr[idx].count + 1, lastAt: Date.now() };
    } else {
      arr.push({ query: q, count: 1, lastAt: Date.now() });
    }
    if (arr.length > 100) arr.splice(0, arr.length - 100);
    localStorage.setItem(historyKey(), JSON.stringify(arr));
  } catch { /**/ }
}

export function getHistory(): SearchEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(historyKey());
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function getRecentSearches(limit = 8): SearchEntry[] {
  return [...getHistory()].sort((a, b) => b.lastAt - a.lastAt).slice(0, limit);
}

export function getTopSearches(limit = 8): SearchEntry[] {
  return [...getHistory()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function clearHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(historyKey());
}
