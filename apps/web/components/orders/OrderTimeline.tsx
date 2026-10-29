"use client";

import { Check, FileText, Truck, XCircle } from "lucide-react";
import type { OrderTracking, TrackingStage } from "@/lib/api";

export const STAGES: { key: Exclude<TrackingStage, "CANCELLED">; label: string }[] = [
  { key: "SENT", label: "Enviado" },
  { key: "CONFIRMED", label: "Confirmado" },
  { key: "INVOICED", label: "Facturado" },
  { key: "SHIPPED", label: "Despachado" },
  { key: "DELIVERED", label: "Entregado" },
];

export const STAGE_LABEL: Record<TrackingStage, string> = {
  SENT: "Enviado",
  CONFIRMED: "Confirmado",
  INVOICED: "Facturado",
  SHIPPED: "Despachado",
  DELIVERED: "Entregado",
  CANCELLED: "Anulado",
};

/** Un pedido creado sin seguimiento todavía cuenta como enviado. */
export function currentStage(tracking: OrderTracking | undefined): TrackingStage {
  return tracking?.stage ?? "SENT";
}

function hace(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "recién";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `hace ${h} h` : new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

/**
 * Línea de estados de un pedido al distribuidor: Enviado → Confirmado → Facturado →
 * Despachado → Entregado, con la factura y el seguimiento del envío cuando el portal
 * los informa. La etapa la actualiza el backend leyendo el portal cada 15 min.
 */
export default function OrderTimeline({ tracking, providerName }: { tracking?: OrderTracking; providerName: string }) {
  const stage = currentStage(tracking);
  const cancelled = stage === "CANCELLED";
  const reached = cancelled ? 0 : STAGES.findIndex((s) => s.key === stage);
  const when = new Map((tracking?.history ?? []).map((h) => [h.stage, h.at]));
  const checked = hace(tracking?.checkedAt ?? null);

  return (
    <div className="rounded-xl border border-surface-800 bg-surface-950/40 px-3.5 py-3">
      {cancelled ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-red-300">
          <XCircle className="h-4 w-4" aria-hidden /> {providerName} anuló el pedido
        </p>
      ) : (
        <ol className="flex items-center" aria-label="Estado del pedido">
          {STAGES.map((s, i) => {
            const done = i <= reached;
            const now = i === reached;
            const at = when.get(s.key);
            return (
              <li key={s.key} className={`flex items-center ${i > 0 ? "flex-1" : ""}`} aria-current={now ? "step" : undefined}>
                {i > 0 && <span className={`mx-1.5 sm:mx-2 h-0.5 flex-1 rounded ${done ? "bg-emerald-500" : "bg-surface-800"}`} />}
                <span className="flex flex-col items-center gap-1 sm:flex-row sm:gap-1.5" title={at ? new Date(at).toLocaleString("es-AR") : undefined}>
                  <span
                    className={`relative flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                      done ? "border-emerald-500 bg-emerald-500 text-emerald-950" : "border-surface-700 text-transparent"
                    }`}
                  >
                    {now && <span className="absolute inset-0 rounded-full bg-emerald-400/60 animate-ping motion-reduce:hidden" aria-hidden />}
                    <Check className="relative h-3 w-3" strokeWidth={3.5} aria-hidden />
                  </span>
                  <span className={`text-[10px] sm:text-xs whitespace-nowrap ${done ? "font-semibold text-surface-100" : "text-surface-500"}`}>
                    {s.label}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {(tracking?.invoice || tracking?.trackingNumber || tracking?.status) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tracking.invoice && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-surface-800 px-2.5 py-1 text-[11px] text-surface-200">
              <FileText className="h-3.5 w-3.5 text-surface-500" aria-hidden /> Factura {tracking.invoice}
            </span>
          )}
          {tracking.trackingNumber && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-surface-800 px-2.5 py-1 text-[11px] text-surface-200">
              <Truck className="h-3.5 w-3.5 text-surface-500" aria-hidden />
              {tracking.carrier ? `${tracking.carrier} · ` : ""}
              {tracking.trackingNumber}
            </span>
          )}
          {tracking.status && (
            <span className="inline-flex items-center rounded-lg border border-surface-800 px-2.5 py-1 text-[11px] text-surface-400">
              En {providerName}: «{tracking.status}»
            </span>
          )}
        </div>
      )}

      <p className="mt-2 text-[10px] text-surface-600">
        {tracking?.supported
          ? checked
            ? `NODO lo revisa en ${providerName} cada 15 min · última vez ${checked}`
            : `NODO lo revisa en ${providerName} cada 15 min y te avisa cuando avanza`
          : `${providerName} no publica el estado de sus pedidos: lo que pase después lo ves en su portal`}
      </p>
    </div>
  );
}
