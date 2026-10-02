"use client";

import { useEffect, useState } from "react";
import { PLAN_CATALOG, formatUsd, type AdminSubscriptionDetail } from "@/lib/plans";
import { Fold, btnCls, fmtDate, inputCls } from "./shared";

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Alta",
  PLAN_CHANGED: "Cambio de plan",
  PAYMENT_RECORDED: "Pago registrado",
  SETUP_FEE_PAID: "Puesta en marcha pagada",
  SETUP_FEE_UPDATED: "Puesta en marcha actualizada",
  BILLING_DATE_CHANGED: "Fecha de cobro modificada",
  EXTENDED: "Vencimiento extendido",
  COURTESY_SET: "Cortesía otorgada",
  COURTESY_CANCELLED: "Cortesía cancelada",
  COURTESY_CONVERTED: "Cortesía convertida en suscripción",
  SUSPENDED: "Suspendida",
  REACTIVATED: "Reactivada",
  CANCELLED: "Cancelada",
  STATUS_CHANGED: "Cambio de estado",
  PLAN_REQUESTED: "Pedido de cambio de plan",
  UPGRADE_REQUESTED: "Pedido de upgrade",
  PAYMENT_NOTICE: "Aviso de pago del cliente",
};

/** Lo que el cliente o Administración escribió en el evento (Nº de operación, comentario, motivo). */
const EVENT_DATA_LABELS: [string, string][] = [
  ["reference", "Nº de operación"],
  ["message", "Comentario"],
  ["reason", "Motivo"],
  ["note", "Nota"],
];

function eventDetails(data: Record<string, unknown> | null | undefined): [string, string][] {
  if (!data) return [];
  return EVENT_DATA_LABELS.flatMap(([key, label]) => {
    const value = data[key];
    return typeof value === "string" && value.trim() ? [[label, value.trim()] as [string, string]] : [];
  });
}

const REMINDER_LABELS: Record<string, string> = {
  UPCOMING_7D: "7 días antes",
  UPCOMING_3D: "3 días antes",
  DUE_TODAY: "Día del vencimiento",
  OVERDUE_3D: "3 días vencida",
  SUSPENSION_TOMORROW: "Un día antes de suspender",
  SUSPENDED: "Suspensión",
};

/** Pagos, historial, recordatorios y notas: plegados para no tapar las acciones. */
export default function SubscriptionRecords({
  detail,
  busy,
  onSaveNotes,
}: {
  detail: AdminSubscriptionDetail;
  busy: boolean;
  onSaveNotes: (notes: string | null) => void;
}) {
  const [notes, setNotes] = useState(detail.notes ?? "");
  useEffect(() => setNotes(detail.notes ?? ""), [detail.notes]);

  return (
    <div className="flex flex-col gap-2">
      <Fold title="Pagos" count={detail.payments.length}>
        {detail.payments.length === 0 ? (
          <p className="text-[11px] text-surface-500">Sin pagos registrados.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-surface-800 text-[11px]">
            {detail.payments.map((p) => (
              <li key={p.id} className="py-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="text-white">{formatUsd(p.amount)}</span>
                <span className="text-surface-300">{p.kind === "SETUP_FEE" ? "Puesta en marcha" : p.planLabel ?? "Suscripción"}</span>
                <span className="text-surface-400">{fmtDate(p.paidAt)}</span>
                {p.periodStart && (
                  <span className="text-surface-500">
                    {fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}
                  </span>
                )}
                <span className="text-surface-500">{p.providerLabel}</span>
                {p.externalReference && <span className="text-surface-500">Ref. {p.externalReference}</span>}
                {p.recordedBy && <span className="text-surface-600">por {p.recordedBy}</span>}
              </li>
            ))}
          </ul>
        )}
      </Fold>

      <Fold title="Historial" count={detail.events.length}>
        {detail.events.length === 0 ? (
          <p className="text-[11px] text-surface-500">Sin movimientos.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-surface-800 text-[11px]">
            {detail.events.map((e) => (
              <li key={e.id} className="py-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="text-surface-400">{new Date(e.createdAt).toLocaleString("es-AR")}</span>
                <span className="text-white">{EVENT_LABELS[e.type] ?? e.type}</span>
                {e.fromPlan && e.toPlan && e.fromPlan !== e.toPlan && (
                  <span className="text-surface-300">
                    {PLAN_CATALOG[e.fromPlan].shortLabel} → {PLAN_CATALOG[e.toPlan].shortLabel}
                  </span>
                )}
                {e.actor && <span className="text-surface-500">{e.actor}</span>}
                {eventDetails(e.data).map(([label, value]) => (
                  <span key={label} className="basis-full text-surface-300 whitespace-pre-wrap break-words">
                    <span className="text-surface-500">{label}:</span> {value}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
        {detail.reminders.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-surface-300 mt-3 mb-1">Recordatorios enviados</p>
            <ul className="flex flex-col divide-y divide-surface-800 text-[11px]">
              {detail.reminders.map((r) => (
                <li key={r.id} className="py-1.5 flex flex-wrap gap-x-3">
                  <span className="text-surface-400">{fmtDate(r.sentAt)}</span>
                  <span className="text-surface-200">{REMINDER_LABELS[r.kind] ?? r.kind}</span>
                  <span className="text-surface-500">{r.channel}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Fold>

      <Fold title="Notas internas">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputCls} w-full`} />
        <button
          type="button"
          disabled={busy || notes === (detail.notes ?? "")}
          onClick={() => onSaveNotes(notes.trim() || null)}
          className={`${btnCls} mt-2`}
        >
          Guardar notas
        </button>
      </Fold>
    </div>
  );
}
