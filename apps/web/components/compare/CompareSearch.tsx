"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Loader2,
  Package,
  Search,
  Plus,
  Check,
} from "lucide-react";
import { searchApi, type ProductDTO } from "@/lib/api";
import { proxyImg, formatUSD, parsePrice } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { usePurchasePolicies } from "@/lib/purchase";
import { purchaseLinePricing, type PriceMode } from "@/lib/purchase-price";
import ProviderBadge from "@/components/ProviderBadge";
import { MODE_LABEL } from "@/lib/compare-store";

function simplify(q: string) {
  return q.trim().replace(/\s+/g, " ");
}

export default function CompareSearch({
  onAdd,
  existingKeys,
}: {
  onAdd: (product: ProductDTO, mode: PriceMode) => void;
  existingKeys: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ProductDTO[]>([]);
  const [error, setError] = useState("");
  const [openModes, setOpenModes] = useState<string | null>(null);
  const policies = usePurchasePolicies();
  const { withIva, convert, currency } = usePrefs();
  const abortRef = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = simplify(q);
    if (trimmed.length < 2) {
      setResults([]);
      setError("");
      return;
    }
    const ticket = ++abortRef.current;
    setLoading(true);
    setError("");
    try {
      const res = await searchApi.all(trimmed);
      if (ticket !== abortRef.current) return;
      const data = Array.isArray(res.data) ? res.data : [];
      data.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
      setResults(data.slice(0, 40));
    } catch {
      if (ticket !== abortRef.current) return;
      setError("No se pudo buscar. Probá de nuevo.");
      setResults([]);
    } finally {
      if (ticket === abortRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void runSearch(query);
    }, 320);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpenModes(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const hasQuery = simplify(query).length >= 2;

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500 pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscá un producto para comparar…"
          className="w-full bg-surface-900 border border-surface-700 focus:border-brand-500/60 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder:text-surface-500 outline-none transition-colors"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400 animate-spin" />
        )}
      </div>

      {hasQuery && (
        <div className="absolute z-30 left-0 right-0 mt-2 max-h-[min(420px,55vh)] overflow-y-auto rounded-xl border border-surface-700 bg-surface-950 shadow-2xl">
          {error && (
            <p className="px-4 py-3 text-sm text-amber-300">{error}</p>
          )}
          {!loading && !error && results.length === 0 && (
            <p className="px-4 py-6 text-sm text-surface-500 text-center">
              Sin resultados para “{simplify(query)}”
            </p>
          )}
          <ul className="divide-y divide-surface-800/80">
            {results.map((p) => {
              const pid = `${p.provider}:${p.externalId}`;
              const policy = policies[p.provider];
              const list = purchaseLinePricing(p, policy, "list");
              const canOffline = policy?.acceptsOffline;
              const canScheme = policy?.acceptsScheme;
              const display = withIva ? list.unitGross : list.unitNet;
              const alreadyList = existingKeys.has(`provider:${p.provider}:${p.externalId}:list`);
              const modesOpen = openModes === pid;

              return (
                <li key={pid} className="hover:bg-surface-900/80 transition-colors">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className="relative w-12 h-12 rounded-lg bg-white overflow-hidden flex-shrink-0 border border-surface-800">
                      {p.imageUrl ? (
                        <Image
                          src={proxyImg(p.imageUrl)}
                          alt=""
                          fill
                          className="object-contain p-1"
                          unoptimized
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                          <Package className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <ProviderBadge provider={p.provider} size="sm" chip />
                      </div>
                      <p className="text-sm text-white font-medium line-clamp-2 leading-snug">
                        {p.name}
                      </p>
                      <p className="text-[11px] text-surface-500 tabular-nums mt-0.5">
                        {currency === "USD"
                          ? formatUSD(display)
                          : `$${convert(display).amount.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                        <span className="text-surface-600"> · </span>
                        #{p.externalId}
                      </p>
                    </div>
                    <div className="relative flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (canOffline || canScheme) {
                            setOpenModes(modesOpen ? null : pid);
                          } else {
                            onAdd(p, "list");
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                          alreadyList
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            : "bg-brand-600 hover:bg-brand-500 text-white"
                        }`}
                      >
                        {alreadyList ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        {alreadyList ? "En tablero" : "Comparar"}
                      </button>
                      {modesOpen && (
                        <div className="absolute right-0 top-full mt-1.5 w-44 rounded-lg border border-surface-700 bg-surface-900 shadow-xl z-40 overflow-hidden">
                          {(["list", "offline", "scheme"] as PriceMode[]).map((mode) => {
                            const disabled =
                              (mode === "offline" && !canOffline) ||
                              (mode === "scheme" && !canScheme);
                            const key = `provider:${p.provider}:${p.externalId}:${mode}`;
                            const exists = existingKeys.has(key);
                            if (disabled) return null;
                            return (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => {
                                  onAdd(p, mode);
                                  setOpenModes(null);
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-surface-200 hover:bg-surface-800 flex items-center justify-between gap-2"
                              >
                                <span>{MODE_LABEL[mode]}</span>
                                {exists && <Check className="w-3 h-3 text-emerald-400" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
