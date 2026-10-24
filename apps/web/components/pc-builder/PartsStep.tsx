"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import NodoSpinner from "@/components/NodoSpinner";
import PartCard from "./PartCard";
import { FACETS, STEP_LABEL, optionalNote, requirement, verdict, type Build, type PcPart, type PcStep } from "@/lib/pc-builder/compat";
import { inStock, useOfferPricer, useStepParts, type ChosenPart } from "@/lib/pc-builder/state";

const PAGE = 24;
const WITH_ARTICLE: Record<PcStep, string> = {
  cpu: "el procesador", mobo: "la mother", ram: "la memoria", gpu: "la placa de video",
  ssd: "el almacenamiento", psu: "la fuente", case: "el gabinete", cooler: "la refrigeración",
};

/** Un paso del armado: los productos compatibles en tarjetas, con filtros y orden. */
export default function PartsStep({
  step, build, chosen, onChoose, onSkip,
}: {
  step: PcStep;
  build: Build;
  chosen: ChosenPart | undefined;
  onChoose: (part: PcPart, offer: string | null) => void;
  onSkip: () => void;
}) {
  const { parts, loading, error } = useStepParts(step);
  const price = useOfferPricer();
  const [q, setQ] = useState("");
  const [facets, setFacets] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<"precio" | "precio-desc" | "nombre">("precio");
  const [onlyStock, setOnlyStock] = useState(true);
  const [showBad, setShowBad] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => { setQ(""); setFacets({}); setPage(1); setShowBad(false); }, [step]);

  const facetDefs = FACETS[step];
  const facetValues = useMemo(() => facetDefs.map(([name, read]) => {
    const count: Record<string, number> = {};
    for (const p of parts ?? []) { const v = read(p); if (v) count[v] = (count[v] ?? 0) + 1; }
    return { name, values: Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b, "es")).slice(0, 25) };
  }), [parts, facetDefs]);

  const best = (p: PcPart) => {
    const prices = p.offers.filter((o) => inStock(o)).map((o) => price(o)?.usd).filter((x): x is number => x != null);
    return prices.length ? Math.min(...prices) : null;
  };
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (parts ?? [])
      .map((p) => ({ p, v: verdict(step, p, build), best: best(p) }))
      .filter((r) => (!needle || `${r.p.name} ${r.p.brand ?? ""}`.toLowerCase().includes(needle))
        && facetDefs.every(([name, read]) => !facets[name] || read(r.p) === facets[name])
        && (!onlyStock || r.best != null))
      .sort((a, b) => sort === "nombre" ? a.p.name.localeCompare(b.p.name, "es") : sort === "precio-desc" ? (b.best ?? 0) - (a.best ?? 0) : (a.best ?? 9e9) - (b.best ?? 9e9));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, q, facets, sort, onlyStock, build, step, price]);
  const hidden = rows.filter((r) => r.v.level === "bad").length;
  const visible = showBad ? rows : rows.filter((r) => r.v.level !== "bad");
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const current = Math.min(page, pages);
  const req = requirement(step, build);
  const optional = optionalNote(step, build);

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

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-surface-800 bg-surface-900/60 p-2.5">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Buscar por modelo o marca" className="h-9 w-full rounded-lg border border-surface-700 bg-surface-950 pl-9 pr-3 text-sm text-white placeholder:text-surface-500 focus:border-brand-500 focus:outline-none" />
        </label>
        {facetValues.map((f) => (
          <label key={f.name} className="flex items-center">
            <span className="sr-only">{f.name}</span>
            <select value={facets[f.name] ?? ""} onChange={(e) => { setFacets((x) => ({ ...x, [f.name]: e.target.value })); setPage(1); }} className="h-9 rounded-lg border border-surface-700 bg-surface-950 px-2.5 text-sm text-surface-200 focus:border-brand-500 focus:outline-none">
              <option value="">{f.name}: todos</option>
              {f.values.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        ))}
        <label className="flex items-center">
          <span className="sr-only">Ordenar</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-9 rounded-lg border border-surface-700 bg-surface-950 px-2.5 text-sm text-surface-200 focus:border-brand-500 focus:outline-none">
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

      {loading && !parts ? (
        <div className="flex justify-center py-16"><NodoSpinner className="h-6 w-6" /></div>
      ) : error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-surface-800 px-4 py-10 text-center text-sm text-surface-400">
          Ningún producto coincide.{hidden ? ` Hay ${hidden} que no son compatibles con lo que ya elegiste: activá "Mostrar incompatibles" para ver por qué.` : ""}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.slice((current - 1) * PAGE, current * PAGE).map(({ p, v }) => {
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
                />
              );
            })}
          </div>
          <div className="flex items-center justify-between text-sm text-surface-400">
            <span>{(current - 1) * PAGE + 1}–{Math.min(visible.length, current * PAGE)} de {visible.length}</span>
            <span className="flex gap-2">
              <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)} className="h-9 rounded-lg border border-surface-700 px-3 font-semibold text-surface-200 disabled:opacity-40">Anterior</button>
              <button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)} className="h-9 rounded-lg border border-surface-700 px-3 font-semibold text-surface-200 disabled:opacity-40">Siguiente</button>
            </span>
          </div>
        </>
      )}
    </section>
  );
}
