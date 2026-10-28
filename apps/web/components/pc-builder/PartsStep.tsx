"use client";

import { useEffect, useMemo, useState } from "react";
import { GitCompare, Search, SlidersHorizontal, X } from "lucide-react";
import NodoSpinner from "@/components/NodoSpinner";
import PartCard from "./PartCard";
import CompareDialog from "./CompareDialog";
import {
  FACETS, STEP_LABEL, dataQuality, facetValues, optionalNote, requirement, sortFacetOptions, verdict,
  type Build, type Facet, type PcPart, type PcStep, type Qty,
} from "@/lib/pc-builder/compat";
import { inStock, useOfferPricer, useStepParts, type ChosenPart } from "@/lib/pc-builder/state";
import { score } from "@/lib/pc-builder/auto";

const PAGE = 24;
const MAX_COMPARE = 3;
const LEVEL_RANK = { ok: 0, warn: 1, bad: 2 } as const;
// Verificada y con datos estimados pesan igual: lo que corre al final es la ficha incompleta.
const QUALITY_RANK = { verified: 0, estimated: 0, partial: 1 } as const;
/** Pasos donde "Recomendados" ordena por rendimiento por peso (en el resto, por precio). */
const BY_VALUE: PcStep[] = ["cpu", "gpu", "ram", "ssd"];
const WITH_ARTICLE: Record<PcStep, string> = {
  cpu: "el procesador", mobo: "la mother", ram: "la memoria", gpu: "la placa de video",
  ssd: "el almacenamiento", psu: "la fuente", case: "el gabinete", cooler: "la refrigeración",
};
/** Opciones visibles de entrada por filtro; el resto con "Ver más". */
const SHOWN = 8;

type Selected = Record<string, string[]>;
const matches = (f: Facet, p: PcPart, chosen: string[] | undefined) => !chosen?.length || facetValues(f, p).some((v) => chosen.includes(v));

