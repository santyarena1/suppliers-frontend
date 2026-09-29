"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import PrefsPanel from "@/components/PrefsPanel";
import {
  brandApi,
  brandItemsApi,
  type BrandItemsView,
  type BrandSemaphoreStatus,
  type BrandStockSettings,
  type BrandSuggestedItem,
} from "@/lib/api";
import { STOCK_STATUS_DOT, STOCK_STATUS_LABEL, bestStatus } from "@/lib/brand-stock";
import { StockLegend } from "@/components/brands/BrandAvailability";
import { StockSettingsPanel } from "@/components/brands/admin/StockSettingsPanel";
import { SuggestionsPanel } from "@/components/brands/admin/SuggestionsPanel";
import { BrandItemRow, type BrandItemActions } from "@/components/brands/admin/BrandItemRow";

const SUMMARY: BrandSemaphoreStatus[] = ["HIGH", "MEDIUM", "LOW", "NONE", "INCOMING", "UNKNOWN"];

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/**
 * Productos de la marca y su semáforo por distribuidor.
 * Diseño: docs/superpowers/specs/2026-09-29-marcas-semaforo-design.md
 */
export default function BrandProductosPage() {
  const [view, setView] = useState<BrandItemsView | null>(null);
  const [suggestions, setSuggestions] = useState<BrandSuggestedItem[]>([]);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<BrandSemaphoreStatus | "ALL">("ALL");

  const loadSuggestions = useCallback(async () => {
    const res = await brandItemsApi.suggestions();
    setSuggestions(res.data.items);
  }, []);

  useEffect(() => {
    Promise.all([
      brandItemsApi.list().then((res) => setView(res.data)),
      loadSuggestions(),
      brandApi
        .landing()
        .then((res) =>
          setPublicUrl(res.data.published ? `${window.location.origin}${res.data.publicPath}` : null)
        )
        .catch(() => setPublicUrl(null)),
    ])
      .catch((err) => setAviso({ ok: false, text: errMsg(err, "No se pudieron cargar tus productos") }))
      .finally(() => setLoading(false));
  }, [loadSuggestions]);

  /** Corre un cambio que devuelve la vista actualizada y avisa si falla. */
  const run = useCallback(async (fn: () => Promise<{ data: BrandItemsView }>, ok?: string) => {
    try {
      const res = await fn();
      setView(res.data);
      setAviso(ok ? { ok: true, text: ok } : null);
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo guardar") });
    }
  }, []);

  const actions: BrandItemActions = useMemo(
    () => ({
      update: (id, data) => run(() => brandItemsApi.update(id, data), "Producto guardado"),
      remove: async (id) => {
        await run(() => brandItemsApi.remove(id), "Producto quitado");
        await loadSuggestions().catch(() => undefined);
      },
      addLink: async (id, sku) => {
        await run(() => brandItemsApi.addLink(id, sku), "Código sumado");
        await loadSuggestions().catch(() => undefined);
      },
      setManualLevel: (linkId, level) => run(() => brandItemsApi.setManualLevel(linkId, level)),
      removeLink: async (linkId) => {
        await run(() => brandItemsApi.removeLink(linkId), "Código quitado");
        await loadSuggestions().catch(() => undefined);
      },
    }),
    [run, loadSuggestions]
  );

  async function addSuggested(items: BrandSuggestedItem[]) {
    await run(
      () =>
        brandItemsApi.create(
          items.map((s) => ({
            name: s.name,
            ean: s.ean,
            partNumber: s.partNumber,
            imageUrl: s.imageUrl,
            skus: s.skus.map((k) => ({ provider: k.provider, externalId: k.externalId })),
          }))
        ),
      items.length === 1 ? "Producto sumado" : `${items.length} productos sumados`
    );
    await loadSuggestions().catch(() => undefined);
  }

  async function saveSettings(patch: Partial<BrandStockSettings>) {
    try {
      await brandItemsApi.saveSettings(patch);
      const res = await brandItemsApi.list();
      setView(res.data);
      setAviso({ ok: true, text: "Semáforo actualizado" });
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo guardar la configuración") });
    }
  }

  const items = useMemo(() => view?.items ?? [], [view]);
  const counts = useMemo(() => {
    const out = Object.fromEntries(SUMMARY.map((s) => [s, 0])) as Record<BrandSemaphoreStatus, number>;
    for (const item of items) {
      const s = bestStatus(item);
      if (s in out) out[s] += 1;
    }
    return out;
  }, [items]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter(
      (item) =>
        (filter === "ALL" || bestStatus(item) === filter) &&
        (!term ||
          item.name.toLowerCase().includes(term) ||
          (item.partNumber ?? "").toLowerCase().includes(term) ||
          (item.ean ?? "").includes(term))
    );
  }, [items, q, filter]);

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-white">Productos y stock</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            Asociá tus productos a los códigos de cada distribuidor y mostrá un semáforo en vez de PDFs.
          </p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
          {aviso && (
            <p
              role="status"
              className={`text-xs rounded-md px-3 py-2 ${
                aviso.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
              }`}
            >
              {aviso.text}
            </p>
          )}

          {loading || !view ? (
            <div className="flex justify-center py-16">
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
              ) : (
                <p className="text-sm text-surface-400">No se pudieron cargar tus productos.</p>
              )}
            </div>
          ) : (
            <>
              <StockSettingsPanel
                settings={view.settings}
                canWrite={view.canWrite}
                publicUrl={publicUrl}
                onSave={saveSettings}
              />

              <SuggestionsPanel suggestions={suggestions} canWrite={view.canWrite} onAdd={addSuggested} />

              <section>
                <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      Tus productos <span className="text-surface-500 font-normal">({items.length})</span>
                    </h2>
                    <div className="mt-1.5">
                      <StockLegend />
                    </div>
                  </div>
                  <label className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Buscar por nombre, PN o EAN"
                      className="w-56 rounded-lg border border-surface-700 bg-surface-950 pl-8 pr-3 py-1.5 text-sm text-white placeholder:text-surface-600"
                    />
                  </label>
                </div>

                {items.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <FilterPill active={filter === "ALL"} onClick={() => setFilter("ALL")}>
                      Todos · {items.length}
                    </FilterPill>
                    {SUMMARY.filter((s) => counts[s] > 0).map((s) => (
                      <FilterPill key={s} active={filter === s} onClick={() => setFilter(filter === s ? "ALL" : s)}>
                        <span className={`w-1.5 h-1.5 rounded-full ${STOCK_STATUS_DOT[s]}`} />
                        {STOCK_STATUS_LABEL[s]} · {counts[s]}
                      </FilterPill>
                    ))}
                  </div>
                )}

                {items.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-surface-700 px-6 py-10 text-center">
                    <p className="text-sm text-white">Todavía no sumaste productos.</p>
                    <p className="text-xs text-surface-400 mt-1">
                      {suggestions.length > 0
                        ? "Arrancá por las sugerencias de arriba: ya están agrupadas por distribuidor."
                        : "Cuando tus productos aparezcan en los catálogos de los distribuidores, te los sugerimos acá."}
                    </p>
                  </div>
                ) : visible.length === 0 ? (
                  <p className="text-sm text-surface-400 py-6 text-center">Nada coincide con ese filtro.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {visible.map((item) => (
                      <BrandItemRow
                        key={item.id}
                        item={item}
                        manual={view.settings.mode === "MANUAL"}
                        seesExact={view.settings.brandSeesExact}
                        canWrite={view.canWrite}
                        actions={actions}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        active
          ? "border-brand-500/70 bg-brand-500/15 text-white"
          : "border-surface-800 text-surface-400 hover:border-surface-600 hover:text-surface-200"
      }`}
    >
      {children}
    </button>
  );
}
