"use client";

import { ImageOff } from "lucide-react";
import type { ProductDTO } from "@/lib/api";
import { formatARS, formatUSD, proxyImg } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import ProviderBadge from "@/components/ProviderBadge";
import { STEP_LABEL, byLevel, checks, optionalNote, powerNeed, psuWatts, worst, type Build, type PcStep } from "@/lib/pc-builder/compat";
import { PART_STEPS, type ChosenPart, type CustomLine, type ExtraLine, type StepId, useOfferPricer } from "@/lib/pc-builder/state";

const DOT = { ok: "bg-emerald-400", warn: "bg-amber-400", bad: "bg-red-400" } as const;

export interface Totals {
  amount: number;
  byProvider: Record<string, { amount: number; units: number }>;
  missing: number;
}

/** Suma del armado en la moneda del comercio, con el reparto por distribuidor. */
export function useBuildTotals(
  parts: Partial<Record<PcStep, ChosenPart>>,
  offers: Partial<Record<PcStep, ProductDTO | null>>,
  extras: ExtraLine[],
  custom: CustomLine[]
): Totals {
  const price = useOfferPricer();
  const { currency, convert } = usePrefs();
  const t: Totals = { amount: 0, byProvider: {}, missing: 0 };
  const add = (p: ProductDTO | null | undefined, qty: number) => {
    const pr = p ? price(p) : null;
    if (!p || !pr) { t.missing++; return; }
    t.amount += pr.amount * qty;
    const row = (t.byProvider[p.provider] ??= { amount: 0, units: 0 });
    row.amount += pr.amount * qty;
    row.units += qty;
  };
  for (const s of PART_STEPS) if (parts[s]) add(offers[s], parts[s]!.qty);
  for (const e of extras) add(e.product, e.qty);
  // Las líneas libres se cargan en pesos con IVA: en dólares se pasan con la cotización del comercio.
  const arsPerUsd = currency === "ARS" ? 1 : convert(1).currency === "USD" ? null : convert(1).amount;
  for (const c of custom) {
    if (currency === "ARS") t.amount += c.unitFinalPrice * c.qty;
    else if (arsPerUsd) t.amount += (c.unitFinalPrice / arsPerUsd) * c.qty;
  }
  return t;
}

export function money(amount: number, currency: string) {
  return currency === "USD" ? formatUSD(amount) : formatARS(amount);
}

