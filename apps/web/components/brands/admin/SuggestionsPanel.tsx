"use client";

import { useState } from "react";
import { Loader2, Package, Plus, Sparkles } from "lucide-react";
import { assetUrl } from "@/lib/assets";
import type { BrandSuggestedItem } from "@/lib/api";

const PAGE = 8;

/**
 * Productos de la marca que NODO encontró en los catálogos de los distribuidores,
 * ya agrupados por EAN / part number. La marca los suma de a uno o todos juntos.
 */
export function SuggestionsPanel({
  suggestions,
  canWrite,
  onAdd,
}: {
  suggestions: BrandSuggestedItem[];
  canWrite: boolean;
  onAdd: (items: BrandSuggestedItem[]) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (suggestions.length === 0) return null;
  const list = showAll ? suggestions : suggestions.slice(0, PAGE);

  async function add(key: string, items: BrandSuggestedItem[]) {
    setBusy(key);
    try {
      await onAdd(items);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/10 via-surface-900/60 to-surface-900/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-white">
            <Sparkles className="w-4 h-4 text-brand-400" />
            Encontramos {suggestions.length} {suggestions.length === 1 ? "producto" : "productos"} tuyos en los distribuidores
          </h2>
          <p className="text-xs text-surface-400 mt-0.5">
            Juntamos el mismo producto de varios distribuidores por EAN o part number. Revisalos y sumalos.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => add("__all__", suggestions)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-40"
          >
            {busy === "__all__" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Sumar todos
          </button>
        )}
      </div>

      <ul className="mt-4 divide-y divide-surface-800/80">
        {list.map((s) => {
          const key = s.skus.map((k) => `${k.provider}:${k.externalId}`).join("|");
          return (
            <li key={key} className="flex items-center gap-3 py-2.5">
              <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-black/40 overflow-hidden">
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assetUrl(s.imageUrl)} alt="" className="w-full h-full object-contain p-1" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-4 h-4 text-white/25" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{s.name}</p>
                <p className="text-[11px] text-surface-400 truncate">
                  {s.partNumber && <span className="font-mono mr-2">{s.partNumber}</span>}
                  {s.skus.map((k) => k.label).join(" · ")}
                </p>
              </div>
              <span className="hidden sm:inline text-[11px] text-surface-500 tabular-nums">
                {s.skus.length} {s.skus.length === 1 ? "distribuidor" : "distribuidores"}
              </span>
              {canWrite && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => add(key, [s])}
                  className="inline-flex items-center gap-1 rounded-md border border-surface-700 px-2 py-1 text-xs text-surface-200 hover:border-brand-500 hover:text-white disabled:opacity-40"
                >
                  {busy === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Sumar
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {suggestions.length > PAGE && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-xs font-semibold text-brand-400"
        >
          {showAll ? "Ver menos" : `Ver las ${suggestions.length} sugerencias`}
        </button>
      )}
    </section>
  );
}
