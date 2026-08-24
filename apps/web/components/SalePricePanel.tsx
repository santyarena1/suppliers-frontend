"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Search,
  Store,
  X,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  retailApi,
  type RetailProductDetail,
  type RetailSearchHit,
} from "@/lib/api";
import { formatARS, proxyImg } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import {
  clearHiddenStoreIds,
  loadHiddenStoreIds,
  loadRememberHiddenStores,
  loadRetailSort,
  saveHiddenStoreIds,
  saveRememberHiddenStores,
  saveRetailSort,
  type RetailSortKey,
} from "@/lib/retailPanelPrefs";
import {
  BEST_MATCH_THRESHOLD,
  marginVsCostPercent,
  queryMatchRatio,
  repairImplausibleSalePrice,
} from "@/lib/retailMatch";

function simplifyQuery(name: string): string {
  return name
    .replace(/[^\p{L}\p{N}\s+.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 1)
    .slice(0, 8)
    .join(" ");
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "hace minutos";
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

const SORT_OPTIONS: { value: RetailSortKey; label: string }[] = [
  { value: "relevance", label: "Relevancia" },
  { value: "price_asc", label: "Precio ↑" },
  { value: "price_desc", label: "Precio ↓" },
  { value: "store_asc", label: "Local A-Z" },
];

function sortHits(hits: RetailSearchHit[], sort: RetailSortKey): RetailSearchHit[] {
  const arr = [...hits];
  if (sort === "price_asc") return arr.sort((a, b) => a.price - b.price);
  if (sort === "price_desc") return arr.sort((a, b) => b.price - a.price);
  if (sort === "store_asc") {
    return arr.sort((a, b) => a.store.name.localeCompare(b.store.name, "es") || a.price - b.price);
  }
  // relevance: API score desc, then price asc as tiebreak
  return arr.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.price - b.price);
}

export default function SalePricePanel({
  open = true,
  onClose,
  seedQuery,
  costUsd,
  variant = "drawer",
}: {
  open?: boolean;
  onClose?: () => void;
  seedQuery: string;
  costUsd?: number | null;
  /** drawer = panel lateral (cards); inline = sección en la ficha de producto */
  variant?: "drawer" | "inline";
}) {
  const inline = variant === "inline";
  const active = inline || open;
  const { convert } = usePrefs();
  const costArs = costUsd != null && costUsd > 0 ? convert(costUsd).amount : null;
  const initial = useMemo(() => simplifyQuery(seedQuery), [seedQuery]);
  const [q, setQ] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RetailSearchHit[]>([]);
  const [totalMatched, setTotalMatched] = useState(0);
  const [tokens, setTokens] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState<RetailSortKey>(() =>
    typeof window !== "undefined" ? loadRetailSort() : "relevance",
  );
  const [hiddenStoreIds, setHiddenStoreIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    return loadRememberHiddenStores() ? loadHiddenStoreIds() : [];
  });
  const [rememberHidden, setRememberHidden] = useState(() =>
    typeof window !== "undefined" ? loadRememberHiddenStores() : false,
  );
  const [storesOpen, setStoresOpen] = useState(false);
  const prefsReady = useRef(typeof window !== "undefined");
  const activeSearchQ = useRef("");

  useEffect(() => {
    if (prefsReady.current) return;
    setSortBy(loadRetailSort());
    const remember = loadRememberHiddenStores();
    setRememberHidden(remember);
    setHiddenStoreIds(remember ? loadHiddenStoreIds() : []);
    prefsReady.current = true;
  }, []);

  useEffect(() => {
    if (active) {
      setQ(simplifyQuery(seedQuery));
      setSelectedId(null);
    }
  }, [active, seedQuery]);

  useEffect(() => {
    if (!active || inline) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedId) setSelectedId(null);
        else onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, inline, onClose, selectedId]);

  useEffect(() => {
    if (!active || !q.trim()) return;
    const handle = setTimeout(() => {
      void runSearch(q);
    }, 280);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, q]);

  function applyHidden(next: string[], persist: boolean) {
    setHiddenStoreIds(next);
    if (persist) saveHiddenStoreIds(next);
  }

  function toggleStoreHidden(storeId: string) {
    setHiddenStoreIds((prev) => {
      const next = prev.includes(storeId)
        ? prev.filter((id) => id !== storeId)
        : [...prev, storeId];
      if (rememberHidden) saveHiddenStoreIds(next);
      return next;
    });
  }

  function setSort(next: RetailSortKey) {
    setSortBy(next);
    saveRetailSort(next);
  }

  function setRemember(on: boolean) {
    setRememberHidden(on);
    saveRememberHiddenStores(on);
    if (on) {
      saveHiddenStoreIds(hiddenStoreIds);
    } else {
      clearHiddenStoreIds();
    }
  }

  async function runSearch(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;

    // Nueva búsqueda: si no se recuerda, limpia locales ocultos
    if (
      prefsReady.current &&
      activeSearchQ.current &&
      activeSearchQ.current.toLowerCase() !== trimmed.toLowerCase() &&
      !rememberHidden
    ) {
      applyHidden([], false);
    }
    activeSearchQ.current = trimmed;

    setLoading(true);
    setError("");
    try {
      const res = await retailApi.search(trimmed, 60);
      setResults(res.data.results ?? []);
      setTokens(res.data.tokens ?? []);
      setTotalMatched(res.data.totalMatched ?? res.data.results?.length ?? 0);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message || "No se pudo buscar referencias de venta");
      setResults([]);
      setTotalMatched(0);
    } finally {
      setLoading(false);
    }
  }

  const storesInResults = useMemo(() => {
    const map = new Map<string, { id: string; name: string; logoUrl: string | null; count: number }>();
    for (const hit of results) {
      const cur = map.get(hit.store.id);
      if (cur) cur.count += 1;
      else {
        map.set(hit.store.id, {
          id: hit.store.id,
          name: hit.store.name,
          logoUrl: hit.store.logoUrl,
          count: 1,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [results]);

  const visibleResults = useMemo(() => {
    const hidden = new Set(hiddenStoreIds);
    const filtered = results.filter((r) => !hidden.has(r.store.id));
    // Match vs la query que el usuario escribió (no el nombre largo del proveedor)
    const matchAgainst = q.trim() || seedQuery;
    const enriched = filtered.map((hit) => {
      const price = repairImplausibleSalePrice(hit.price, costArs);
      const fixed = price !== hit.price ? { ...hit, price } : hit;
      return {
        hit: fixed,
        matchRatio: queryMatchRatio(matchAgainst, hit.name),
        marginPct: marginVsCostPercent(price, costArs),
      };
    });
    const sortedHits = sortHits(
      enriched.map((e) => e.hit),
      sortBy,
    );
    const map = new Map(enriched.map((e) => [e.hit.id, e]));
    return sortedHits.map((hit) => map.get(hit.id)!);
  }, [results, hiddenStoreIds, sortBy, seedQuery, q, costArs]);

  const bestMatches = useMemo(
    () =>
      [...visibleResults]
        .filter((x) => x.matchRatio >= BEST_MATCH_THRESHOLD)
        .sort((a, b) => b.matchRatio - a.matchRatio || a.hit.price - b.hit.price),
    [visibleResults],
  );

  const otherMatches = useMemo(() => {
    const bestIds = new Set(bestMatches.map((x) => x.hit.id));
    return visibleResults.filter((x) => !bestIds.has(x.hit.id));
  }, [visibleResults, bestMatches]);

  if (!active) return null;

  const prices = visibleResults
    .map((r) => r.hit.price)
    .filter((n) => n > 0 && n <= 25_000_000);
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const storeCount = new Set(visibleResults.map((r) => r.hit.store.id)).size;
  const hiddenCount = hiddenStoreIds.filter((id) =>
    storesInResults.some((s) => s.id === id),
  ).length;

  const toolbar = (
        <header className={`flex-shrink-0 ${inline ? "" : "border-b border-surface-800 px-4 py-3"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`font-semibold text-white ${inline ? "text-base" : "text-sm"}`}>
                Precios de venta en locales
              </p>
              <p className="text-[11px] text-surface-400 mt-1 leading-relaxed max-w-3xl">
                Referencia de mercado en locales de computación. Sirve para estimar a cuánto se
                vende el producto afuera y calcular margen. No es tu precio de compra ni una oferta
                de NODO.
              </p>
            </div>
            {!inline && (
              <button
                type="button"
                onClick={() => onClose?.()}
                className="text-surface-500 hover:text-white p-1 rounded-md flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <form
            className="mt-3 relative"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(q);
            }}
          >
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ajustá la búsqueda (amplia)..."
              className="w-full bg-surface-900 border border-surface-700 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
            />
          </form>

          {tokens.length > 0 && (
            <p className="text-[10px] text-surface-500 mt-2">
              Criterios amplios: {tokens.join(" · ")}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <ArrowUpDown className="w-3 h-3 text-surface-500 flex-shrink-0" />
              <select
                value={sortBy}
                onChange={(e) => setSort(e.target.value as RetailSortKey)}
                className="w-full bg-surface-900 border border-surface-700 rounded-md px-2 py-1.5 text-[11px] text-surface-200 focus:outline-none focus:border-brand-500 cursor-pointer"
                aria-label="Ordenar resultados"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setStoresOpen((v) => !v)}
              className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-md border transition-colors flex-shrink-0 ${
                storesOpen || hiddenCount > 0
                  ? "border-brand-500/40 bg-brand-600/10 text-brand-300"
                  : "border-surface-700 text-surface-400 hover:text-surface-200"
              }`}
            >
              <Store className="w-3 h-3" />
              Locales
              {hiddenCount > 0 && (
                <span className="bg-brand-600 text-white rounded-full min-w-[1rem] h-4 px-1 flex items-center justify-center text-[9px] leading-none">
                  {hiddenCount}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 transition-transform ${storesOpen ? "rotate-180" : ""}`} />
            </button>
          </div>

          {storesOpen && (
            <div className="mt-2 rounded-lg border border-surface-800 bg-surface-900/70 p-2.5 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberHidden}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="mt-0.5 rounded border-surface-600 bg-surface-800 text-brand-500 focus:ring-brand-500/30"
                />
                <span className="text-[11px] text-surface-300 leading-snug">
                  Recordar locales ocultos entre búsquedas
                  <span className="block text-[10px] text-surface-500 mt-0.5">
                    Si está apagado, se reinician al buscar otra cosa.
                  </span>
                </span>
              </label>

              {storesInResults.length === 0 ? (
                <p className="text-[10px] text-surface-500 px-0.5 py-1">
                  Todavía no hay locales en estos resultados.
                </p>
              ) : (
                <ul className="max-h-36 overflow-y-auto space-y-0.5 pr-0.5">
                  {storesInResults.map((store) => {
                    const hidden = hiddenStoreIds.includes(store.id);
                    return (
                      <li key={store.id}>
                        <button
                          type="button"
                          onClick={() => toggleStoreHidden(store.id)}
                          className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                            hidden
                              ? "bg-surface-950/80 text-surface-500"
                              : "hover:bg-surface-800 text-surface-200"
                          }`}
                        >
                          {store.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={proxyImg(store.logoUrl)}
                              alt=""
                              className={`w-4 h-4 object-contain rounded-sm flex-shrink-0 ${hidden ? "opacity-40" : ""}`}
                            />
                          ) : (
                            <Store className={`w-3.5 h-3.5 flex-shrink-0 ${hidden ? "text-surface-600" : "text-surface-500"}`} />
                          )}
                          <span className={`text-[11px] truncate flex-1 ${hidden ? "line-through" : "font-medium"}`}>
                            {store.name}
                          </span>
                          <span className="text-[10px] text-surface-600 tabular-nums">{store.count}</span>
                          {hidden ? (
                            <EyeOff className="w-3.5 h-3.5 text-surface-500 flex-shrink-0" />
                          ) : (
                            <Eye className="w-3.5 h-3.5 text-emerald-400/80 flex-shrink-0" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {hiddenStoreIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => applyHidden([], rememberHidden)}
                  className="text-[10px] text-surface-400 hover:text-white"
                >
                  Mostrar todos los locales
                </button>
              )}
            </div>
          )}

          {(min != null || visibleResults.length > 0 || results.length > 0) && (
            <p className="text-[11px] text-surface-300 mt-2">
              {min != null && (
                <>
                  Rango: <span className="font-semibold text-emerald-400">{formatARS(min)}</span>
                  {max != null && max !== min && (
                    <>
                      {" "}
                      – <span className="font-semibold text-emerald-400">{formatARS(max)}</span>
                    </>
                  )}
                  <span className="text-surface-600"> · </span>
                </>
              )}
              <span className="text-surface-400">
                {visibleResults.length} mostrados
                {results.length !== visibleResults.length ? ` (${results.length - visibleResults.length} ocultos)` : ""}
                {totalMatched > results.length ? ` · ${totalMatched} match` : ""}
                {storeCount > 0 ? ` · ${storeCount} locales` : ""}
              </span>
            </p>
          )}
        </header>
  );

  const body = (
        <div className={inline
          ? "mt-4"
          : "flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 touch-pan-y"
        }>
          {loading && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          )}
          {!loading && error && (
            <p className="text-xs text-red-400 text-center py-8">{error}</p>
          )}
          {!loading && !error && results.length === 0 && (
            <p className="text-xs text-surface-500 text-center py-8 px-4">
              No encontramos referencias parecidas. Probá editar la búsqueda con menos palabras
              (marca + modelo). Si el catálogo todavía se está sincronizando, reintentá en unos
              minutos.
            </p>
          )}
          {!loading && !error && results.length > 0 && visibleResults.length === 0 && (
            <p className="text-xs text-surface-500 text-center py-8 px-4">
              Todos los locales de estos resultados están ocultos.{" "}
              <button
                type="button"
                onClick={() => applyHidden([], rememberHidden)}
                className="text-brand-400 hover:text-brand-300 underline underline-offset-2"
              >
                Mostrar todos
              </button>
            </p>
          )}

          {!loading && visibleResults.length > 0 && (
            <div className="space-y-4">
              {bestMatches.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-emerald-300 mb-2 px-0.5">
                    Mejores coincidencias
                    <span className="text-surface-500 font-normal"> · ≥85% de palabras de la búsqueda</span>
                  </p>
                  <div className={inline
                    ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                    : "space-y-2"
                  }>
                    {bestMatches.map(({ hit, matchRatio, marginPct }) => (
                      <RetailHitCard
                        key={hit.id}
                        hit={hit}
                        matchRatio={matchRatio}
                        marginPct={marginPct}
                        best
                        onOpen={() => setSelectedId(hit.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {otherMatches.length > 0 && (
                <div>
                  {bestMatches.length > 0 && (
                    <p className="text-[11px] font-semibold text-surface-400 mb-2 px-0.5">
                      Otras referencias
                    </p>
                  )}
                  <div className={inline
                    ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                    : "space-y-2"
                  }>
                    {otherMatches.map(({ hit, matchRatio, marginPct }) => (
                      <RetailHitCard
                        key={hit.id}
                        hit={hit}
                        matchRatio={matchRatio}
                        marginPct={marginPct}
                        onOpen={() => setSelectedId(hit.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
  );

  if (inline) {
    return (
      <div className="w-full">
        <section className="bg-surface-900 border border-surface-800 rounded-2xl p-4 sm:p-5">
          {toolbar}
          {body}
        </section>
        {selectedId && (
          <RetailDetailModal
            productId={selectedId}
            costUsd={costUsd}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar"
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
        onClick={() => onClose?.()}
      />

      {/* min-h-0 + h-full: sin esto flex-1 overflow-y-auto no scrollea */}
      <aside className="fixed z-50 inset-x-0 bottom-0 h-[88vh] max-h-[88vh] rounded-t-2xl border border-surface-700 bg-surface-950 shadow-2xl flex flex-col md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:h-full md:max-h-none md:w-[420px] md:rounded-none md:border-l md:border-t-0 md:border-b-0">
        {toolbar}
        {body}
      </aside>

      {selectedId && (
        <RetailDetailModal
          productId={selectedId}
          costUsd={costUsd}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}

function RetailHitCard({
  hit,
  onOpen,
  matchRatio,
  marginPct,
  best = false,
}: {
  hit: RetailSearchHit;
  onOpen: () => void;
  matchRatio: number;
  marginPct: number | null;
  best?: boolean;
}) {
  const [imgErr, setImgErr] = useState(false);
  const [logoErr, setLogoErr] = useState(false);
  const matchLabel = `${Math.round(matchRatio * 100)}% match`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left rounded-xl border p-3 flex gap-3 transition-colors ${
        best
          ? "border-emerald-500/35 bg-emerald-500/5 hover:border-emerald-500/55 hover:bg-emerald-500/10"
          : "border-surface-800 bg-surface-900/80 hover:border-surface-600 hover:bg-surface-900"
      }`}
    >
      <div className="w-14 h-14 rounded-lg bg-white flex-shrink-0 overflow-hidden flex items-center justify-center border border-surface-200/20">
        {hit.imageUrl && !imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(hit.imageUrl, { trim: false })}
            alt=""
            className="w-full h-full object-contain p-1.5"
            loading="lazy"
            decoding="async"
            onError={() => setImgErr(true)}
          />
        ) : (
          <Store className="w-5 h-5 text-slate-400" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          {hit.store.logoUrl && !logoErr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImg(hit.store.logoUrl, { trim: false })}
              alt=""
              className="w-4 h-4 object-contain rounded-sm bg-white/90 p-px"
              loading="lazy"
              decoding="async"
              onError={() => setLogoErr(true)}
            />
          ) : (
            <Store className="w-3.5 h-3.5 text-surface-500" />
          )}
          <span className="text-[11px] font-semibold text-brand-300 truncate">{hit.store.name}</span>
          <span className="text-[10px] text-surface-600 ml-auto flex-shrink-0">
            {timeAgo(hit.syncedAt)}
          </span>
        </div>

        <p className="text-xs text-surface-100 leading-snug line-clamp-2">{hit.name}</p>

        {hit.categoryName && (
          <p className="text-[10px] text-surface-500 mt-0.5 truncate">{hit.categoryName}</p>
        )}

        <div className="flex items-end justify-between gap-2 mt-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-emerald-400 tabular-nums">{formatARS(hit.price)}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              <span className={`text-[10px] tabular-nums ${best ? "text-emerald-300/90" : "text-surface-500"}`}>
                {matchLabel}
              </span>
              {marginPct != null && Number.isFinite(marginPct) && (
                <span
                  className={`text-[10px] font-semibold tabular-nums ${
                    marginPct >= 0 ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  vs costo {marginPct >= 0 ? "+" : ""}
                  {marginPct.toFixed(0)}%
                </span>
              )}
            </div>
          </div>
          <span className="text-[10px] text-surface-500 flex items-center gap-0.5 flex-shrink-0">
            Detalle <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </button>
  );
}

function RetailDetailModal({
  productId,
  costUsd,
  onClose,
}: {
  productId: string;
  costUsd?: number | null;
  onClose: () => void;
}) {
  const { convert } = usePrefs();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<RetailProductDetail | null>(null);
  const [error, setError] = useState("");
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    retailApi
      .getProduct(productId)
      .then((r) => {
        if (alive) setDetail(r.data);
      })
      .catch((err: unknown) => {
        if (alive) {
          setError((err as { message?: string })?.message || "No se pudo cargar el detalle");
          setDetail(null);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [productId]);

  const costArs = costUsd != null && costUsd > 0 ? convert(costUsd).amount : null;
  const displayPrice = detail
    ? repairImplausibleSalePrice(detail.price, costArs)
    : 0;
  const margin =
    detail && costArs != null && costArs > 0 && displayPrice > 0
      ? (displayPrice / costArs - 1) * 100
      : null;

  const chartData = !detail?.priceHistory?.length
    ? []
    : detail.priceHistory.map((h) => {
        const price = repairImplausibleSalePrice(h.price, costArs);
        return {
          date: new Date(h.changedAt).toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "short",
          }),
          price,
          fullDate: new Date(h.changedAt).toLocaleString("es-AR"),
        };
      });

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar detalle"
        className="fixed inset-0 z-[60] bg-black/60"
        onClick={onClose}
      />
      <div className="fixed z-[70] inset-x-3 top-[8vh] bottom-[8vh] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg md:max-h-[85vh] rounded-2xl border border-surface-700 bg-surface-950 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800 flex-shrink-0">
          <p className="text-sm font-semibold text-white">Detalle de referencia</p>
          <button type="button" onClick={onClose} className="text-surface-500 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4">
          {loading && (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          )}
          {!loading && error && <p className="text-xs text-red-400 text-center py-8">{error}</p>}
          {!loading && detail && (
            <>
              <div className="flex gap-3">
                <div className="w-20 h-20 rounded-xl bg-white flex-shrink-0 overflow-hidden flex items-center justify-center">
                  {detail.imageUrl && !imgErr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={proxyImg(detail.imageUrl)}
                      alt=""
                      className="w-full h-full object-contain p-1.5"
                      onError={() => setImgErr(true)}
                    />
                  ) : (
                    <Store className="w-7 h-7 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {detail.store.logoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={proxyImg(detail.store.logoUrl)}
                        alt=""
                        className="w-4 h-4 object-contain"
                      />
                    )}
                    <span className="text-xs font-semibold text-brand-300">{detail.store.name}</span>
                  </div>
                  <p className="text-sm text-white font-medium leading-snug">{detail.name}</p>
                  {detail.categoryName && (
                    <p className="text-[11px] text-surface-500 mt-1">{detail.categoryName}</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-surface-800 bg-surface-900/60 p-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-surface-500">Precio de venta</p>
                  <p className="text-xl font-bold text-emerald-400 tabular-nums mt-0.5">
                    {formatARS(displayPrice)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-surface-500">Vs tu costo</p>
                  {margin != null && Number.isFinite(margin) ? (
                    <>
                      <p
                        className={`text-xl font-bold tabular-nums mt-0.5 ${
                          margin >= 0 ? "text-emerald-400" : "text-amber-400"
                        }`}
                      >
                        {margin >= 0 ? "+" : ""}
                        {margin.toFixed(0)}%
                      </p>
                      {costArs != null && (
                        <p className="text-[10px] text-surface-500 mt-0.5">
                          Costo ref. {formatARS(costArs)}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-surface-500 mt-1">Sin costo de compra</p>
                  )}
                </div>
              </div>

              {detail.description && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">
                    Descripción
                  </p>
                  <p className="text-xs text-surface-300 leading-relaxed whitespace-pre-wrap">
                    {detail.description}
                  </p>
                </div>
              )}

              <div>
                <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-2">
                  Historial de precio
                </p>
                {chartData.length >= 2 ? (
                  <div className="h-52 rounded-xl border border-surface-800 bg-surface-900/40 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: "#71717a" }}
                          axisLine={{ stroke: "#3f3f46" }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#71717a" }}
                          axisLine={false}
                          tickLine={false}
                          width={56}
                          tickFormatter={(v) =>
                            `$${Number(v).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
                          }
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#18181b",
                            border: "1px solid #3f3f46",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          labelStyle={{ color: "#a1a1aa" }}
                          formatter={(value) => [
                            formatARS(Number(value)),
                            "Precio de venta",
                          ]}
                        />
                        {costArs != null && costArs > 0 && (
                          <ReferenceLine
                            y={costArs}
                            stroke="#f59e0b"
                            strokeDasharray="4 4"
                            label={{
                              value: "Tu costo",
                              fill: "#f59e0b",
                              fontSize: 10,
                              position: "insideTopRight",
                            }}
                          />
                        )}
                        <Line
                          type="stepAfter"
                          dataKey="price"
                          stroke="#34d399"
                          strokeWidth={2}
                          dot={{ r: 3, fill: "#34d399" }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-xs text-surface-500 border border-dashed border-surface-800 rounded-xl px-3 py-6 text-center">
                    Todavía no hay suficiente historial para graficar.
                  </p>
                )}
              </div>

              <p className="text-[10px] text-surface-600">
                Actualizado {timeAgo(detail.syncedAt) || "recién"}
              </p>

              {detail.productUrl && (
                <a
                  href={detail.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold py-2.5 transition-colors"
                >
                  Ver en el local <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
