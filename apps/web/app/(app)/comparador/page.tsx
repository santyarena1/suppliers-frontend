"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
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
import { displayAmountFromPricing } from "@/lib/display-price";
import {
  entryKey,
  loadCompareEntries,
  newProviderEntry,
  newRetailEntry,
  saveCompareEntries,
  type CompareEntry,
  type CompareProviderEntry,
} from "@/lib/compare-store";
import { repairImplausibleSalePrice } from "@/lib/retailMatch";

export default function ComparadorPage() {
  const [entries, setEntries] = useState<CompareEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [retailFor, setRetailFor] = useState<CompareProviderEntry | null>(null);
  const [flash, setFlash] = useState("");
  const { withIva, withIibb, currency, convert } = usePrefs();
  const iibbEpoch = useIibbRatesEpoch();
  const policies = usePurchasePolicies();

  useEffect(() => {
    setEntries(loadCompareEntries());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveCompareEntries(entries);
  }, [entries, hydrated]);

  const existingKeys = useMemo(() => new Set(entries.map(entryKey)), [entries]);
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

  const addProvider = useCallback(
    (product: ProductDTO, mode: PriceMode) => {
      const key = `provider:${product.provider}:${product.externalId}:${mode}`;
      let duplicate = false;
      setEntries((prev) => {
        if (prev.some((e) => entryKey(e) === key)) {
          duplicate = true;
          return prev;
        }
        return [...prev, newProviderEntry(product, mode)];
      });
      showFlash(
        duplicate
          ? "Ya está en el comparador"
          : `Agregado · ${mode === "list" ? "Normal" : mode === "offline" ? "Offline" : "Esquema"}`
      );
    },
    [showFlash]
  );

  const addRetail = useCallback(
    (hit: RetailSearchHit, from?: CompareProviderEntry) => {
      let duplicate = false;
      setEntries((prev) => {
        if (prev.some((e) => e.kind === "retail" && e.hit.id === hit.id)) {
          duplicate = true;
          return prev;
        }
        const costUsd = from
          ? purchaseLinePricing(from.product, policies[from.product.provider], from.mode).unitNet
          : null;
        return [
          ...prev,
          newRetailEntry(hit, {
            costUsd,
            linkedName: from?.product.name ?? null,
          }),
        ];
      });
      showFlash(duplicate ? "Ese local ya está en el tablero" : `Local agregado · ${hit.store.name}`);
      setRetailFor(null);
    },
    [policies, showFlash]
  );

  const remove = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const changeMode = useCallback((id: string, mode: PriceMode) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id || e.kind !== "provider") return e;
        const key = `provider:${e.product.provider}:${e.product.externalId}:${mode}`;
        if (prev.some((o) => o.id !== id && entryKey(o) === key)) return e;
        return { ...e, mode };
      })
    );
  }, []);

  const duplicateMode = useCallback(
    (entry: CompareProviderEntry, mode: PriceMode) => {
      addProvider(entry.product, mode);
    },
    [addProvider]
  );

  const providerCosts = useMemo(() => {
    void iibbEpoch;
    return entries
      .filter((e): e is CompareProviderEntry => e.kind === "provider")
      .map((e) => {
        const pricing = purchaseLinePricing(e.product, policies[e.product.provider], e.mode);
        const usd = displayAmountFromPricing(pricing, {
          withIva,
          withIibb: withIibb && pricing.mode !== "offline",
          provider: e.product.provider,
        }).unitDisplayUsd;
        return { id: e.id, usd };
      });
  }, [entries, policies, withIva, withIibb, iibbEpoch]);

  const cheapestProviderId = useMemo(() => {
    if (providerCosts.length < 2) return null;
    let best = providerCosts[0];
    for (const row of providerCosts) {
      if (row.usd < best.usd) best = row;
    }
    return best.id;
  }, [providerCosts]);

  const retailSales = useMemo(() => {
    return entries
      .filter((e) => e.kind === "retail")
      .map((e) => {
        const costArs =
          e.costUsd != null && e.costUsd > 0 ? convert(e.costUsd).amount : null;
        const sale = repairImplausibleSalePrice(e.hit.price, costArs);
        return { id: e.id, sale };
      });
  }, [entries, convert]);

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
    const minCost = providerCosts.length
      ? Math.min(...providerCosts.map((p) => p.usd))
      : null;
    const minSale = retailSales.length
      ? Math.min(...retailSales.map((r) => r.sale))
      : null;
    return { providers, retails, minCost, minSale };
  }, [providerCosts, retailSales]);

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
                Confrontá el mismo ítem en normal, offline o esquema, entre distribuidores y contra locales importados.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {entries.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setEntries([]);
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
          <CompareSearch onAdd={addProvider} existingKeys={existingKeys} />
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
                    {currency === "USD"
                      ? formatUSD(summary.minCost)
                      : formatARS(convert(summary.minCost).amount)}
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
            <span className="text-surface-600 hidden sm:inline">
              Tip: duplicá una columna en Offline/Esquema o sumá un local desde la card.
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
              {entries.map((entry) =>
                entry.kind === "provider" ? (
                  <ProviderCompareColumn
                    key={entry.id}
                    entry={entry}
                    isCheapest={entry.id === cheapestProviderId}
                    onRemove={() => remove(entry.id)}
                    onChangeMode={(mode) => changeMode(entry.id, mode)}
                    onDuplicateMode={(mode) => duplicateMode(entry, mode)}
                    onAddRetail={() => setRetailFor(entry)}
                  />
                ) : (
                  <RetailCompareColumn
                    key={entry.id}
                    entry={entry}
                    isBestSale={entry.id === bestRetailId}
                    onRemove={() => remove(entry.id)}
                  />
                )
              )}
            </div>
          </div>
        )}
      </div>

      {retailFor && (
        <RetailPicker
          seedName={retailFor.product.name}
          costUsd={
            purchaseLinePricing(
              retailFor.product,
              policies[retailFor.product.provider],
              retailFor.mode
            ).unitNet
          }
          existingRetailIds={existingRetailIds}
          onPick={(hit) => addRetail(hit, retailFor)}
          onClose={() => setRetailFor(null)}
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
        Buscá arriba y agregá productos. Podés poner el mismo SKU en normal, offline y esquema,
        cruzarlo con otro distribuidor, y sumar precios de locales importados.
      </p>
      <ul className="text-left text-xs text-surface-500 space-y-2 bg-surface-900/60 border border-surface-800 rounded-xl p-4">
        <li className="flex gap-2">
          <span className="text-brand-400 font-bold">1.</span>
          Elegí un producto del buscador (Normal / Offline / Esquema).
        </li>
        <li className="flex gap-2">
          <span className="text-amber-400 font-bold">2.</span>
          Duplicá la columna en otro formato o cambiá el chip de modo.
        </li>
        <li className="flex gap-2">
          <span className="text-emerald-400 font-bold">3.</span>
          Desde “Local”, agregá tiendas importadas para ver venta y margen.
        </li>
      </ul>
    </div>
  );
}