/** Un paso del armado: filtros encadenados a la izquierda y los productos en tarjetas. */
export default function PartsStep({
  step, build, qty, chosen, onChoose, onSkip,
}: {
  step: PcStep;
  build: Build;
  qty: Qty;
  chosen: ChosenPart | undefined;
  onChoose: (part: PcPart, offer: string | null) => void;
  onSkip: () => void;
}) {
  const { parts, loading, error } = useStepParts(step);
  const price = useOfferPricer();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Selected>({});
  const [sort, setSort] = useState<"recomendado" | "precio" | "precio-desc" | "nombre">("recomendado");
  const [compare, setCompare] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [onlyStock, setOnlyStock] = useState(true);
  const [showBad, setShowBad] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => { setQ(""); setSel({}); setPage(1); setShowBad(false); setOpen({}); setCompare([]); setComparing(false); }, [step]);

  const facets = FACETS[step];
  // Base: búsqueda, stock y compatibilidad. Los filtros se aplican encima.
  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (parts ?? [])
      .map((p) => {
        const prices = p.offers.filter((o) => inStock(o)).map((o) => price(o)?.usd).filter((x): x is number => x != null);
        return { p, v: verdict(step, p, build, qty), best: prices.length ? Math.min(...prices) : null, quality: dataQuality(step, p) };
      })
      .filter((r) => (!needle || `${r.p.name} ${r.p.brand ?? ""}`.toLowerCase().includes(needle)) && (!onlyStock || r.best != null));
  }, [parts, q, onlyStock, build, qty, step, price]);
  const compatible = showBad ? base : base.filter((r) => r.v.level !== "bad");
  const hidden = base.length - base.filter((r) => r.v.level !== "bad").length;

  // Cada filtro cuenta sobre lo que dejan pasar los demás: si elegís AMD, en Socket quedan AM4 y AM5.
  const options = facets.map((f) => {
    const counts: Record<string, number> = {};
    for (const r of compatible) {
      if (!facets.every((g) => g === f || matches(g, r.p, sel[g.name]))) continue;
      for (const v of facetValues(f, r.p)) counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const v of sel[f.name] ?? []) counts[v] ??= 0;
    return { f, values: sortFacetOptions(f, counts), counts };
  });
  const rows = compatible
    .filter((r) => facets.every((f) => matches(f, r.p, sel[f.name])))
    .sort((a, b) => {
      if (sort === "nombre") return a.p.name.localeCompare(b.p.name, "es");
      if (sort === "precio-desc") return (b.best ?? 0) - (a.best ?? 0);
      // Recomendado: primero lo compatible sin dudas y con la ficha completa; después, lo que más rinde
      // por lo que cuesta (procesador, placa, memoria, disco) o lo más barato (el resto).
      if (sort === "recomendado") {
        const rank = (r: typeof a) => LEVEL_RANK[r.v.level] * 3 + QUALITY_RANK[r.quality] + (r.best == null ? 9 : 0);
        const value = (r: typeof a) => (r.best ? score(step, r.p, "gamer") / Math.pow(r.best, 0.85) : 0);
        return rank(a) - rank(b) || (BY_VALUE.includes(step) ? value(b) - value(a) : (a.best ?? 9e9) - (b.best ?? 9e9));
      }
      return (a.best ?? 9e9) - (b.best ?? 9e9);
    });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages);
  const active = Object.entries(sel).flatMap(([name, vals]) => vals.map((v) => ({ name, v })));
  const toggle = (name: string, v: string) => {
    setSel((x) => {
      const cur = x[name] ?? [];
      return { ...x, [name]: cur.includes(v) ? cur.filter((y) => y !== v) : [...cur, v] };
    });
    setPage(1);
  };
  const req = requirement(step, build, qty);
  const toggleCompare = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= MAX_COMPARE ? [...c.slice(1), id] : [...c, id]));
  const compareParts = compare.map((id) => (parts ?? []).find((p) => p.contentId === id)).filter((p): p is PcPart => Boolean(p));
  const optional = optionalNote(step, build);

  const panel = (
    <div className="flex flex-col gap-4">
      {options.map(({ f, values, counts }) => {
        if (!values.length) return null;
        const list = open[f.name] ? values : values.slice(0, SHOWN);
        return (
          <fieldset key={f.name} className="m-0 border-0 p-0">
            <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-surface-500">{f.name}</legend>
            <div className="flex flex-col">
              {list.map((v) => {
                const checked = (sel[f.name] ?? []).includes(v);
                const empty = !counts[v] && !checked;
                return (
                  <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] hover:bg-surface-800/60 ${empty ? "opacity-40" : ""}`}>
                    <input type="checkbox" checked={checked} disabled={empty} onChange={() => toggle(f.name, v)} className="h-3.5 w-3.5 accent-brand-500" />
                    <span className={`min-w-0 flex-1 truncate ${checked ? "font-semibold text-white" : "text-surface-200"}`}>{v}</span>
                    <span className="font-mono text-[11px] tabular-nums text-surface-500">{counts[v] ?? 0}</span>
                  </label>
                );
              })}
              {values.length > SHOWN && (
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [f.name]: !o[f.name] }))} className="mt-0.5 self-start px-1.5 text-xs font-medium text-brand-300 hover:text-white">
                  {open[f.name] ? "Ver menos" : `Ver ${values.length - SHOWN} más`}
                </button>
              )}
            </div>
          </fieldset>
        );
      })}
    </div>
  );

  return (
    <section className="flex flex-col gap-4" aria-label={`Elegir ${STEP_LABEL[step]}`}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Elegí {WITH_ARTICLE[step]}</h2>
          <p className="mt-1 text-sm text-surface-400">
            {req.length ? <>Se muestran los compatibles con tu armado: <span className="text-surface-200">{req.join(" · ")}</span></> : "Todavía no hay piezas que limiten esta elección."}
          </p>
          {optional && <p className="mt-1 text-sm text-surface-300">{optional}</p>}
        </div>
        {optional && !chosen && (
          <button type="button" onClick={onSkip} className="h-9 rounded-lg border border-surface-700 px-3 text-sm font-semibold text-surface-200 hover:border-surface-500 hover:text-white">
            Seguir sin {STEP_LABEL[step].toLowerCase()}
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="hidden rounded-xl border border-surface-800 bg-surface-900/60 p-3 xl:block" aria-label="Filtros">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Filtros</span>
            {active.length > 0 && <button type="button" onClick={() => { setSel({}); setPage(1); }} className="text-xs font-medium text-brand-300 hover:text-white">Limpiar</button>}
          </div>
          {panel}
        </aside>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-surface-800 bg-surface-900/60 p-2.5">
            <button type="button" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-surface-700 px-3 text-sm font-semibold text-surface-200 xl:hidden">
              <SlidersHorizontal className="h-4 w-4" /> Filtros{active.length ? ` (${active.length})` : ""}
            </button>
            <label className="relative min-w-[200px] flex-1">
              <span className="sr-only">Buscar</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Buscar por modelo o marca" className="h-9 w-full rounded-lg border border-surface-700 bg-surface-950 pl-9 pr-3 text-sm text-white placeholder:text-surface-500 focus:border-brand-500 focus:outline-none" />
            </label>
            <label className="flex items-center">
              <span className="sr-only">Ordenar</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-9 rounded-lg border border-surface-700 bg-surface-950 px-2.5 text-sm text-surface-200 focus:border-brand-500 focus:outline-none">
                <option value="recomendado">Recomendados</option>
                <option value="precio">Menor precio</option>
                <option value="precio-desc">Mayor precio</option>
                <option value="nombre">Nombre</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-2 px-1 text-sm text-surface-300">
              <input type="checkbox" checked={onlyStock} onChange={(e) => { setOnlyStock(e.target.checked); setPage(1); }} className="accent-brand-500" /> Con stock
            </label>
            <label className="inline-flex items-center gap-2 px-1 text-sm text-surface-300">
              <input type="checkbox" checked={showBad} onChange={(e) => { setShowBad(e.target.checked); setPage(1); }} className="accent-brand-500" /> Mostrar incompatibles{hidden ? ` (${hidden})` : ""}
            </label>
          </div>
          {filtersOpen && <div className="rounded-xl border border-surface-800 bg-surface-900/60 p-3 xl:hidden">{panel}</div>}

          {active.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {active.map(({ name, v }) => (
                <button key={`${name}:${v}`} type="button" onClick={() => toggle(name, v)} className="inline-flex h-7 items-center gap-1 rounded-md border border-brand-500/50 bg-brand-600/10 px-2 text-xs text-brand-100 hover:border-brand-400" title={`Quitar ${name}: ${v}`}>
                  <span className="text-surface-400">{name}:</span> {v} <X className="h-3 w-3" />
                </button>
              ))}
              <button type="button" onClick={() => { setSel({}); setPage(1); }} className="px-1 text-xs font-medium text-surface-400 hover:text-white">Limpiar filtros</button>
            </div>
          )}

          {loading && !parts ? (
            <div className="flex justify-center py-16"><NodoSpinner className="h-6 w-6" /></div>
          ) : error ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
          ) : rows.length === 0 ? (
            <p className="rounded-xl border border-surface-800 px-4 py-10 text-center text-sm text-surface-400">
              Ningún producto coincide.{hidden && !showBad ? ` Hay ${hidden} que no son compatibles con lo que ya elegiste: activá "Mostrar incompatibles" para ver por qué.` : ""}
            </p>
          ) : (
            <>
              <p className="text-xs text-surface-500">{rows.length} producto{rows.length === 1 ? "" : "s"}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {rows.slice((current - 1) * PAGE, current * PAGE).map(({ p, v }) => {
                  const issue = v.checks.find((c) => c.level !== "ok");
                  return (
                    <PartCard
                      key={p.contentId}
                      step={step}
                      part={p}
                      verdictLevel={v.checks.length ? v.level : null}
                      verdictText={issue ? issue.text : v.checks.length ? "Compatible con tu armado" : null}
                      selected={chosen?.part.contentId === p.contentId}
                      selectedOffer={chosen?.offer ?? null}
                      onChoose={(offer) => onChoose(p, offer)}
                      comparing={compare.includes(p.contentId)}
                      onCompare={() => toggleCompare(p.contentId)}
                    />
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-sm text-surface-400">
                <span>{(current - 1) * PAGE + 1}–{Math.min(rows.length, current * PAGE)} de {rows.length}</span>
                <span className="flex gap-2">
                  <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)} className="h-9 rounded-lg border border-surface-700 px-3 font-semibold text-surface-200 disabled:opacity-40">Anterior</button>
                  <button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)} className="h-9 rounded-lg border border-surface-700 px-3 font-semibold text-surface-200 disabled:opacity-40">Siguiente</button>
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {compareParts.length > 0 && (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-500/40 bg-surface-900/95 px-3 py-2.5 shadow-xl shadow-black/40 backdrop-blur">
          <span className="text-sm text-surface-200">{compareParts.length} para comparar{compareParts.length < 2 ? ": elegí otro" : ""}</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setCompare([])} className="h-9 rounded-lg px-3 text-sm font-medium text-surface-400 hover:text-white">Limpiar</button>
            <button type="button" disabled={compareParts.length < 2} onClick={() => setComparing(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-40">
              <GitCompare className="h-4 w-4" /> Comparar
            </button>
          </span>
        </div>
      )}
      {comparing && compareParts.length >= 2 && (
        <CompareDialog
          step={step}
          parts={compareParts}
          build={build}
          qty={qty}
          onClose={() => setComparing(false)}
          onChoose={(p) => { setComparing(false); setCompare([]); onChoose(p, null); }}
        />
      )}
    </section>
  );
}
