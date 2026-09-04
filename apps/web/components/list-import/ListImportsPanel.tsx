"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, FileSpreadsheet, Loader2, RotateCcw, Settings2, UploadCloud, XCircle,
} from "lucide-react";
import { listImportsApi, type ListImportRecord, type ListImportStatus, type Provider } from "@/lib/api";
import { freshnessLabel, invalidateListFreshness, useListFreshness } from "@/lib/listFreshness";
import NodoSpinner from "@/components/NodoSpinner";

const POLL_MS = 2500;

const STATUS_LABEL: Record<ListImportStatus, { text: string; cls: string }> = {
  PROCESSING: { text: "Procesando", cls: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  NEEDS_REVIEW: { text: "Revisar", cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  APPLIED: { text: "Aplicada", cls: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  DISCARDED: { text: "Descartada", cls: "text-surface-400 bg-surface-800 border-surface-700" },
  REVERTED: { text: "Revertida", cls: "text-surface-400 bg-surface-800 border-surface-700" },
  FAILED: { text: "Falló", cls: "text-red-400 bg-red-500/10 border-red-500/20" },
};

const TONE_CLS = {
  ok: "text-emerald-700 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/8",
  warn: "text-amber-400 border-amber-500/20 bg-amber-500/8",
  bad: "text-red-400 border-red-500/20 bg-red-500/8",
  muted: "text-surface-400 border-surface-800 bg-surface-900",
};

type Props = {
  provider: Provider;
  /** Nivel al que impacta lo que suba esta sesión: lo explica el backend por permisos, acá solo se muestra. */
  uploadsAsBase: boolean;
  onApplied?: () => void;
};

/** Pestaña "Listas" de un proveedor por lista: frescura, subida e historial. */
export default function ListImportsPanel({ provider, uploadsAsBase, onApplied }: Props) {
  const [rows, setRows] = useState<ListImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const freshness = useListFreshness(provider, refreshKey);

  const load = useCallback(async () => {
    try {
      const res = await listImportsApi.list(provider);
      setRows(res.data);
    } catch {
      /* se muestra vacío; el error real aparece al subir */
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void load();
  }, [load]);

  // Mientras haya una carga procesando, se consulta cada pocos segundos.
  const hasProcessing = rows.some((r) => r.status === "PROCESSING");
  useEffect(() => {
    if (!hasProcessing) return;
    const t = setInterval(async () => {
      await load();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [hasProcessing, load]);

  const prevProcessing = useRef(hasProcessing);
  useEffect(() => {
    if (prevProcessing.current && !hasProcessing) {
      invalidateListFreshness(provider);
      setRefreshKey((k) => k + 1);
      onApplied?.();
      const latest = rows[0];
      if (latest?.status === "NEEDS_REVIEW") setMessage({ ok: false, text: "La carga quedó en revisión: mirá los motivos antes de aplicarla." });
      else if (latest?.status === "APPLIED") setMessage({ ok: true, text: `Lista aplicada: ${summaryText(latest)}` });
      else if (latest?.status === "FAILED") setMessage({ ok: false, text: latest.error ?? "La carga falló" });
    }
    prevProcessing.current = hasProcessing;
  }, [hasProcessing, rows, provider, onApplied]);

  async function upload(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      await listImportsApi.upload(provider, file);
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage({ ok: false, text: msg || "No se pudo subir el archivo" });
    } finally {
      setUploading(false);
    }
  }

  async function revert(id: string) {
    if (!window.confirm("¿Deshacer esta carga? Se restauran los precios anteriores.")) return;
    setReverting(id);
    try {
      await listImportsApi.revert(provider, id);
      invalidateListFreshness(provider);
      setRefreshKey((k) => k + 1);
      await load();
      onApplied?.();
      setMessage({ ok: true, text: "Carga revertida" });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage({ ok: false, text: msg || "No se pudo revertir" });
    } finally {
      setReverting(null);
    }
  }

  const latestApplied = rows.find((r) => r.status === "APPLIED");
  const fresh = freshness ? freshnessLabel(freshness) : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Frescura */}
      <div className={`border rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm ${fresh ? TONE_CLS[fresh.tone] : TONE_CLS.muted}`}>
        <span className="flex items-center gap-2 font-semibold">
          <CalendarClock className="w-4 h-4" />
          {fresh?.text ?? "Cargando…"}
        </span>
        {freshness?.lastImportAt && (
          <span className="flex items-center gap-1.5 text-xs opacity-90">
            <Clock className="w-3.5 h-3.5" /> Última lista: {fmtDate(freshness.lastImportAt)}
          </span>
        )}
        {freshness?.expectedAt && (
          <span className="text-xs opacity-90">Próxima esperada: {fmtDate(freshness.expectedAt, false)}</span>
        )}
        {freshness && !freshness.listUpdateDays && (
          <span className="text-xs opacity-80">Definí la cadencia en la ficha del proveedor para que avise cuando venza.</span>
        )}
        <Link
          href={`/proveedores/${provider}/listas/perfil`}
          className="ml-auto flex items-center gap-1.5 text-xs font-medium underline-offset-2 hover:underline"
        >
          <Settings2 className="w-3.5 h-3.5" /> Perfil de lectura
        </Link>
      </div>

      {/* Subida */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-2 text-center transition-colors ${
          dragOver ? "border-brand-500 bg-brand-500/5" : "border-surface-700"
        } ${uploading ? "opacity-60 pointer-events-none" : ""}`}
      >
        {uploading ? <NodoSpinner className="w-6 h-6" /> : <UploadCloud className="w-6 h-6 text-brand-700 dark:text-brand-400" />}
        <p className="text-sm text-surface-200">
          Arrastrá la lista acá o{" "}
          <button type="button" onClick={() => inputRef.current?.click()} className="text-brand-700 dark:text-brand-400 font-semibold underline-offset-2 hover:underline">
            elegí el archivo
          </button>
        </p>
        <p className="text-xs text-surface-500">
          .xlsx, .xls o .csv · impacta como{" "}
          <span className="font-semibold text-surface-300">{uploadsAsBase ? "precio base del proveedor" : "tus precios"}</span>
          {" "}· si el formato es conocido y el diff es sano, se aplica sola
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>

      {message && (
        <div className={`flex items-center gap-2 text-xs rounded-lg px-3.5 py-2.5 border ${message.ok ? TONE_CLS.ok : TONE_CLS.bad}`}>
          {message.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
          {message.text}
        </div>
      )}

      {/* Historial */}
      <div className="border border-surface-800 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-900 text-[10px] uppercase tracking-wider text-surface-500 font-semibold">
          <FileSpreadsheet className="w-3.5 h-3.5" /> Cargas
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
        ) : rows.length === 0 ? (
          <p className="text-center text-xs text-surface-500 py-10">Todavía no se subió ninguna lista.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-surface-500">
                  <th className="text-left font-semibold px-4 py-2">Fecha</th>
                  <th className="text-left font-semibold px-3 py-2">Archivo</th>
                  <th className="text-left font-semibold px-3 py-2">Nivel</th>
                  <th className="text-right font-semibold px-3 py-2">Filas</th>
                  <th className="text-right font-semibold px-3 py-2">Nuevos</th>
                  <th className="text-right font-semibold px-3 py-2">Cambios</th>
                  <th className="text-right font-semibold px-3 py-2">Faltan</th>
                  <th className="text-left font-semibold px-3 py-2">Estado</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {rows.map((r) => {
                  const st = STATUS_LABEL[r.status];
                  const canRevert = r.status === "APPLIED" && latestApplied?.id === r.id;
                  return (
                    <tr key={r.id} className="hover:bg-surface-900/60">
                      <td className="px-4 py-2 text-surface-300 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                      <td className="px-3 py-2 text-surface-200 max-w-[16rem] truncate" title={r.originalFileName}>
                        {r.originalFileName}
                        {r.tenantName && <span className="block text-[11px] text-surface-500">{r.tenantName}</span>}
                      </td>
                      <td className="px-3 py-2 text-surface-400 text-xs">{r.level === "BASE" ? "Base" : "Propia"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-surface-300">{r.summary?.normalized ?? r.rowsData ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{r.summary?.created ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-400">{r.summary?.priceChanged ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-400">{r.summary?.missing ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/proveedores/${provider}/listas/${r.id}`}
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold border rounded-md px-2 py-0.5 ${st.cls}`}
                          title={r.error ?? undefined}
                        >
                          {r.status === "PROCESSING" && <Loader2 className="w-3 h-3 animate-spin" />}
                          {r.status === "FAILED" && <XCircle className="w-3 h-3" />}
                          {st.text}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {canRevert && (
                          <button
                            type="button"
                            onClick={() => revert(r.id)}
                            disabled={reverting === r.id}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-surface-400 hover:text-red-400"
                          >
                            {reverting === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                            Revertir
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function summaryText(r: ListImportRecord): string {
  const s = r.summary;
  if (!s) return r.originalFileName;
  return `${s.normalized} filas · ${s.created} nuevos · ${s.priceChanged} cambios de precio · ${s.missing} faltantes`;
}

export function fmtDate(iso: string, withTime = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return withTime
    ? d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
    : d.toLocaleDateString("es-AR", { dateStyle: "medium" });
}
