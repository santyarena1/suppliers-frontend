"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Search, Store, X } from "lucide-react";
import { retailApi, type RetailSearchHit } from "@/lib/api";
import { formatARS, proxyImg } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";

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

export default function SalePricePanel({
  open,
  onClose,
  seedQuery,
  costUsd,
}: {
  open: boolean;
  onClose: () => void;
  seedQuery: string;
  costUsd?: number | null;
}) {
  const initial = useMemo(() => simplifyQuery(seedQuery), [seedQuery]);
  const [q, setQ] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RetailSearchHit[]>([]);
  const [tokens, setTokens] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) setQ(simplifyQuery(seedQuery));
  }, [open, seedQuery]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !q.trim()) return;
    const handle = setTimeout(() => {
      void runSearch(q);
    }, 280);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q]);

  async function runSearch(query: string) {
    setLoading(true);
    setError("");
    try {
      const res = await retailApi.search(query, 30);
      setResults(res.data.results ?? []);
      setTokens(res.data.tokens ?? []);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message || "No se pudo buscar referencias de venta");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const prices = results.map((r) => r.price).filter((n) => n > 0);
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar"
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <aside className="fixed z-50 inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl border border-surface-700 bg-surface-950 shadow-2xl flex flex-col md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:max-h-none md:w-[420px] md:rounded-none md:border-l md:border-t-0 md:border-b-0">
        <header className="flex-shrink-0 border-b border-surface-800 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Precios de venta encontrados</p>
              <p className="text-[11px] text-surface-400 mt-1 leading-relaxed">
                Referencia de mercado en locales de computación. Sirve para estimar a cuánto se
                vende el producto afuera y calcular margen. No es tu precio de compra ni una oferta
                de NODO.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-surface-500 hover:text-white p-1 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
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

          {(min != null || max != null) && (
            <p className="text-[11px] text-surface-300 mt-2">
              Rango: <span className="font-semibold text-emerald-400">{formatARS(min!)}</span>
              {max != null && max !== min && (
                <>
                  {" "}– <span className="font-semibold text-emerald-400">{formatARS(max)}</span>
                </>
              )}
              <span className="text-surface-500"> · {results.length} refs.</span>
            </p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
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
              (marca + modelo).
            </p>
          )}

          {!loading &&
            results.map((hit) => (
              <RetailHitCard key={hit.id} hit={hit} costUsd={costUsd} />
            ))}
        </div>
      </aside>
    </>
  );
}

function RetailHitCard({ hit, costUsd }: { hit: RetailSearchHit; costUsd?: number | null }) {
  const [imgErr, setImgErr] = useState(false);
  const { convert } = usePrefs();
  const costArs = costUsd != null && costUsd > 0 ? convert(costUsd).amount : null;
  const margin =
    costArs != null && costArs > 0 && hit.price > 0
      ? (hit.price / costArs - 1) * 100
      : null;

  return (
    <article className="rounded-xl border border-surface-800 bg-surface-900/80 p-3 flex gap-3">
      <div className="w-14 h-14 rounded-lg bg-white flex-shrink-0 overflow-hidden flex items-center justify-center">
        {hit.imageUrl && !imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(hit.imageUrl)}
            alt=""
            className="w-full h-full object-contain p-1"
            onError={() => setImgErr(true)}
          />
        ) : (
          <Store className="w-5 h-5 text-slate-400" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          {hit.store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(hit.store.logoUrl)} alt="" className="w-4 h-4 object-contain rounded-sm" />
          ) : (
            <Store className="w-3.5 h-3.5 text-surface-500" />
          )}
          <span className="text-[11px] font-semibold text-brand-300 truncate">{hit.store.name}</span>
          <span className="text-[10px] text-surface-600 ml-auto flex-shrink-0">{timeAgo(hit.syncedAt)}</span>
        </div>

        <p className="text-xs text-surface-100 leading-snug line-clamp-2">{hit.name}</p>

        {hit.categoryName && (
          <p className="text-[10px] text-surface-500 mt-0.5 truncate">{hit.categoryName}</p>
        )}

        {hit.description && (
          <p className="text-[10px] text-surface-500 mt-1 line-clamp-2">{hit.description}</p>
        )}

        <div className="flex items-end justify-between gap-2 mt-2">
          <div>
            <p className="text-sm font-bold text-emerald-400 tabular-nums">{formatARS(hit.price)}</p>
            {margin != null && Number.isFinite(margin) && (
              <p className={`text-[10px] tabular-nums ${margin >= 0 ? "text-emerald-500/80" : "text-amber-400/80"}`}>
                vs tu costo: {margin >= 0 ? "+" : ""}
                {margin.toFixed(0)}%
              </p>
            )}
          </div>
          {hit.productUrl && (
            <a
              href={hit.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-surface-400 hover:text-white flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              Ver local <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {hit.priceHistory.length > 0 && (
          <div className="mt-2 pt-2 border-t border-surface-800">
            <p className="text-[10px] text-surface-500 mb-1">Historial reciente</p>
            <ul className="space-y-0.5">
              {hit.priceHistory.slice(0, 4).map((h, i) => (
                <li key={`${hit.id}-h-${i}`} className="text-[10px] text-surface-400 flex justify-between gap-2">
                  <span className="tabular-nums">
                    {h.previousPrice != null ? `${formatARS(h.previousPrice)} → ` : ""}
                    {formatARS(h.price)}
                  </span>
                  <span className="text-surface-600 flex-shrink-0">
                    {new Date(h.changedAt).toLocaleDateString("es-AR")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}
