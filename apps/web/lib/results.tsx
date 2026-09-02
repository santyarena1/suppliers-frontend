"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { ProductDTO } from "@/lib/api";

const RESULTS_KEY = "tgs_last_results";
const UI_KEY = "tgs_search_ui_v1";

export interface SearchUiState {
  sortBy?: "default" | "price_asc" | "price_desc" | "name_asc" | "name_desc";
  viewMode?: "grid" | "list" | "grouped";
  refineText?: string;
  minPrice?: string;
  maxPrice?: string;
  hideNoImage?: boolean;
  includeOutOfStock?: boolean;
  scrollTop?: number;
}

interface ResultsContextValue {
  results: ProductDTO[];
  query: string;
  hydrated: boolean;
  setResults: (q: string, r: ProductDTO[]) => void;
  clearResults: () => void;
  find: (provider: string, externalId: string) => ProductDTO | undefined;
  getUiState: () => SearchUiState | null;
  setUiState: (patch: SearchUiState) => void;
}

const ResultsContext = createContext<ResultsContextValue | null>(null);

function readStoredResults(): { q: string; r: ProductDTO[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RESULTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { q?: string; r?: ProductDTO[] };
    if (!parsed?.q || !Array.isArray(parsed.r)) return null;
    return { q: parsed.q, r: parsed.r };
  } catch {
    return null;
  }
}

function readUiState(): SearchUiState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(UI_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SearchUiState;
  } catch {
    return null;
  }
}

export function ResultsProvider({ children }: { children: React.ReactNode }) {
  const [results, setResultsState] = useState<ProductDTO[]>([]);
  const [query, setQuery] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredResults();
    if (stored) {
      setQuery(stored.q);
      setResultsState(stored.r);
    }
    setHydrated(true);
  }, []);

  const setResults = useCallback((q: string, r: ProductDTO[]) => {
    setQuery(q);
    setResultsState(r);
    try {
      sessionStorage.setItem(RESULTS_KEY, JSON.stringify({ q, r }));
    } catch { /**/ }
  }, []);

  const clearResults = useCallback(() => {
    setQuery("");
    setResultsState([]);
    try {
      sessionStorage.removeItem(RESULTS_KEY);
      sessionStorage.removeItem(UI_KEY);
    } catch { /**/ }
  }, []);

  const find = useCallback((provider: string, externalId: string) => {
    let arr = results;
    if (arr.length === 0) {
      const stored = readStoredResults();
      if (stored) arr = stored.r;
    }
    return arr.find((p) => p.provider === provider && p.externalId === externalId);
  }, [results]);

  const getUiState = useCallback(() => readUiState(), []);

  const setUiState = useCallback((patch: SearchUiState) => {
    try {
      const prev = readUiState() || {};
      sessionStorage.setItem(UI_KEY, JSON.stringify({ ...prev, ...patch }));
    } catch { /**/ }
  }, []);

  return (
    <ResultsContext.Provider
      value={{ results, query, hydrated, setResults, clearResults, find, getUiState, setUiState }}
    >
      {children}
    </ResultsContext.Provider>
  );
}

export function useResults() {
  const ctx = useContext(ResultsContext);
  if (!ctx) throw new Error("useResults must be used inside ResultsProvider");
  return ctx;
}
