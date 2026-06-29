"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { ProductDTO } from "@/lib/api";

interface ResultsContextValue {
  results: ProductDTO[];
  query: string;
  setResults: (q: string, r: ProductDTO[]) => void;
  find: (provider: string, externalId: string) => ProductDTO | undefined;
}

const ResultsContext = createContext<ResultsContextValue | null>(null);

export function ResultsProvider({ children }: { children: React.ReactNode }) {
  const [results, setResultsState] = useState<ProductDTO[]>([]);
  const [query, setQuery] = useState("");

  const setResults = useCallback((q: string, r: ProductDTO[]) => {
    setQuery(q);
    setResultsState(r);
    try {
      sessionStorage.setItem("tgs_last_results", JSON.stringify({ q, r }));
    } catch { /**/ }
  }, []);

  const find = useCallback((provider: string, externalId: string) => {
    let arr = results;
    if (arr.length === 0) {
      try {
        const raw = sessionStorage.getItem("tgs_last_results");
        if (raw) arr = JSON.parse(raw).r || [];
      } catch { /**/ }
    }
    return arr.find((p) => p.provider === provider && p.externalId === externalId);
  }, [results]);

  return (
    <ResultsContext.Provider value={{ results, query, setResults, find }}>
      {children}
    </ResultsContext.Provider>
  );
}

export function useResults() {
  const ctx = useContext(ResultsContext);
  if (!ctx) throw new Error("useResults must be used inside ResultsProvider");
  return ctx;
}
