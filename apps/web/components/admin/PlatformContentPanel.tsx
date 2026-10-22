"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Eye, FileStack, Loader2, TriangleAlert, Upload } from "lucide-react";
import { providerLabel } from "@/components/ProviderBadge";
import { platformContentApi, type PlatformContentRun, type PlatformContentStatus } from "@/lib/api";

const POLL_MS = 3000;

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

const n = (v: number | undefined) => (v ?? 0).toLocaleString("es-AR");
const when = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

interface Props {
  showToast: (msg: string, ok?: boolean) => void;
}

/** Fichas enriquecidas desde AcuStock: previsualizar el cruce y cargar. */
export default function PlatformContentPanel({ showToast }: Props) {
  const [status, setStatus] = useState<PlatformContentStatus | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await platformContentApi.status();
      setStatus(r.data);
    } catch (err) {
      showToast(errMsg(err, "No se pudo leer el estado de las fichas enriquecidas"), false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const running = Boolean(status?.running || status?.runs.some((r) => r.status === "RUNNING"));
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [running, load]);

  const start = async (mode: "preview" | "apply") => {
    setBusy(true);
    try {
      await (mode === "preview" ? platformContentApi.preview() : platformContentApi.apply());
      showToast(mode === "preview" ? "Cruce en curso: no se escribe nada" : "Carga en curso");
      setConfirmApply(false);
      await load();
    } catch (err) {
      showToast(errMsg(err, "No se pudo iniciar"), false);
    } finally {
      setBusy(false);
    }
  };

  const last = status?.runs[0] ?? null;
  const lastPreviewOk = status?.runs.find((r) => r.mode === "PREVIEW" && r.status === "OK");

  return (
    <section className="rounded-2xl border border-surface-800 bg-surface-900/60 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <FileStack className="h-4 w-4 text-brand-400" /> Fichas enriquecidas · AcuStock
          </h2>
          <p className="mt-1 max-w-xl text-xs text-surface-400">
            Fotos, descripción y especificaciones de AcuStock en las fichas de los distribuidores que AcuStock agrupó en
            cada producto (por código de proveedor). Cada ficha sigue con su precio y su stock.
          </p>
        </div>
        <div className="text-right text-xs text-surface-400">
          <p>
            <span className="font-semibold text-white tabular-nums">{n(status?.contents)}</span> fichas cargadas
          </p>
          <p>
            <span className="font-semibold text-white tabular-nums">{n(status?.links)}</span> productos de distribuidor con ficha
          </p>
        </div>
      </header>

      {status && !status.configured && (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <TriangleAlert className="h-4 w-4" /> Falta configurar ACUSTOCK_EXPORT_URL y ACUSTOCK_EXPORT_TOKEN en el servidor.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || running || !status?.configured}
          onClick={() => void start("preview")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-xs font-semibold text-white hover:bg-surface-700 disabled:opacity-50"
        >
          <Eye className="h-3.5 w-3.5" /> Previsualizar cruce
        </button>
        {confirmApply ? (
          <span className="inline-flex items-center gap-2 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 text-xs text-surface-200">
            Reemplaza los vínculos de AcuStock.
            <button type="button" onClick={() => void start("apply")} disabled={busy} className="font-semibold text-brand-300 hover:text-white">
              Confirmar carga
            </button>
            <button type="button" onClick={() => setConfirmApply(false)} className="text-surface-400 hover:text-white">
              Cancelar
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={busy || running || !lastPreviewOk}
            onClick={() => setConfirmApply(true)}
            title={lastPreviewOk ? undefined : "Primero previsualizá el cruce"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" /> Cargar fichas
          </button>
        )}
      </div>

      {last && <RunSummary run={last} />}
    </section>
  );
}

function RunSummary({ run }: { run: PlatformContentRun }) {
  const s = run.stats ?? {};
  const providers = Object.entries(s.byProvider ?? {}).sort((a, b) => b[1] - a[1]);
  const unknown = Object.entries(s.unknownSuppliers ?? {});
  return (
    <div className="mt-5 rounded-xl border border-surface-800 bg-surface-950/60 p-4 text-xs text-surface-300">
      <p className="flex items-center gap-2 font-semibold text-white">
        {run.status === "RUNNING" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" />
        ) : run.status === "OK" ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <TriangleAlert className="h-3.5 w-3.5 text-red-400" />
        )}
        {run.mode === "PREVIEW" ? "Previsualización" : "Carga"} · {when(run.startedAt)}
        {run.status === "RUNNING" && s.phase && (
          <span className="font-normal text-surface-400">
            {s.phase}
            {s.page && s.totalPages ? ` (${s.page}/${s.totalPages})` : ""}
          </span>
        )}
      </p>
      {run.errorMessage && <p className="mt-2 text-red-300">{run.errorMessage}</p>}

      {s.sourceTotal != null && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Productos en AcuStock" value={n(s.sourceTotal)} />
            <Stat label="Con match en NODO" value={`${n(s.sourceMatched)} (${Math.round(((s.sourceMatched ?? 0) / Math.max(1, s.sourceTotal)) * 100)} %)`} />
            <Stat label="Fichas de distribuidor vinculadas" value={n(s.links)} />
            <Stat label="Ambiguas (no se vinculan)" value={n(s.ambiguous)} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <List title="Sin vincular" rows={[["Sin códigos de proveedor", s.sourceWithoutCodes ?? 0], ["Con códigos que no están en NODO", Math.max(0, (s.sourceUnmatched ?? 0) - (s.sourceWithoutCodes ?? 0))]]} />
            <List title="Por distribuidor" rows={providers.map(([p, v]) => [providerLabel(p), v])} />
            <List
              title="Contenido"
              rows={[
                ["Con fotos", s.withImages ?? 0],
                ["Con descripción", s.withDescription ?? 0],
                ["Con especificaciones", s.withSpecs ?? 0],
              ]}
            />
          </div>
          {unknown.length > 0 && (
            <p className="mt-3 text-surface-400">
              Distribuidores de AcuStock que NODO no conoce: {unknown.map(([k, v]) => `${k} (${v})`).join(", ")}
            </p>
          )}
          {(s.unmatchedSample?.length ?? 0) > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-surface-400 hover:text-white">
                Ejemplos sin match ({n(s.sourceUnmatched)} en total)
              </summary>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {s.unmatchedSample?.map((name, i) => (
                  <li key={`${name}-${i}`} className="truncate text-surface-400">
                    {name}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-800 bg-surface-900/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-surface-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

function List({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-surface-500">{title}</p>
      <ul className="space-y-0.5">
        {rows.map(([k, v]) => (
          <li key={k} className="flex justify-between gap-3">
            <span>{k}</span>
            <span className="tabular-nums text-white">{n(v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
