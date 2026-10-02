"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { adminSubscriptionsApi } from "@/lib/api";
import { PLAN_CATALOG, formatUsd, type AdminSubscriptionDetail } from "@/lib/plans";
import SubscriptionActions from "./SubscriptionActions";
import SubscriptionRecords from "./SubscriptionRecords";
import { StatusPill, errMsg, fmtDate, type ShowToast } from "./shared";

/** Resumen de solo lectura: lo que hace falta saber antes de tocar algo. */
function Summary({ detail }: { detail: AdminSubscriptionDetail }) {
  const items: [string, string][] = [
    ["Plan", `${detail.planLabel} · ${formatUsd(detail.price)}/mes${detail.priceOverridden ? " (pactado)" : ""}`],
    [detail.status === "TRIAL" ? "Prueba hasta" : "Próximo cobro", fmtDate(detail.status === "TRIAL" ? detail.trialEndsAt : detail.nextBillingAt ?? detail.dueAt)],
    ["Vence / suspende", `${fmtDate(detail.dueAt)} / ${fmtDate(detail.suspendsAt)}`],
    [
      "Cortesía",
      detail.courtesy.active ? (detail.courtesy.until ? `Hasta ${fmtDate(detail.courtesy.until)}` : "Sin vencimiento") : "No",
    ],
    [
      "Distribuidores",
      `${detail.usage.connectedProviders} conectados · ${detail.usage.activeSearchProviders}${
        detail.usage.maxSearchProviders !== null ? `/${detail.usage.maxSearchProviders}` : ""
      } en búsqueda`,
    ],
  ];
  if (detail.setupFee.status !== "NOT_APPLICABLE") items.push(["Puesta en marcha", detail.setupFee.statusLabel]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-surface-900 px-3 py-3 text-[11px]">
      {items.map(([label, value]) => (
        <p key={label} className="flex justify-between gap-3 sm:block">
          <span className="text-surface-500 sm:block">{label}</span>
          <span className="text-surface-100 text-right sm:text-left">{value}</span>
        </p>
      ))}
    </div>
  );
}

export default function SubscriptionDetailDialog({
  tenantId,
  showToast,
  onClose,
  onChanged,
}: {
  tenantId: string;
  showToast: ShowToast;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AdminSubscriptionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const apply = useCallback((d: AdminSubscriptionDetail) => {
    setDetail(d);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    adminSubscriptionsApi
      .detail(tenantId)
      .then((r) => apply(r.data))
      .catch(() => {
        showToast("No se pudo abrir la suscripción", false);
        onClose();
      });
  }, [tenantId, apply, showToast, onClose]);

  const run = useCallback(
    async (action: () => Promise<{ data: AdminSubscriptionDetail }>, ok: string): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await action();
        apply(res.data);
        showToast(ok);
        onChanged();
        return true;
      } catch (err) {
        showToast(errMsg(err, "No se pudo guardar el cambio"), false);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [apply, showToast, onChanged]
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-surface-950 border-l border-surface-800 p-4 sm:p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-white truncate">{detail?.tenantName ?? "Suscripción"}</p>
            {detail && (
              <p className="text-xs text-surface-400 mt-1 flex flex-wrap items-center gap-2">
                <StatusPill row={detail} />
                {!detail.tenantActive && <span className="text-red-300">Organización desactivada</span>}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-surface-400 hover:text-white" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!detail ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          </div>
        ) : (
          <>
            <Summary detail={detail} />

            {detail.pendingRequest && (
              <p className="text-xs rounded-md px-3 py-2 bg-amber-500/10 text-amber-200">
                El comercio pidió pasar a {detail.pendingRequest.plan ? PLAN_CATALOG[detail.pendingRequest.plan].label : "otro plan"} el{" "}
                {fmtDate(detail.pendingRequest.at)}
                {detail.pendingRequest.message ? `: “${detail.pendingRequest.message}”` : "."}
              </p>
            )}

            <SubscriptionActions detail={detail} tenantId={tenantId} busy={busy} run={run} version={version} />

            <SubscriptionRecords
              detail={detail}
              busy={busy}
              onSaveNotes={(notes) => void run(() => adminSubscriptionsApi.setNotes(tenantId, notes), "Notas guardadas")}
            />
          </>
        )}
      </div>
    </div>
  );
}
