"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Inbox, RefreshCw } from "lucide-react";
import { apiFailure } from "@/lib/api";
import {
  INBOX_STATUS_LABELS,
  INBOX_TYPES,
  INBOX_TYPE_LABELS,
  inboxApi,
  type InboxItem,
  type InboxPage,
  type InboxStatus,
  type InboxType,
} from "@/lib/inbox";
import InboxItemCard from "./InboxItemCard";

const STATUSES: InboxStatus[] = ["NEW", "HANDLED", "ARCHIVED"];

interface Props {
  showToast: (msg: string, ok?: boolean) => void;
  onPendingChange?: (pending: number) => void;
}

/**
 * "Solicitudes": todo lo que llega a NODO (altas, avisos de pago, pedidos de
 * plan, distribuidores y marcas, consultas de la landing). Cada una también
 * llega por mail; acá se ve el historial y se marca qué se atendió.
 */
export default function InboxPanel({ showToast, onPendingChange }: Props) {
  const [status, setStatus] = useState<InboxStatus>("NEW");
  const [type, setType] = useState<InboxType | "">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InboxPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inboxApi.list({ status, type: type || undefined, page });
      setData(res.data);
      setError(null);
      onPendingChange?.(res.data.pending);
    } catch (err) {
      setError(apiFailure(err).message ?? "No se pudo cargar la bandeja");
    } finally {
      setLoading(false);
    }
  }, [status, type, page, onPendingChange]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(item: InboxItem, next: InboxStatus) {
    setBusyId(item.id);
    try {
      await inboxApi.update(item.id, { status: next });
      showToast(next === "HANDLED" ? "Marcada como atendida" : next === "ARCHIVED" ? "Archivada" : "Reabierta");
      await load();
    } catch (err) {
      showToast(apiFailure(err).message ?? "No se pudo actualizar", false);
    } finally {
      setBusyId(null);
    }
  }

  async function saveNote(item: InboxItem, note: string): Promise<boolean> {
    try {
      const res = await inboxApi.update(item.id, { note: note.trim() || null });
      setData((prev) => prev && { ...prev, items: prev.items.map((i) => (i.id === item.id ? { ...i, note: res.data.note } : i)) });
      showToast("Nota guardada");
      return true;
    } catch (err) {
      showToast(apiFailure(err).message ?? "No se pudo guardar la nota", false);
      return false;
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Solicitudes</h2>
          <p className="text-xs text-surface-500 max-w-[60ch]">
            Altas, avisos de pago, pedidos de plan, distribuidores y marcas que quieren sumarse y consultas de la landing.
            Cada una también te llega por mail.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-800 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-1 rounded-lg border border-surface-800 p-1 w-fit">
          {STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => { setStatus(s); setPage(1); }}
              className={`rounded-md px-3 py-1 text-xs transition-colors ${status === s ? "bg-surface-800 text-white" : "text-surface-500 hover:text-surface-300"}`}>
              {INBOX_STATUS_LABELS[s]}
              {s === "NEW" && data && data.pending > 0 && (
                <span className="ml-1.5 rounded-full bg-brand-500 px-1.5 text-[10px] font-semibold text-white tabular-nums">{data.pending}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <TypeChip active={type === ""} onClick={() => { setType(""); setPage(1); }} label="Todas" />
          {INBOX_TYPES.map((t) => (
            <TypeChip key={t} active={type === t} onClick={() => { setType(t); setPage(1); }}
              label={INBOX_TYPE_LABELS[t]} count={data?.pendingByType[t]} />
          ))}
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

      {loading && !data ? (
        <ul className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => <li key={i} className="h-28 rounded-xl border border-surface-800 bg-surface-900/40 animate-pulse" />)}
        </ul>
      ) : data && data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-surface-800 py-12 text-center">
          <Inbox className="w-6 h-6 text-surface-600" />
          <p className="text-sm text-surface-300">{status === "NEW" ? "No hay nada pendiente." : "Nada por acá."}</p>
          <p className="text-xs text-surface-500 max-w-[44ch]">Cuando alguien se registre, avise un pago o mande una consulta, aparece acá.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {data?.items.map((item) => (
            <InboxItemCard key={`${item.id}-${item.note ?? ""}`} item={item} busy={busyId === item.id} onStatus={changeStatus} onNote={saveNote} />
          ))}
        </ul>
      )}

      {data && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs text-surface-400">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded-md hover:bg-surface-800 disabled:opacity-40" aria-label="Página anterior">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="tabular-nums">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded-md hover:bg-surface-800 disabled:opacity-40" aria-label="Página siguiente">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function TypeChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${active ? "border-brand-500 bg-brand-500/15 text-white" : "border-surface-800 text-surface-400 hover:border-surface-600"}`}>
      {label}
      {count ? <span className="ml-1 tabular-nums text-brand-300">{count}</span> : null}
    </button>
  );
}
