"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  ArrowLeftRight,
  Eraser,
  GitCompare,
  Sparkles,
  Store,
} from "lucide-react";
import PrefsPanel from "@/components/PrefsPanel";
import CompareSearch from "@/components/compare/CompareSearch";
import RetailPicker from "@/components/compare/RetailPicker";
import {
  ProviderCompareColumn,
  RetailCompareColumn,
} from "@/components/compare/CompareColumns";
import type { ProductDTO, RetailSearchHit } from "@/lib/api";
import { formatARS, formatUSD } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { useIibbRatesEpoch } from "@/lib/iibb-rates";
import { usePurchasePolicies } from "@/lib/purchase";
import { purchaseLinePricing, type PriceMode } from "@/lib/purchase-price";
import { displayTaxTitle } from "@/lib/display-price";
import { compareEntrySortArs } from "@/lib/compare-price";
import {
  loadCompareEntries,
  loadManualOrder,
  newProviderEntry,
  newRetailEntry,
  sameProviderProduct,
  saveCompareEntries,
  saveManualOrder,
  type CompareEntry,
  type CompareProviderEntry,
  type CompareRetailEntry,
} from "@/lib/compare-store";
import { repairImplausibleSalePrice } from "@/lib/retailMatch";

export default function ComparadorPage() {
  const [entries, setEntries] = useState<CompareEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [manualOrder, setManualOrder] = useState(false);
  const [retailForId, setRetailForId] = useState<string | null>(null);
  const [flash, setFlash] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const { withIva, withIibb, currency, convert, currentRate } = usePrefs();
  const iibbEpoch = useIibbRatesEpoch();
  const policies = usePurchasePolicies();
  const usdArs = currentRate?.venta ?? 0;

  useEffect(() => {
    setEntries(loadCompareEntries());
    setManualOrder(loadManualOrder());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveCompareEntries(entries);
  }, [entries, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveManualOrder(manualOrder);
  }, [manualOrder, hydrated]);

  const existingProductKeys = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries) {
      if (e.kind === "provider") s.add(`${e.product.provider}:${e.product.externalId}`);
      else if (e.sourceProduct) s.add(`${e.sourceProduct.provider}:${e.sourceProduct.externalId}`);
    }
    return s;
  }, [entries]);
  const existingRetailIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries) {
      if (e.kind === "retail") s.add(e.hit.id);
    }
    return s;
  }, [entries]);

  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(""), 2200);
  }, []);

  const sortCtx = useMemo(
    () => ({ withIva, withIibb, usdArs, policies }),
    // iibbEpoch fuerza recálculo cuando se aprende una alícuota
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [withIva, withIibb, usdArs, policies, iibbEpoch]
  );

  const displayed = useMemo(() => {
    if (manualOrder) return entries;
    return [...entries].sort(
      (a, b) => compareEntrySortArs(a, sortCtx) - compareEntrySortArs(b, sortCtx)
    );
  }, [entries, manualOrder, sortCtx]);

  const addProvider = useCallback(
    (product: ProductDTO, mode: PriceMode) => {
      let msg = "";
      setEntries((prev) => {
        const idx = prev.findIndex((e) => sameProviderProduct(e, product));
        if (idx >= 0) {
          const current = prev[idx];
          if (current.kind === "provider" && current.mode === mode) {
            msg = "Ya está en el comparador";
            return prev;
          }
          msg = `Pasó a ${mode === "list" ? "Normal" : mode === "offline" ? "Offline" : "Esquema"}`;
          const next = [...prev];
          next[idx] = { kind: "provider", id: current.id, product, mode };
          return next;
        }
        msg = `Agregado · ${mode === "list" ? "Normal" : mode === "offline" ? "Offline" : "Esquema"}`;
        return [...prev, newProviderEntry(product, mode)];
      });
      showFlash(msg);
    },
    [showFlash]
  );

  const addRetail = useCallback(
    (hit: RetailSearchHit, from?: CompareProviderEntry | CompareRetailEntry) => {
      let duplicate = false;
      setEntries((prev) => {
        if (prev.some((e) => e.kind === "retail" && e.hit.id === hit.id)) {
          duplicate = true;
          return prev;
        }
        const source =
          from?.kind === "provider"
            ? from.product
            : from?.kind === "retail"
              ? from.sourceProduct
              : null;
        const costUsd = source
          ? purchaseLinePricing(
              source,
              policies[source.provider],
              from?.kind === "provider" ? from.mode : from?.sourceMode ?? "list"
            ).unitNet
          : null;
        return [
          ...prev,
          newRetailEntry(hit, {
            costUsd,
            linkedName: source?.name ?? null,
            sourceProduct: source ?? null,
            sourceMode: from?.kind === "provider" ? from.mode : from?.sourceMode ?? null,
          }),
        ];
      });
      showFlash(duplicate ? "Ese local ya está en el tablero" : `Local agregado · ${hit.store.name}`);
    },
    [policies, showFlash]
  );

  const replaceWithRetail = useCallback(
    (id: string, hit: RetailSearchHit) => {
      let duplicate = false;
      let replaced = false;
      setEntries((prev) => {
        if (prev.some((e) => e.id !== id && e.kind === "retail" && e.hit.id === hit.id)) {
          duplicate = true;
          return prev;
        }
        return prev.map((e) => {
          if (e.id !== id) return e;
          replaced = true;
          if (e.kind === "provider") {
            return newRetailEntry(hit, {
              id: e.id,
              costUsd: purchaseLinePricing(e.product, policies[e.product.provider], e.mode).unitNet,
              linkedName: e.product.name,
              sourceProduct: e.product,
              sourceMode: e.mode,
            });
          }
          return {
            ...e,
            hit,
            costUsd:
              e.sourceProduct
                ? purchaseLinePricing(
                    e.sourceProduct,
                    policies[e.sourceProduct.provider],
                    e.sourceMode ?? "list"
                  ).unitNet
                : e.costUsd,
          };
        });
      });
      if (duplicate) showFlash("Ese local ya está en el tablero");
      else if (replaced) showFlash(`Columna en local · ${hit.store.name}`);
      setRetailForId(null);
    },
    [policies, showFlash]
  );

  const remove = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const changeMode = useCallback((id: string, mode: PriceMode) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        if (e.kind === "provider") {
          return { ...e, mode };
        }
        if (e.sourceProduct) {
          return { kind: "provider", id: e.id, product: e.sourceProduct, mode };
        }
        return e;
      })
    );
  }, []);

  const moveColumn = useCallback(
    (fromId: string, toId: string) => {
      if (!fromId || !toId || fromId === toId) return;
      setManualOrder(true);
      setEntries((prev) => {
        const base = manualOrder
          ? prev
          : [...prev].sort(
              (a, b) => compareEntrySortArs(a, sortCtx) - compareEntrySortArs(b, sortCtx)
            );
        const from = base.findIndex((e) => e.id === fromId);
        const to = base.findIndex((e) => e.id === toId);
        if (from < 0 || to < 0) return prev;
        const next = [...base];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
      });
    },
    [manualOrder, sortCtx]
  );

  const providerCosts = useMemo(() => {
    return displayed
      .filter((e): e is CompareProviderEntry => e.kind === "provider")
      .map((e) => ({ id: e.id, ars: compareEntrySortArs(e, sortCtx) }));
  }, [displayed, sortCtx]);

  const cheapestProviderId = useMemo(() => {
    if (providerCosts.length < 2) return null;
    let best = providerCosts[0];
    for (const row of providerCosts) {
      if (row.ars < best.ars) best = row;
    }
    return best.id;
  }, [providerCosts]);

  const retailSales = useMemo(() => {
    return displayed
      .filter((e): e is CompareRetailEntry => e.kind === "retail")
      .map((e) => {
        const costArs =
          e.costUsd != null && e.costUsd > 0 ? convert(e.costUsd).amount : null;
        const sale = repairImplausibleSalePrice(e.hit.price, costArs);
        return { id: e.id, sale };
      });
  }, [displayed, convert]);

  const bestRetailId = useMemo(() => {
    if (retailSales.length < 2) return null;
    let best = retailSales[0];
    for (const row of retailSales) {
      if (row.sale < best.sale) best = row;
    }
    return best.id;
  }, [retailSales]);

  const summary = useMemo(() => {
    const providers = providerCosts.length;
    const retails = retailSales.length;
    const minCost = providerCosts.length ? Math.min(...providerCosts.map((p) => p.ars)) : null;
    const minSale = retailSales.length ? Math.min(...retailSales.map((r) => r.sale)) : null;
    return { providers, retails, minCost, minSale };
  }, [providerCosts, retailSales]);

  const sortHint = displayTaxTitle({ withIva, withIibb });
  const retailFor = retailForId ? entries.find((e) => e.id === retailForId) : null;

  return (
    <>
      <header className="relative z-30 flex-shrink-0 border-b border-surface-800 bg-surface-950/95 backdrop-blur-sm px-4 sm:px-6 py-4 overflow-visible">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-600/15 border border-brand-500/25 flex items-center justify-center flex-shrink-0">
              <GitCompare className="w-5 h-5 text-brand-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-white tracking-tight">Comparador</h1>
              <p className="text-xs text-surface-500 leading-relaxed mt-0.5 max-w-xl">
                Mismo ítem en normal, offline, esquema o local. El orden es de menor a mayor
                con el IVA y las percepciones que elijas por separado; los locales no usan esos
                toggles (ya vienen con todo incluido).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {entries.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setEntries([]);
                  setManualOrder(false);
                  showFlash("Tablero vacío");
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-surface-400 hover:text-white border border-surface-700 hover:border-surface-500 rounded-lg px-3 py-1.5 transition-colors"
              >
                <Eraser className="w-3.5 h-3.5" />
                Limpiar
              </button>
            )}
            <PrefsPanel />
          </div>
        </div>

        <div className="mt-4 max-w-3xl">
          <CompareSearch
            onAddProvider={addProvider}
            onAddRetail={(hit) => addRetail(hit)}
            existingProductKeys={existingProductKeys}
            existingRetailIds={existingRetailIds}
          />
        </div>

        {entries.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-900 border border-surface-700 px-2.5 py-1 text-surface-300">
              <ArrowLeftRight className="w-3 h-3 text-brand-400" />
              {summary.providers} costo{summary.providers === 1 ? "" : "s"}
              {summary.minCost != null && (
                <>
                  <span className="text-surface-600">·</span>
                  desde{" "}
                  <span className="text-white font-semibold tabular-nums">
                    {currency === "USD" && usdArs > 0
                      ? formatUSD(summary.minCost / usdArs)
                      : formatARS(summary.minCost)}
                  </span>
                </>
              )}
            </span>
            {summary.retails > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 text-emerald-200/90">
                <Store className="w-3 h-3" />
                {summary.retails} local{summary.retails === 1 ? "" : "es"}
                {summary.minSale != null && (
                  <>
                    <span className="text-emerald-500/50">·</span>
                    desde{" "}
                    <span className="text-white font-semibold tabular-nums">
                      {formatARS(summary.minSale)}
                    </span>
                  </>
                )}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-900 border border-surface-700 px-2.5 py-1 text-surface-400">
              Orden: {manualOrder ? "manual" : `menor → mayor · ${sortHint}`}
            </span>
            {manualOrder && (
              <button
                type="button"
                onClick={() => {
                  setEntries((prev) =>
                    [...prev].sort(
                      (a, b) => compareEntrySortArs(a, sortCtx) - compareEntrySortArs(b, sortCtx)
                    )
                  );
                  setManualOrder(false);
                  showFlash("Ordenado de menor a mayor");
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-600/10 px-2.5 py-1 text-brand-300 hover:text-white"
              >
                <ArrowDownAZ className="w-3 h-3" />
                Menor a mayor
              </button>
            )}
            <span className="text-surface-600 hidden sm:inline">
              Tocá Normal / Offline / Esquema / Local para cambiar esa columna, no para duplicarla.
              Arrastrá para un orden propio.
            </span>
          </div>
        )}
      </header>

      <div className="relative z-0 flex-1 overflow-x-auto overflow-y-auto">
        {!hydrated ? (
          <div className="flex items-center justify-center py-24 text-surface-500 text-sm">
            Cargando…
          </div>
        ) : entries.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="px-4 sm:px-6 py-5">
            <div className="flex gap-4 items-stretch min-w-min pb-4">
              {displayed.map((entry) =>
                entry.kind === "provider" ? (
                  <ProviderCompareColumn
                    key={entry.id}
                    entry={entry}
                    isCheapest={entry.id === cheapestProviderId}
                    onRemove={() => remove(entry.id)}
                    onChangeMode={(mode) => changeMode(entry.id, mode)}
                    onPickLocal={() => setRetailForId(entry.id)}
                    onDragStart={() => setDragId(entry.id)}
                    onDropOn={() => {
                      if (dragId) moveColumn(dragId, entry.id);
                      setDragId(null);
                    }}
                  />
                ) : (
                  <RetailCompareColumn
                    key={entry.id}
                    entry={entry}
                    isBestSale={entry.id === bestRetailId}
                    onRemove={() => remove(entry.id)}
                    onChangeMode={
                      entry.sourceProduct ? (mode) => changeMode(entry.id, mode) : undefined
                    }
                    onPickLocal={() => setRetailForId(entry.id)}
                    onDragStart={() => setDragId(entry.id)}
                    onDropOn={() => {
                      if (dragId) moveColumn(dragId, entry.id);
                      setDragId(null);
                    }}
                  />
                )
              )}
            </div>
          </div>
        )}
      </div>

      {retailFor && (
        <RetailPicker
          seedName={
            retailFor.kind === "provider"
              ? retailFor.product.name
              : retailFor.linkedName || retailFor.hit.name
          }
          costUsd={
            retailFor.kind === "provider"
              ? purchaseLinePricing(
                  retailFor.product,
                  policies[retailFor.product.provider],
                  retailFor.mode
                ).unitNet
              : retailFor.costUsd
          }
          existingRetailIds={existingRetailIds}
          onPick={(hit) => replaceWithRetail(retailFor.id, hit)}
          onClose={() => setRetailForId(null)}
        />
      )}

      {flash && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-surface-900 border border-surface-700 text-xs font-medium text-white shadow-xl">
          {flash}
        </div>
      )}
    </>
  );
}

