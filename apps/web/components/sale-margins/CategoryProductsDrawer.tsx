"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImageOff, Loader2, Search, X } from "lucide-react";
import { saleMarginsApi } from "@/lib/api";
import { proxyImg } from "@/lib/format";
import {
  formatMargin,
  rescaleSale,
  type SaleMarginCategory,
  type SaleMarginProduct,
  type SaleMarginSource,
} from "@/lib/sale-margins";
import { BulkBar, MarginInput, SourceBadge, useMoney } from "./shared";

const PAGE = 50;

export type Inherited = { value: number; source: SaleMarginSource };

/** Margen con el que queda un producto: el propio o el que hereda de la categoría. */
function withPercent(item: SaleMarginProduct, percent: number | null, inherited: Inherited): SaleMarginProduct {
  const effective = percent ?? inherited.value;
  return {
    ...item,
    percent,
    effective,
    source: percent != null ? "product" : inherited.source,
    // La venta escala con (1 + margen) en las dos bases; el servidor la confirma al recargar.
    sale: item.sale != null ? rescaleSale(item.sale, item.effective, effective) : null,
  };
}

/**
 * Productos de una categoría del distribuidor: margen por producto, uno por uno
 * o muchos a la vez. Paginado: una categoría puede tener miles de productos.
 */
