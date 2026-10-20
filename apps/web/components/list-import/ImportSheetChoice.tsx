"use client";

import { useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { listImportsApi, type ListImportRecord, type Provider } from "@/lib/api";

/**
 * Un Excel con varias hojas: dice cuál se leyó y deja elegir otra ahí mismo.
 * Volver a leer reprocesa la carga (o entra una nueva si ya se había aplicado)
 * y el perfil recuerda la hoja para las próximas planillas.
 */
export default function ImportSheetChoice({
  provider,
  record,
  allowApplied,
  onChanged,
}: {
  provider: Provider;
  record: Pick<ListImportRecord, "id" | "status" | "originalFileName" | "sheet">;
  /** Una carga ya aplicada solo se puede volver a leer si es la última. */
  allowApplied: boolean;
  onChanged: (next: ListImportRecord) => void;
}) {
  const sheet = record.sheet;
  const [picked, setPicked] = useState<number>(sheet?.index ?? 0);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!sheet || sheet.count < 2) return null;

  const canChange = record.status === "NEEDS_REVIEW" || record.status === "FAILED" || (record.status === "APPLIED" && allowApplied);
  const others = sheet.sheets.filter((s) => s.index !== sheet.index && s.dataRows > 0).length;

  async function reread() {
    setWorking(true);
    setError(null);
    try {
      onChanged((await listImportsApi.chooseSheet(provider, record.id, picked)).data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo leer esa hoja");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3 text-xs text-sky-100">
      <p className="flex items-start gap-2">
        <Layers className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        <span>
          «{record.originalFileName}» tiene <b>{sheet.count} hojas</b>. Leímos <b>«{sheet.name}»</b> ({sheet.dataRows}{" "}
          {sheet.dataRows === 1 ? "fila" : "filas"} con datos)
          {others > 0 ? `; hay ${others === 1 ? "otra hoja" : `${others} hojas más`} con una tabla.` : "."}
        </span>
      </p>
      {canChange && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
          <label className="sr-only" htmlFor={`sheet-${record.id}`}>
            Hoja a leer
          </label>
          <select
            id={`sheet-${record.id}`}
            value={picked}
            onChange={(e) => setPicked(Number(e.target.value))}
            className="rounded-lg border border-surface-700 bg-surface-950 px-2.5 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none"
          >
            {sheet.sheets.map((s) => (
              <option key={s.index} value={s.index} disabled={s.dataRows === 0}>
                {s.name} · {s.dataRows > 0 ? `${s.dataRows} filas` : "sin tabla de productos"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void reread()}
            disabled={working || picked === sheet.index}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {working && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Leer esta hoja
          </button>
          <span className="basis-full text-[11px] text-sky-200/70">
            Si tus productos están en otra hoja, elegila: volvemos a leer el archivo y la próxima vez que lo subas leemos esa.
          </span>
        </div>
      )}
      {error && <p className="mt-2 pl-5 text-red-300">{error}</p>}
    </div>
  );
}
