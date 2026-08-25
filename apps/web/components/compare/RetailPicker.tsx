"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Loader2,
  Search,
  Store,
  X,
  Plus,
  Check,
} from "lucide-react";
import { retailApi, type RetailSearchHit } from "@/lib/api";
import { formatARS, proxyImg } from "@/lib/format";
import {
  BEST_MATCH_THRESHOLD,
  marginVsCostPercent,
  providerNameMatchRatio,
  repairImplausibleSalePrice,
} from "@/lib/retailMatch";
import { usePrefs } from "@/lib/prefs";

function simplifyQuery(name: string) {
  return name
    .replace(/[^\p{L}\p{N}\s+.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 1)
    .slice(0, 8)
    .join(" ");
}

export default function RetailPicker({
  seedName,
  costUsd,
  existingRetailIds,
  onPick,
  onClose,
}: {
  seedName: string;
  costUsd?: number | null;
  existingRetailIds: Set<string>;
  onPick: (hit: RetailSearchHit) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(() => simplifyQuery(seedName));
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<RetailSearchHit[]>([]);
  const { convert } = usePrefs();
  const costArs = costUsd != null && costUsd > 0 ? convert(costUsd).amount : null;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await retailApi.search(q, 40);
        if (cancelled) return;
        const data = Array.isArray(res.data?.results) ? res.data.results : [];
        setHits(data);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const ranked = useMemo(() => {
    return [...hits]
      .map((h) => {
        const ratio = providerNameMatchRatio(seedName, h.name);
        const sale = repairImplausibleSalePrice(h.price, costArs);
        return { hit: h, ratio, sale };
      })
      .sort((a, b) => b.ratio - a.ratio || a.sale - b.sale);
  }, [hits, seedName, costArs]);

  const best = ranked
    .filter((r) => r.ratio >= BEST_MATCH_THRESHOLD)
    .sort((a, b) => a.sale - b.sale);
  const rest = ranked
    .filter((r) => r.ratio < BEST_MATCH_THRESHOLD)
    .sort((a, b) => a.sale - b.sale);

  function row(item: { hit: RetailSearchHit; ratio: number; sale: number }) {
    const { hit, ratio, sale } = item;
    const exists = existingRetailIds.has(hit.id);
    const margin = marginVsCostPercent(sale, costArs);
    return (
      <button
        key={hit.id}
        type="button"
        onClick={() => onPick(hit)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-800/80 transition-colors border-b border-surface-800/60 last:border-0"
      >
        <div className="w-10 h-10 rounded-lg bg-white overflow-hidden flex-shrink-0 border border-surface-800 flex items-center justify-center">
          {hit.imageUrl || hit.store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImg(hit.imageUrl || hit.store.logoUrl || "")}
              alt=""
              className="w-full h-full object-contain p-0.5"
            />
          ) : (
            <Store className="w-4 h-4 text-slate-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-emerald-400/90 font-medium truncate">{hit.store.name}</p>
          <p className="text-xs text-white line-clamp-2 leading-snug">{hit.name}</p>
          <p className="text-[10px] text-surface-500 mt-0.5">
            Match {Math.round(ratio * 100)}%
            {margin != null && (
              <>
                <span className="text-surface-600"> · </span>
                Margen {margin >= 0 ? "+" : ""}
                {margin.toFixed(0)}%
              </>
            )}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-white tabular-nums">{formatARS(sale)}</p>
          {exists ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 mt-0.5">
              <Check className="w-3 h-3" /> En tablero
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-brand-400 mt-0.5">
              <Plus className="w-3 h-3" /> Usar
            </span>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-surface-700 bg-surface-950 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
          <div>
            <h3 className="text-sm font-semibold text-white">Elegir local de referencia</h3>
            <p className="text-[11px] text-surface-500 mt-0.5 line-clamp-1">{seedName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-surface-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-surface-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-surface-900 border border-surface-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
              placeholder="Buscar en locales…"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400 animate-spin" />
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!loading && ranked.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-surface-500">
              No hay locales para esta búsqueda
            </p>
          )}
          {best.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-emerald-500/80 font-semibold bg-emerald-500/5">
                Mejores coincidencias
              </p>
              {best.map(row)}
            </div>
          )}
          {rest.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-surface-500 font-semibold">
                Otras
              </p>
              {rest.map(row)}
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-surface-800 text-[10px] text-surface-500 flex items-center gap-1.5">
          <ExternalLink className="w-3 h-3" />
          Precios de venta en ARS de tiendas importadas
        </div>
      </div>
    </div>
  );
}