export default function CategoryProductsDrawer({
  provider,
  category,
  inherited,
  canEdit,
  onClose,
  onNotice,
}: {
  provider: string;
  category: SaleMarginCategory;
  /** Lo que hereda un producto sin margen propio (la categoría, el distribuidor o el comercio). */
  inherited: Inherited;
  canEdit: boolean;
  onClose: () => void;
  onNotice: (n: { message: string; undo?: () => void; tone?: "ok" | "error" }) => void;
}) {
  const money = useMoney();
  const [items, setItems] = useState<SaleMarginProduct[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const load = useCallback(
    async (reset: boolean, from: string | null) => {
      if (reset) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      try {
        const res = await saleMarginsApi.products(provider, {
          category: category.key,
          q: debounced || undefined,
          cursor: reset ? null : from,
          limit: PAGE,
        });
        const page = res.data;
        setItems((prev) => (reset ? page.items : [...prev, ...page.items]));
        setCursor(page.nextCursor);
        if (page.total != null) setTotal(page.total);
      } catch {
        setError("No se pudieron cargar los productos de esta categoría.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [provider, category.key, debounced]
  );

  useEffect(() => {
    setSelected(new Set());
    void load(true, null);
  }, [load]);

  async function setPercent(ids: string[], percent: number | null) {
    if (ids.length === 0) return;
    const before = new Map(items.filter((i) => ids.includes(i.externalId)).map((i) => [i.externalId, i.percent]));
    const idSet = new Set(ids);
    setItems((prev) => prev.map((i) => (idSet.has(i.externalId) ? withPercent(i, percent, inherited) : i)));
    setSaving(true);
    try {
      await saleMarginsApi.setProducts(provider, ids, percent);
      const what = ids.length === 1 ? "1 producto" : `${ids.length} productos`;
      onNotice({
        message: percent == null ? `${what} vuelven a heredar el margen.` : `${what} con ${formatMargin(percent)}.`,
        undo: () => void restore(before),
      });
    } catch {
      setItems((prev) => prev.map((i) => (before.has(i.externalId) ? withPercent(i, before.get(i.externalId) ?? null, inherited) : i)));
      onNotice({ message: "No se pudo guardar el margen. Probá de nuevo.", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  /** Deshacer: vuelve cada producto a su margen anterior (agrupado por valor). */
  async function restore(before: Map<string, number | null>) {
    const groups = new Map<string, { percent: number | null; ids: string[] }>();
    for (const [id, percent] of before) {
      const key = percent == null ? "null" : String(percent);
      const group = groups.get(key) ?? { percent, ids: [] };
      group.ids.push(id);
      groups.set(key, group);
    }
    setItems((prev) => prev.map((i) => (before.has(i.externalId) ? withPercent(i, before.get(i.externalId) ?? null, inherited) : i)));
    try {
      for (const g of groups.values()) await saleMarginsApi.setProducts(provider, g.ids, g.percent);
    } catch {
      onNotice({ message: "No se pudo deshacer. Recargá la página para ver el estado real.", tone: "error" });
    }
  }

  const allVisibleSelected = items.length > 0 && items.every((i) => selected.has(i.externalId));
  function toggleAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(items.map((i) => i.externalId)));
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Productos de ${category.label}`}
        className="relative flex h-full w-full max-w-3xl flex-col border-l border-surface-800 bg-surface-950 shadow-2xl outline-none"
      >
        <header className="flex items-start justify-between gap-3 border-b border-surface-800 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{category.key.includes(">") ? "Productos de la subcategoría" : "Productos de la categoría"}</p>
            <h2 className="mt-0.5 truncate text-lg font-semibold text-white">{category.label}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-surface-400">
              {category.nodoLabel && (
                <span className="rounded-md border border-brand-500/25 bg-brand-500/10 px-1.5 py-0.5 text-[10px] text-brand-300">
                  NODO: {category.nodoLabel}
                </span>
              )}
              <span>
                Sin margen propio heredan <b className="text-surface-200">{formatMargin(inherited.value)}</b>
              </span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-surface-500 hover:bg-surface-800 hover:text-white" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex items-center gap-3 border-b border-surface-800 px-5 py-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, marca o código"
              aria-label="Buscar productos"
              className="h-9 w-full rounded-lg border border-surface-700 bg-surface-900 pl-8 pr-3 text-sm text-white placeholder:text-surface-500 focus:border-brand-500 focus:outline-none"
            />
          </div>
          <span className="whitespace-nowrap text-xs tabular-nums text-surface-500">
            {total != null ? `${total.toLocaleString("es-AR")} productos` : `${items.length} cargados`}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          {loading ? (
            <div className="flex flex-col gap-2 py-4" aria-busy>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-900" />
              ))}
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-sm text-surface-300">{error}</p>
              <button type="button" onClick={() => void load(true, null)} className="mt-3 text-sm font-medium text-brand-300 hover:text-brand-200">
                Reintentar
              </button>
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-surface-400">
              {debounced ? `Nada coincide con “${debounced}”.` : "Esta categoría no tiene productos con precio."}
            </p>
          ) : (
            <table className="w-full table-fixed text-left">
              <thead className="sticky top-0 z-10 bg-surface-950">
                <tr className="text-[10px] uppercase tracking-wider text-surface-500">
                  <th className="w-8 py-2.5">
                    {canEdit && (
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAll}
                        aria-label="Seleccionar los productos cargados"
                        className="h-3.5 w-3.5 accent-emerald-500"
                      />
                    )}
                  </th>
                  <th className="py-2.5 font-semibold">Producto</th>
                  <th className="hidden w-24 py-2.5 text-right font-semibold sm:table-cell">Costo</th>
                  <th className="w-28 py-2.5 pl-3 font-semibold">Margen</th>
                  <th className="w-28 py-2.5 text-right font-semibold">Venta</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.externalId}
                    className={`border-t border-surface-800/70 align-middle ${selected.has(item.externalId) ? "bg-emerald-500/[0.04]" : ""}`}
                  >
                    <td className="py-2">
                      {canEdit && (
                        <input
                          type="checkbox"
                          checked={selected.has(item.externalId)}
                          onChange={() => toggle(item.externalId)}
                          aria-label={`Seleccionar ${item.name}`}
                          className="h-3.5 w-3.5 accent-emerald-500"
                        />
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="relative hidden h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-surface-800 bg-white sm:flex">
                          {item.imageUrl ? (
                            <Image src={proxyImg(item.imageUrl)} alt="" fill className="object-contain p-0.5" unoptimized />
                          ) : (
                            <ImageOff className="h-4 w-4 text-surface-400" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-[13px] leading-snug text-surface-100 sm:truncate" title={item.name}>
                            {item.name}
                          </p>
                          <p className="truncate text-[11px] text-surface-500">
                            {[item.brand, item.sku ? `#${item.sku}` : null].filter(Boolean).join(" · ") || " "}
                            <span className="sm:hidden"> · costo {money(item.cost)}</span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden py-2 text-right font-mono text-xs tabular-nums text-surface-300 sm:table-cell">
                      {money(item.cost)}
                    </td>
                    <td className="py-2 pl-3">
                      <MarginInput
                        size="sm"
                        label={`Margen de ${item.name}`}
                        value={item.percent}
                        inherited={inherited.value}
                        disabled={!canEdit || saving}
                        onCommit={(next) => void setPercent([item.externalId], next)}
                      />
                      <div className="mt-1">
                        <SourceBadge source={item.source} own={item.percent != null} />
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <p className="font-mono text-[13px] font-semibold tabular-nums text-emerald-300">{money(item.sale)}</p>
                      <p className="text-[10px] tabular-nums text-surface-500">{formatMargin(item.effective)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {cursor && !loading && (
            <div className="flex justify-center py-4">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void load(false, cursor)}
                className="inline-flex items-center gap-2 rounded-lg border border-surface-700 px-4 py-2 text-sm text-surface-200 hover:border-surface-500 disabled:opacity-60"
              >
                {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Cargar más
              </button>
            </div>
          )}

          {canEdit && (
            <BulkBar
              count={selected.size}
              noun={{ one: "producto seleccionado", many: "productos seleccionados" }}
              disabled={saving}
              onApply={(percent) => {
                void setPercent([...selected], percent);
                setSelected(new Set());
              }}
              onClear={() => {
                void setPercent([...selected], null);
                setSelected(new Set());
              }}
              onDeselect={() => setSelected(new Set())}
            />
          )}
        </div>
      </div>
    </div>
  );
}
