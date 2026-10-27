"use client";

import { useEffect } from "react";
import { ImageOff, X } from "lucide-react";
import { proxyImg } from "@/lib/format";
import { COMPARE_ROWS, STEP_LABEL, isEstimated, specText, verdict, type Build, type PcPart, type PcStep, type Qty } from "@/lib/pc-builder/compat";
import { inStock, useOfferPricer } from "@/lib/pc-builder/state";

const LEVEL_TEXT = { ok: "text-emerald-300", warn: "text-amber-300", bad: "text-red-300" } as const;

/** Dos o tres piezas del mismo paso lado a lado: datos, precio y cómo quedan con el armado. */
export default function CompareDialog({
  step, parts, build, qty, onChoose, onClose,
}: {
  step: PcStep;
  parts: PcPart[];
  build: Build;
  qty: Qty;
  onChoose: (part: PcPart) => void;
  onClose: () => void;
}) {
  const price = useOfferPricer();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  const best = (p: PcPart) => p.offers.filter(inStock).map((o) => price(o)).filter((x): x is NonNullable<typeof x> => x != null).sort((a, b) => a.usd - b.usd)[0] ?? null;
  // Se resaltan las filas donde las piezas difieren.
  const rows = COMPARE_ROWS[step].filter(([k]) => parts.some((p) => specText(p.compat[k]) !== "—"));

  return (
    <div role="dialog" aria-modal="true" aria-label={`Comparar ${STEP_LABEL[step].toLowerCase()}`} className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-surface-700 bg-surface-900 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-surface-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Comparar {STEP_LABEL[step].toLowerCase()}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-surface-400 hover:text-white"><X className="h-4 w-4" /></button>
        </header>
        <div className="overflow-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-surface-800">
                <th className="w-40 px-3 py-3" />
                {parts.map((p) => {
                  const img = p.image ?? p.offers.find((o) => o.imageUrl)?.imageUrl ?? null;
                  const pr = best(p);
                  const v = verdict(step, p, build, qty);
                  const issue = v.checks.find((c) => c.level !== "ok");
                  return (
                    <th key={p.contentId} className="px-3 py-3 text-left align-top font-normal">
                      <span className="mb-2 flex h-20 w-full items-center justify-center overflow-hidden rounded-md bg-white">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={proxyImg(img)} alt="" className="h-full object-contain p-1" />
                        ) : <ImageOff className="h-5 w-5 text-surface-400" />}
                      </span>
                      <span className="line-clamp-3 text-[13px] font-semibold leading-snug text-white">{p.name}</span>
                      <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-white">{pr?.label ?? "Sin stock"}</span>
                      {v.checks.length > 0 && <span className={`mt-1 block text-xs ${LEVEL_TEXT[v.level]}`}>{issue ? issue.text : "Compatible con tu armado"}</span>}
                      <button type="button" disabled={v.level === "bad" || !pr} onClick={() => onChoose(p)} className="mt-2 h-8 w-full rounded-lg bg-brand-600 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-40">Elegir</button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, label]) => {
                const values = parts.map((p) => (k === "pcie" && typeof p.compat[k] === "number" ? `PCIe ${p.compat[k]}.0` : specText(p.compat[k])));
                const differ = new Set(values).size > 1;
                return (
                  <tr key={k} className={`border-b border-surface-800/70 ${differ ? "bg-brand-600/5" : ""}`}>
                    <th scope="row" className="px-3 py-2 text-left text-xs font-semibold text-surface-400">{label}</th>
                    {parts.map((p, i) => (
                      <td key={p.contentId} className={`px-3 py-2 ${differ ? "text-white" : "text-surface-300"}`}>
                        {values[i]}
                        {isEstimated(p, k) && <span className="ml-1 text-[10px] text-amber-300" title="Lo completó la IA y no está revisado">(estimado)</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
