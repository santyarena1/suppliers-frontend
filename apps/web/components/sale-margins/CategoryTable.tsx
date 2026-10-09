"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { formatMargin, type SaleMarginCategory } from "@/lib/sale-margins";
import { BulkBar, MarginInput, SourceBadge, useMoney } from "./shared";

type Filter = "all" | "own" | "inherit";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "own", label: "Con margen propio" },
  { key: "inherit", label: "Heredan" },
];

function fold(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Una fila: una categoría o una subcategoría dentro de ella. */
type Row = {
  item: SaleMarginCategory;
  /** Categoría que la contiene (solo en subcategorías). */
  parent: SaleMarginCategory | null;
  /** Lo que hereda si no tiene margen propio. */
  inherited: number;
};

const subsOf = (c: SaleMarginCategory) => c.subcategories ?? [];

/**
 * Categorías del distribuidor (como él las llama, con el nombre de NODO al lado
 * si está unificada) y sus subcategorías, que se despliegan. Margen por
 * categoría o subcategoría, de a una o muchas a la vez (mezcladas).
 */
export default function CategoryTable({
  categories,
  inheritedValue,
  canEdit,
  saving,
  onSet,
  onOpen,
}: {
  categories: SaleMarginCategory[];
  /** Lo que hereda una categoría sin margen propio. */
  inheritedValue: number;
  canEdit: boolean;
  saving: boolean;
  onSet: (keys: string[], percent: number | null) => void;
  /** `parent` viene cuando se abre una subcategoría. */
  onOpen: (category: SaleMarginCategory, parent: SaleMarginCategory | null) => void;
}) {
  const money = useMoney();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const q = fold(query.trim());
  const passes = (c: SaleMarginCategory) =>
    filter === "own" ? c.percent != null : filter === "inherit" ? c.percent == null : true;
  const matches = (c: SaleMarginCategory) =>
    !q || fold(c.label).includes(q) || (c.nodoLabel ? fold(c.nodoLabel).includes(q) : false);

  /** Categorías visibles y, por cada una, las subcategorías que se muestran. */
  const visible = useMemo(() => {
    return categories
      .map((c) => {
        const subs = subsOf(c).filter((s) => passes(s) && (matches(s) || matches(c)));
        const selfShown = passes(c) && matches(c);
        // Una subcategoría que coincide con la búsqueda o el filtro trae a su categoría, desplegada.
        const forcedOpen = subs.length > 0 && (!!q || filter === "own") && subs.some((s) => matches(s) && passes(s));
        return { cat: c, subs, show: selfShown || forcedOpen, forcedOpen };
      })
      .filter((v) => v.show)
      .sort((a, b) => b.cat.products - a.cat.products || a.cat.label.localeCompare(b.cat.label, "es"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, q, filter]);

  const rows: Row[] = [];
  for (const v of visible) {
    rows.push({ item: v.cat, parent: null, inherited: inheritedValue });
    const open = v.forcedOpen || expanded.has(v.cat.key);
    if (!open) continue;
    for (const s of v.subs) rows.push({ item: s, parent: v.cat, inherited: v.cat.effective });
  }

  const ownCount = categories.filter((c) => c.percent != null).length;
  const subOwn = categories.reduce((n, c) => n + subsOf(c).filter((s) => s.percent != null).length, 0);
  const subTotal = categories.reduce((n, c) => n + subsOf(c).length, 0);
  const visibleKeys = rows.map((r) => r.item.key);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleOpen(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function isOpen(c: SaleMarginCategory) {
    return expanded.has(c.key) || visible.some((v) => v.cat.key === c.key && v.forcedOpen);
  }

  const nameOf = (r: Row) => (r.parent ? `${r.parent.label} › ${r.item.label}` : r.item.label);

  /** Botón para desplegar las subcategorías de una categoría. */
  function Expander({ c }: { c: SaleMarginCategory }) {
    const n = subsOf(c).length;
    if (n === 0) return null;
    const open = isOpen(c);
    return (
      <button
        type="button"
        onClick={() => toggleOpen(c.key)}
        aria-expanded={open}
        aria-label={`${open ? "Ocultar" : "Ver"} subcategorías de ${c.label}`}
        className="mt-1 inline-flex items-center gap-1 rounded-md text-[11px] text-surface-400 hover:text-white"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
        {n} {n === 1 ? "subcategoría" : "subcategorías"}
      </button>
    );
  }

  function Sample({ c }: { c: SaleMarginCategory }) {
    const sampleSale = c.sample ? c.sample.sale : null;
    if (!c.sample || sampleSale == null) return <span className="text-xs text-surface-600">—</span>;
    return (
      <p className="text-xs leading-snug" title={c.sample.name ?? undefined}>
        <span className="font-mono tabular-nums text-surface-400">{money(c.sample.cost)}</span>
        <span className="mx-1.5 text-surface-600">→</span>
        <span className={`font-mono font-semibold tabular-nums ${c.effective < 0 ? "text-amber-300" : "text-emerald-300"}`}>
          {money(sampleSale)}
        </span>
        {c.effective < 0 && <span className="ml-1.5 whitespace-nowrap text-[10px] text-amber-300/80">bajo costo</span>}
        {c.sample.name && <span className="mt-0.5 block truncate text-[10px] text-surface-500">{c.sample.name}</span>}
      </p>
    );
  }

  return (
    <section className="rounded-xl border border-surface-800">
      <div className="flex flex-wrap items-center gap-3 border-b border-surface-800 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">Categorías</h3>
          <p className="text-[11px] text-surface-500">
            {categories.length} del distribuidor
            {subTotal > 0 && ` · ${subTotal} subcategorías`} · {ownCount + subOwn} con margen propio · las demás heredan{" "}
            {formatMargin(inheritedValue)}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-surface-700 p-0.5" role="group" aria-label="Filtrar categorías">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-md px-2.5 py-1 text-xs transition ${
                  filter === f.key ? "bg-surface-700 text-white" : "text-surface-400 hover:text-surface-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative w-56 max-w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar categoría o subcategoría"
              aria-label="Buscar categoría o subcategoría"
              className="h-8 w-full rounded-lg border border-surface-700 bg-surface-900 pl-8 pr-3 text-xs text-white placeholder:text-surface-500 focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {categories.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-surface-400">
          Este distribuidor todavía no tiene productos con categoría. Aparecen cuando se sincroniza o se carga una lista.
        </p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-surface-400">Ninguna categoría coincide con el filtro.</p>
      ) : (
        <>
          {/* Celular: una tarjeta por fila, las subcategorías con sangría. */}
          <ul className="divide-y divide-surface-800/70 sm:hidden">
            {rows.map((r) => {
              const c = r.item;
              const isSelected = selected.has(c.key);
              const sub = r.parent != null;
              return (
                <li key={c.key} className={`py-3 pr-4 ${sub ? "pl-9 bg-surface-900/30" : "pl-4"} ${isSelected ? "bg-emerald-500/[0.04]" : ""}`}>
                  <div className="flex items-start gap-3">
                    {canEdit && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(c.key)}
                        aria-label={`Seleccionar ${nameOf(r)}`}
                        className="mt-1 h-4 w-4 flex-shrink-0 accent-emerald-500"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => onOpen(c, r.parent)} className="w-full text-left">
                        <span className={`block ${sub ? "text-[13px] text-surface-200" : "text-sm text-surface-100"}`}>{c.label}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-surface-500">
                          {c.products.toLocaleString("es-AR")} productos
                          {c.nodoLabel && c.nodoLabel.toLowerCase() !== c.label.toLowerCase() && (
                            <span className="rounded-md border border-brand-500/25 bg-brand-500/10 px-1.5 py-0.5 text-[10px] text-brand-300">
                              NODO: {c.nodoLabel}
                            </span>
                          )}
                        </span>
                      </button>
                      {!sub && <Expander c={c} />}
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-surface-600" aria-hidden />
                  </div>
                  <div className={`mt-2.5 flex items-start gap-3 ${canEdit ? "pl-7" : ""}`}>
                    <div className="w-28 flex-shrink-0">
                      <MarginInput
                        size="sm"
                        label={`Margen de ${nameOf(r)}`}
                        value={c.percent}
                        inherited={r.inherited}
                        disabled={!canEdit || saving}
                        onCommit={(next) => onSet([c.key], next)}
                      />
                      <div className="mt-1">
                        <SourceBadge source={c.source} own={c.percent != null} />
                      </div>
                    </div>
                    {!sub && (
                      <div className="min-w-0 pt-1.5">
                        <Sample c={c} />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-surface-500">
                  <th className="w-10 py-2.5 pl-4">
                    {canEdit && (
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(visibleKeys))}
                        aria-label="Seleccionar las filas visibles"
                        className="h-3.5 w-3.5 accent-emerald-500"
                      />
                    )}
                  </th>
                  <th className="py-2.5 font-semibold">Categoría</th>
                  <th className="w-24 py-2.5 text-right font-semibold">Productos</th>
                  <th className="w-36 py-2.5 pl-4 font-semibold">Margen</th>
                  <th className="w-48 py-2.5 font-semibold">Ejemplo</th>
                  <th className="w-12 py-2.5 pr-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const c = r.item;
                  const isSelected = selected.has(c.key);
                  const sub = r.parent != null;
                  return (
                    <Fragment key={c.key}>
                      <tr
                        className={`group border-t align-top transition-colors hover:bg-surface-900/50 ${
                          sub ? "border-surface-800/40 bg-surface-900/25" : "border-surface-800/70"
                        } ${isSelected ? "bg-emerald-500/[0.04]" : ""}`}
                      >
                        <td className="py-3 pl-4">
                          {canEdit && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggle(c.key)}
                              aria-label={`Seleccionar ${nameOf(r)}`}
                              className="mt-1 h-3.5 w-3.5 accent-emerald-500"
                            />
                          )}
                        </td>
                        <td className={`py-3 pr-3 ${sub ? "pl-6" : ""}`}>
                          <div className={sub ? "border-l border-surface-700 pl-3" : ""}>
                            <button
                              type="button"
                              onClick={() => onOpen(c, r.parent)}
                              className={`text-left hover:text-white hover:underline underline-offset-2 ${
                                sub ? "text-[13px] text-surface-200" : "text-sm text-surface-100"
                              }`}
                            >
                              {c.label}
                            </button>
                            {c.nodoLabel && c.nodoLabel.toLowerCase() !== c.label.toLowerCase() && (
                              <span className="mt-1 block w-fit rounded-md border border-brand-500/25 bg-brand-500/10 px-1.5 py-0.5 text-[10px] text-brand-300">
                                NODO: {c.nodoLabel}
                              </span>
                            )}
                            {!sub && (
                              <div>
                                <Expander c={c} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-right font-mono text-xs tabular-nums text-surface-400">
                          {c.products.toLocaleString("es-AR")}
                        </td>
                        <td className="py-2.5 pl-4 pr-5">
                          <MarginInput
                            size="sm"
                            label={`Margen de ${nameOf(r)}`}
                            value={c.percent}
                            inherited={r.inherited}
                            disabled={!canEdit || saving}
                            onCommit={(next) => onSet([c.key], next)}
                          />
                          <div className="mt-1">
                            <SourceBadge source={c.source} own={c.percent != null} />
                          </div>
                        </td>
                        <td className="py-3 pr-3">{sub ? <span className="text-xs text-surface-700">—</span> : <Sample c={c} />}</td>
                        <td className="py-3 pr-3 text-right">
                          <button
                            type="button"
                            onClick={() => onOpen(c, r.parent)}
                            className="rounded-md p-1.5 text-surface-500 transition hover:bg-surface-800 hover:text-white"
                            aria-label={`Ver productos de ${nameOf(r)}`}
                            title="Ver productos y margen por producto"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {canEdit && (
        <div className="px-3 pb-1">
          <BulkBar
            count={selected.size}
            noun={{ one: "categoría seleccionada", many: "categorías y subcategorías seleccionadas" }}
            disabled={saving}
            onApply={(percent) => {
              onSet([...selected], percent);
              setSelected(new Set());
            }}
            onClear={() => {
              onSet([...selected], null);
              setSelected(new Set());
            }}
            onDeselect={() => setSelected(new Set())}
          />
        </div>
      )}
    </section>
  );
}