function EmptyState() {
  return (
    <div className="max-w-lg mx-auto px-6 py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-brand-600/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-4">
        <Sparkles className="w-7 h-7 text-brand-400" />
      </div>
      <h2 className="text-base font-semibold text-white mb-2">Armá tu comparación</h2>
      <p className="text-sm text-surface-400 leading-relaxed mb-6">
        Buscá arriba un mayorista o un local. El tablero ordena de menor a mayor. IVA y
        percepciones se eligen por separado. Un toque en Normal, Esquema o Local cambia esa columna.
      </p>
      <ul className="text-left text-xs text-surface-500 space-y-2 bg-surface-900/60 border border-surface-800 rounded-xl p-4">
        <li className="flex gap-2">
          <span className="text-brand-400 font-bold">1.</span>
          Elegí un producto. Si ya está, el modo (Normal / Offline / Esquema) reemplaza la columna.
        </li>
        <li className="flex gap-2">
          <span className="text-amber-400 font-bold">2.</span>
          Activá el IVA y las percepciones por separado (arriba a la derecha). El orden usa esas capas; no se mezclan. En esquema u offline cambia la base, no el toggle.
        </li>
        <li className="flex gap-2">
          <span className="text-emerald-400 font-bold">3.</span>
          Locales se insertan como referencia (precio final). Arrastrá las cards si querés otro orden.
        </li>
      </ul>
    </div>
  );
}
