"use client";

import { useEffect, useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { enrichmentApi, type EnrichmentRun, type MasterFilters } from "@/lib/enrichment";
import { errMsg, fmtWhen, type ShowToast } from "./shared";

const POLL_MS = 3000;

const STATUS_TEXT: Record<EnrichmentRun["status"], string> = {
  RUNNING: "En curso",
  DONE: "Terminada",
  CANCELLED: "Cancelada",
  FAILED: "Cortada",
};

/**
 * Corridas en segundo plano: arrancar una muestra o el filtro actual con tope
 * de productos y de costo, ver el progreso y cancelar.
 */
export default function RunBar({
  filters,
  filteredTotal,
  showToast,
  onProgress,
}: {
  filters: MasterFilters;
  filteredTotal: number;
  showToast: ShowToast;
  onProgress: () => void;
}) {
  const [runs, setRuns] = useState<EnrichmentRun[]>([]);
  const [maxItems, setMaxItems] = useState(30);
  const [maxCost, setMaxCost] = useState(1);
  const [onlyNew, setOnlyNew] = useState(true);
  const [busy, setBusy] = useState(false);
  const active = runs.find((r) => r.status === "RUNNING") ?? null;
  const last = runs[0] ?? null;

  useEffect(() => {
    let alive = true;
    const load = () =>
      enrichmentApi
        .runs()
        .then((res) => alive && setRuns(res.data))
        .catch(() => undefined);
    void load();
    const t = setInterval(() => {
      if (active) {
        void load();
        onProgress();
      }
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [active, onProgress]);

  async function start(kind: "sample" | "filter") {
    setBusy(true);
    try {
      const res = await enrichmentApi.startRun({ kind, filter: filters, maxItems, maxCostUsd: maxCost, onlyNew });
      setRuns((prev) => [res.data, ...prev]);
      showToast(`Corrida iniciada: ${res.data.total} productos`);
    } catch (err) {
      showToast(errMsg(err, "No se pudo iniciar la corrida"), false);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!active) return;
    try {
      await enrichmentApi.cancelRun(active.id);
      showToast("Se cancela al terminar los productos en curso");
    } catch (err) {
      showToast(errMsg(err, "No se pudo cancelar"), false);
    }
  }

  const shown = active ?? last;
  const pct = shown && shown.total ? Math.round((shown.processed / shown.total) * 100) : 0;

  return (
    <section className="rounded-xl border border-surface-800 bg-surface-900/40 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[11px] text-surface-400">
          Tope de productos
          <input
            type="number"
            min={1}
            max={25000}
            value={maxItems}
            onChange={(e) => setMaxItems(Math.max(1, Number(e.target.value) || 1))}
            className="mt-1 block w-24 rounded-md border border-surface-700 bg-surface-950 px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="text-[11px] text-surface-400">
          Tope de costo IA (US$)
          <input
            type="number"
            min={0}
            max={200}
            step={0.5}
            value={maxCost}
            onChange={(e) => setMaxCost(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 block w-24 rounded-md border border-surface-700 bg-surface-950 px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-surface-300">
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} className="accent-brand-500" />
          Solo sin enriquecer
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !!active}
            onClick={() => void start("sample")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-1.5 text-xs font-medium text-surface-200 hover:border-surface-500 hover:text-white disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" /> Muestra al azar
          </button>
          <button
            type="button"
            disabled={busy || !!active || filteredTotal === 0}
            onClick={() => void start("filter")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Enriquecer el filtro ({Math.min(filteredTotal, maxItems)})
          </button>
        </div>
      </div>

      {shown && (
        <div className="mt-3 border-t border-surface-800 pt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-surface-300">
            <span className="font-medium text-white">
              {STATUS_TEXT[shown.status]}
              {shown.cancelRequested && shown.status === "RUNNING" ? " · cancelando…" : ""}
            </span>
            <span className="tabular-nums">
              {shown.processed}/{shown.total} productos
            </span>
            <span className="tabular-nums">{shown.proposals} propuestas</span>
            {shown.failed > 0 && <span className="tabular-nums text-red-300">{shown.failed} con error</span>}
            <span className="tabular-nums">
              IA: {shown.aiCalls} llamadas · ~US$ {shown.estCostUsd.toFixed(3)} de {shown.maxCostUsd}
            </span>
            <span className="text-surface-500">{fmtWhen(shown.startedAt)}</span>
            {active && (
              <button type="button" onClick={() => void cancel()} className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-500/30 px-2 py-1 text-red-300 hover:bg-red-500/10">
                <Square className="h-3 w-3" /> Cancelar
              </button>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full transition-[width] duration-500 ${shown.status === "RUNNING" ? "bg-brand-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
          </div>
          {shown.error && <p className="mt-2 text-xs text-red-300">{shown.error}</p>}
          {shown.log && shown.log.length > 0 && (
            <details className="mt-2 text-[11px] text-surface-400">
              <summary className="cursor-pointer select-none hover:text-surface-200">Notas de la corrida ({shown.log.length})</summary>
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
                {shown.log.slice(-60).map((l, i) => (
                  <li key={`${l.at}-${i}`}>
                    <span className="text-surface-600">{fmtWhen(l.at)}</span> {l.msg}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
