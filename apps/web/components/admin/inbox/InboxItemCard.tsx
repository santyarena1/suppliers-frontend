"use client";

import { useState } from "react";
import { Archive, Check, Mail, MailCheck, MessageCircle, Phone, RotateCcw, Store } from "lucide-react";
import { whatsappForPhone } from "@/lib/contact";
import { INBOX_TYPE_LABELS, type InboxItem, type InboxStatus, type InboxType } from "@/lib/inbox";

export const TYPE_TONE: Record<InboxType, string> = {
  SIGNUP: "bg-surface-700/40 text-surface-300 border-surface-700",
  NEW_STORE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  PAYMENT_NOTICE: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  PLAN_REQUEST: "bg-brand-500/15 text-brand-300 border-brand-500/30",
  SUPPLIER_JOIN: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  CONTACT: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
};

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

interface Props {
  item: InboxItem;
  busy: boolean;
  onStatus: (item: InboxItem, status: InboxStatus) => void;
  onNote: (item: InboxItem, note: string) => Promise<boolean>;
}

/** Una solicitud: quién, qué pidió, cómo contactarlo y qué se hizo. */
export default function InboxItemCard({ item, busy, onStatus, onNote }: Props) {
  const [note, setNote] = useState(item.note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const wa = whatsappForPhone(item.contactPhone);
  const dataRows = Object.entries(item.data ?? {}).filter(([, v]) => v !== null && v !== "");
  const noteDirty = note.trim() !== (item.note ?? "");

  async function saveNote() {
    setSavingNote(true);
    await onNote(item, note);
    setSavingNote(false);
  }

  return (
    <li className={`rounded-xl border p-4 flex flex-col gap-3 ${item.status === "NEW" ? "border-surface-700 bg-surface-900/60" : "border-surface-800 bg-surface-900/20"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TYPE_TONE[item.type]}`}>
              {INBOX_TYPE_LABELS[item.type]}
            </span>
            {item.status === "NEW" && <span className="h-1.5 w-1.5 rounded-full bg-brand-400" aria-label="Pendiente" />}
            <span className="text-[11px] text-surface-500 tabular-nums">{when(item.createdAt)}</span>
            {item.emailedAt && (
              <span className="inline-flex items-center gap-1 text-[11px] text-surface-500" title={`Aviso por mail ${when(item.emailedAt)}`}>
                <MailCheck className="w-3 h-3" /> mail enviado
              </span>
            )}
          </div>
          <h3 className="mt-1.5 text-sm font-semibold text-white break-words">{item.title}</h3>
        </div>
        <div className="flex gap-1.5">
          {item.status === "NEW" ? (
            <>
              <button type="button" disabled={busy} onClick={() => onStatus(item, "HANDLED")}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50">
                <Check className="w-3.5 h-3.5" /> Atendida
              </button>
              <button type="button" disabled={busy} onClick={() => onStatus(item, "ARCHIVED")}
                className="inline-flex items-center gap-1 rounded-lg border border-surface-700 px-2.5 py-1.5 text-xs text-surface-300 hover:bg-surface-800 active:scale-[0.98] disabled:opacity-50">
                <Archive className="w-3.5 h-3.5" /> Archivar
              </button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={() => onStatus(item, "NEW")}
              className="inline-flex items-center gap-1 rounded-lg border border-surface-700 px-2.5 py-1.5 text-xs text-surface-300 hover:bg-surface-800 active:scale-[0.98] disabled:opacity-50">
              <RotateCcw className="w-3.5 h-3.5" /> Reabrir
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {(item.company || item.tenantName) && (
          <span className="inline-flex items-center gap-1 text-surface-200">
            <Store className="w-3.5 h-3.5 text-surface-500" />
            {item.tenantName ?? item.company}
            {item.tenantName && item.company && item.company !== item.tenantName && <span className="text-surface-500">({item.company})</span>}
          </span>
        )}
        {item.contactName && <span className="text-surface-300">{item.contactName}</span>}
        {item.contactEmail && (
          <a href={`mailto:${item.contactEmail}`} className="inline-flex items-center gap-1 text-brand-300 hover:underline break-all">
            <Mail className="w-3.5 h-3.5" /> {item.contactEmail}
          </a>
        )}
        {item.contactPhone && (
          wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-300 hover:underline">
              <MessageCircle className="w-3.5 h-3.5" /> {item.contactPhone}
            </a>
          ) : (
            <span className="inline-flex items-center gap-1 text-surface-300"><Phone className="w-3.5 h-3.5" /> {item.contactPhone}</span>
          )
        )}
      </div>

      {item.message && (
        <p className="whitespace-pre-wrap break-words rounded-lg bg-surface-950/60 border border-surface-800 px-3 py-2 text-xs leading-relaxed text-surface-200">
          {item.message}
        </p>
      )}

      {dataRows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          {dataRows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-surface-500">{k}</dt>
              <dd className="text-surface-100 break-all font-medium">{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          placeholder="Nota interna (qué se hizo, a quién se llamó…)"
          className="flex-1 min-w-0 rounded-lg border border-surface-800 bg-surface-950 px-3 py-1.5 text-xs text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none"
        />
        {noteDirty && (
          <button type="button" disabled={savingNote} onClick={saveNote}
            className="rounded-lg bg-surface-800 px-3 py-1.5 text-xs text-white hover:bg-surface-700 disabled:opacity-50">
            {savingNote ? "Guardando…" : "Guardar nota"}
          </button>
        )}
      </div>
      {item.handledAt && <p className="text-[11px] text-surface-500">Cerrada {when(item.handledAt)}</p>}
    </li>
  );
}
