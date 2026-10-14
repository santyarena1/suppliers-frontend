"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Loader2, Store, XCircle } from "lucide-react";
import { storefrontApi, type TenantOrder } from "@/lib/api";
import { providerLabel } from "@/components/ProviderBadge";

/** Estado de un pedido a la tienda de otro comercio, en Pedidos del comprador. */
export default function StorefrontPurchaseStatus({
  order,
  onUpdated,
  onAviso,
}: {
  order: TenantOrder;
  onUpdated: () => Promise<void>;
  onAviso: (v: { ok: boolean; text: string } | null) => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const name = providerLabel(order.provider);
  const status = order.storefrontStatus;

  async function cancel() {
    setCancelling(true);
    onAviso(null);
    try {
      await storefrontApi.cancelPurchase(order.id);
      onAviso({ ok: true, text: `Cancelaste el pedido a ${name}.` });
      await onUpdated();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      onAviso({ ok: false, text: msg || "No se pudo cancelar el pedido" });
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  }

  const tone =
    status === "CONFIRMED"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : status === "REJECTED" || status === "CANCELLED"
        ? "border-surface-700 bg-surface-950/40"
        : "border-sky-500/30 bg-sky-500/5";

  return (
    <div className={`flex flex-col gap-2 rounded-xl border px-3.5 py-3 ${tone}`}>
      <div className="flex items-start gap-2.5">
        {status === "CONFIRMED" ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" aria-hidden />
        ) : status === "PENDING" ? (
          <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-300" aria-hidden />
        ) : status === "REJECTED" ? (
          <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-300" aria-hidden />
        ) : (
          <Store className="mt-0.5 h-4 w-4 flex-shrink-0 text-surface-400" aria-hidden />
        )}
        <div className="min-w-0 text-xs leading-relaxed">
          <p className="font-semibold text-white">
            {status === "CONFIRMED" && `${name} confirmó el pedido`}
            {status === "PENDING" && `Esperando que ${name} lo confirme`}
            {status === "REJECTED" && `${name} rechazó el pedido`}
            {status === "CANCELLED" && "Cancelaste este pedido"}
          </p>
          <p className="text-surface-400">
            {status === "CONFIRMED" && "Coordiná la entrega y el pago directo con el local."}
            {status === "PENDING" && "Te avisamos cuando responda. Mientras tanto lo podés cancelar."}
            {status === "REJECTED" && (order.storefrontNote ? `Motivo: ${order.storefrontNote}` : "No dejó motivo.")}
            {status === "CANCELLED" && "La tienda ya no lo ve como pendiente."}
          </p>
          {status === "CONFIRMED" && order.storefrontNote && <p className="mt-1 text-surface-300">Nota: {order.storefrontNote}</p>}
        </div>
      </div>
      {status === "PENDING" &&
        (confirmCancel ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-surface-300">¿Cancelar el pedido?</span>
            <button
              type="button"
              onClick={() => void cancel()}
              disabled={cancelling}
              className="h-8 px-3 rounded-lg bg-red-600/80 hover:bg-red-600 disabled:opacity-40 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              {cancelling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Sí, cancelar
            </button>
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="h-8 px-3 rounded-lg border border-surface-700 text-surface-200 hover:text-white text-xs"
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="self-start h-8 px-3 rounded-lg border border-surface-700 text-surface-300 hover:text-white text-xs"
          >
            Cancelar pedido
          </button>
        ))}
    </div>
  );
}