/** Resumen fijo del armado: piezas, compatibilidad, consumo y total. */
export default function BuildSummary({
  build, parts, offers, extras, custom, totals, split, onSplit, onGo, onQuote, onCart, busy,
}: {
  build: Build;
  parts: Partial<Record<PcStep, ChosenPart>>;
  offers: Partial<Record<PcStep, ProductDTO | null>>;
  extras: ExtraLine[];
  custom: CustomLine[];
  totals: Totals;
  split: "cheap" | "few";
  onSplit: (s: "cheap" | "few") => void;
  onGo: (s: StepId) => void;
  onQuote: () => void;
  onCart: () => void;
  busy: boolean;
}) {
  const price = useOfferPricer();
  const { currency } = usePrefs();
  const cs = checks(build).sort(byLevel);
  const level = worst(cs);
  const bad = cs.filter((c) => c.level === "bad").length;
  const warn = cs.filter((c) => c.level === "warn").length;
  const need = powerNeed(build);
  const have = psuWatts(build);
  const count = Object.keys(parts).length + extras.length + custom.length;

  return (
    <aside className="flex flex-col overflow-hidden rounded-xl border border-surface-800 bg-surface-900 lg:sticky lg:top-4" aria-label="Tu armado">
      <div className="flex items-center justify-between gap-2 border-b border-surface-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Tu armado</h2>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-surface-200">
          <span className={`h-2 w-2 rounded-full ${Object.keys(parts).length ? DOT[level] : "bg-surface-600"}`} />
          {bad ? `${bad} incompatible${bad > 1 ? "s" : ""}` : warn ? `${warn} para verificar` : Object.keys(parts).length ? "Compatible" : "Vacío"}
        </span>
      </div>

      <ul className="m-0 flex list-none flex-col p-0">
        {PART_STEPS.map((s) => {
          const c = parts[s];
          const o = offers[s];
          const p = o ? price(o) : null;
          const img = c ? c.part.image ?? c.part.offers.find((x) => x.imageUrl)?.imageUrl ?? null : null;
          const issue = c ? cs.find((x) => x.parts.includes(s) && x.level !== "ok") : null;
          return (
            <li key={s} className="border-b border-surface-800/70">
              <button type="button" onClick={() => onGo(s)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-800/50">
                <span className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(img)} alt="" className="h-full w-full object-contain p-0.5" />
                  ) : c ? <ImageOff className="h-4 w-4 text-surface-400" /> : <span className="h-full w-full bg-surface-800" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-surface-500">{STEP_LABEL[s]}</span>
                  <span className={`block truncate text-[13px] ${c ? "text-white" : "text-surface-500"}`}>
                    {c ? c.part.name : optionalNote(s, build) ? "Opcional" : "Sin elegir"}
                  </span>
                  {issue && <span className={`block truncate text-[11px] ${issue.level === "bad" ? "text-red-300" : "text-amber-300"}`}>{issue.text}</span>}
                </span>
                {c && (
                  <span className="flex flex-shrink-0 flex-col items-end gap-0.5">
                    <span className="font-mono text-xs tabular-nums text-surface-100">{p ? p.label : "—"}</span>
                    {o && <ProviderBadge provider={o.provider} variant="logo-only" size="sm" />}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        <li className="border-b border-surface-800/70">
          <button type="button" onClick={() => onGo("extras")} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] hover:bg-surface-800/50">
            <span className="text-surface-300">Extras y periféricos</span>
            <span className="text-surface-500">{extras.length + custom.length ? `${extras.length + custom.length} línea${extras.length + custom.length > 1 ? "s" : ""}` : "Agregar"}</span>
          </button>
        </li>
      </ul>

      {need && (
        <div className="border-b border-surface-800 px-4 py-3">
          <div className="flex justify-between text-xs text-surface-400">
            <span>Consumo estimado {need.estimate} W</span>
            <span className="font-mono tabular-nums text-surface-100">{have ? `${have} W` : "sin fuente"}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-800">
            <div className={`h-full ${have && have >= need.recommended * 1.1 ? "bg-emerald-400" : have && have >= need.recommended ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${have ? Math.min(100, Math.round((need.estimate / have) * 100)) : 0}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-surface-500">Fuente recomendada: {need.recommended} W o más.</p>
        </div>
      )}

      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-surface-700 text-xs font-semibold" role="group" aria-label="De qué distribuidor sale cada pieza">
          <button type="button" aria-pressed={split === "cheap"} onClick={() => onSplit("cheap")} className={`py-1.5 ${split === "cheap" ? "bg-surface-800 text-white" : "text-surface-400 hover:text-white"}`}>Más barato</button>
          <button type="button" aria-pressed={split === "few"} onClick={() => onSplit("few")} className={`py-1.5 ${split === "few" ? "bg-surface-800 text-white" : "text-surface-400 hover:text-white"}`}>Menos distribuidores</button>
        </div>
        {Object.keys(totals.byProvider).length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {Object.entries(totals.byProvider).sort((a, b) => b[1].amount - a[1].amount).map(([prov, r]) => (
              <li key={prov} className="flex items-center justify-between gap-2 text-xs">
                <ProviderBadge provider={prov} variant="inline" size="sm" />
                <span className="text-surface-500">{r.units} u.</span>
                <span className="ml-auto font-mono tabular-nums text-surface-100">{money(r.amount, currency)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-baseline justify-between border-t border-surface-800 pt-3">
          <span className="text-sm text-surface-300">Total costo</span>
          <span className="font-mono text-2xl font-semibold tabular-nums text-white">{money(totals.amount, currency)}</span>
        </div>
        {totals.missing > 0 && <p className="text-[11px] text-amber-300">{totals.missing} pieza{totals.missing > 1 ? "s" : ""} sin precio o sin stock no suma{totals.missing > 1 ? "n" : ""}.</p>}
        <p className="text-[11px] text-surface-500">Precio de tu cuenta, con los impuestos que tenés activos. El margen para el cliente se pone en el presupuesto.</p>
        <button type="button" disabled={!count || busy} onClick={onQuote} className="h-10 rounded-lg bg-brand-600 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-40">
          {busy ? "Creando…" : "Crear presupuesto"}
        </button>
        <button type="button" disabled={!count || busy || bad > 0} onClick={onCart} title={bad ? "Hay piezas incompatibles" : undefined} className="h-10 rounded-lg border border-surface-700 text-sm font-semibold text-surface-100 hover:border-surface-500 disabled:opacity-40">
          Agregar al carrito
        </button>
      </div>
    </aside>
  );
}
