"use client";

import { useCallback, useEffect, useState } from "react";
import { catalogAdminApi, type CanonicalCatalogBrand } from "@/lib/api";
import { Loader2, Merge, RefreshCw } from "lucide-react";

export default function CatalogBrandsTab({
  showToast,
}: {
  showToast: (m: string, ok?: boolean) => void;
}) {
  const [brands, setBrands] = useState<CanonicalCatalogBrand[]>([]);
  const [duplicates, setDuplicates] = useState<
    { normalizedKey: string; canonicalIds: string[]; displayNames: string[]; count: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [targetId, setTargetId] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([catalogAdminApi.listBrands(), catalogAdminApi.brandDuplicates()])
      .then(([b, d]) => {
        setBrands(b.data);
        setDuplicates(d.data);
      })
      .catch(() => showToast("Error al cargar marcas del catálogo", false))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  async function handleMerge() {
    if (!targetId || selectedSources.size === 0) {
      showToast("Seleccioná marcas a unificar y una destino", false);
      return;
    }
    setMerging(true);
    try {
      await catalogAdminApi.mergeBrands([...selectedSources], targetId);
      showToast("Marcas unificadas");
      setSelectedSources(new Set());
      setTargetId("");
      load();
    } catch {
      showToast("Error al unificar", false);
    } finally {
      setMerging(false);
    }
  }

  async function handleReindex() {
    setReindexing(true);
    try {
      const r = await catalogAdminApi.reindex();
      showToast(`Reindexadas ${r.data.products} fichas`);
      load();
    } catch {
      showToast("Error al reindexar", false);
    } finally {
      setReindexing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Unificación de marcas (catálogo)</h2>
          <p className="text-xs text-surface-500 mt-1 max-w-xl">
            Las marcas canónicas son globales para toda la plataforma. Cada proveedor importa su texto
            crudo; acá unificás variantes como &quot;GIGABYTE&quot; y &quot;Gigabyte&quot; para que el buscador filtre bien.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleReindex()}
          disabled={reindexing}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-surface-700 text-surface-300 hover:text-white disabled:opacity-50"
        >
          {reindexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Reindexar fichas
        </button>
      </div>

      {duplicates.length > 0 && (
        <div className="border border-amber-500/25 bg-amber-500/5 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-amber-300 mb-2">Posibles duplicados detectados</h3>
          <div className="flex flex-col gap-2">
            {duplicates.slice(0, 8).map((d) => (
              <div key={d.normalizedKey} className="text-xs text-surface-300">
                <span className="text-surface-500 font-mono">{d.normalizedKey}</span>
                {" → "}
                {d.displayNames.join(" · ")}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border border-surface-800 rounded-xl p-4 flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Merge className="w-3.5 h-3.5" /> Unificar marcas
        </h3>
        <div className="flex flex-wrap gap-2">
          {brands.slice(0, 40).map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                setSelectedSources((prev) => {
                  const next = new Set(prev);
                  next.has(b.id) ? next.delete(b.id) : next.add(b.id);
                  return next;
                });
              }}
              className={`text-[11px] px-2 py-1 rounded border ${
                selectedSources.has(b.id)
                  ? "border-brand-500 bg-brand-600/15 text-brand-300"
                  : "border-surface-700 text-surface-400"
              }`}
            >
              {b.displayName} ({b.productCount})
            </button>
          ))}
        </div>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white max-w-md"
        >
          <option value="">Marca destino (canonical)</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.displayName}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={merging}
          onClick={() => void handleMerge()}
          className="text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {merging ? "Unificando…" : "Unificar seleccionadas en destino"}
        </button>
      </div>

      <div className="border border-surface-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-surface-900 text-surface-500">
            <tr>
              <th className="text-left px-4 py-2">Marca canónica</th>
              <th className="text-left px-4 py-2">Productos</th>
              <th className="text-left px-4 py-2">Alias</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => (
              <tr key={b.id} className="border-t border-surface-800">
                <td className="px-4 py-2 text-surface-200 font-medium">{b.displayName}</td>
                <td className="px-4 py-2 text-surface-400 tabular-nums">{b.productCount}</td>
                <td className="px-4 py-2 text-surface-500 truncate max-w-md">
                  {b.aliases.slice(0, 4).map((a) => `${a.provider}: ${a.rawBrand}`).join(" · ")}
                  {b.aliases.length > 4 ? ` (+${b.aliases.length - 4})` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
