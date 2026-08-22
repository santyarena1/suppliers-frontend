"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CheckoutSubmit } from "@/components/checkout/CheckoutForm";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { providerOrdersHref } from "@/lib/providerOrders";

export type OrderConfirmLine = { label: string; value: string };
export type OrderConfirmItem = { name: string; qty: number };
export type OrderConfirmResult = {
  message: string;
  refs?: string[];
  status?: string;
};

export default function OrderConfirmModal({
  open,
  provider,
  title,
  warning,
  items,
  lines,
  confirmLabel,
  loading,
  error,
  result,
  background = true,
  onBackgroundChange,
  onCancel,
  onConfirm,
  onDone,
  onLeaveInBackground,
}: {
  open: boolean;
  provider: string;
  title: string;
  warning: string;
  items: OrderConfirmItem[];
  lines: OrderConfirmLine[];
  confirmLabel: string;
  loading: boolean;
  error: string | null;
  result: OrderConfirmResult | null;
  background?: boolean;
  onBackgroundChange?: (next: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onDone: () => void;
  onLeaveInBackground?: () => void;
}) {
  const pending = result?.status === "PENDING";
  const done = Boolean(result) && !pending;
  const blocking = loading && !result;
  const canLeave = Boolean(onLeaveInBackground) && (loading || pending);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (canLeave) onLeaveInBackground?.();
      else if (!blocking) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, blocking, canLeave, onCancel, onLeaveInBackground]);

  if (!open) return null;

  const extra = items.length > 6 ? items.length - 6 : 0;
  const shown = extra > 0 ? items.slice(0, 6) : items;
  const historyHref = providerOrdersHref(provider);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/70"
        onClick={() => {
          if (canLeave) onLeaveInBackground?.();
          else if (!blocking) (result ? onDone() : onCancel());
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-confirm-title"
        className="relative w-full max-w-md bg-surface-950 border border-surface-800 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="px-5 py-4 border-b border-surface-800 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-surface-500">
              {provider.replace(/_/g, " ")}
            </p>
            <h2 id="order-confirm-title" className="text-base font-semibold text-white mt-1 tracking-tight">
              {done ? "Pedido creado" : loading || pending ? "Creando pedido" : title}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              if (canLeave) onLeaveInBackground?.();
              else if (!blocking) (result ? onDone() : onCancel());
            }}
            className="text-surface-500 hover:text-white p-1 -mr-1"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {done ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-start gap-2 text-sm text-emerald-400">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{result?.message}</span>
              </p>
              {result?.refs && result.refs.length > 0 && (
                <p className="text-xs font-mono text-surface-500 space-y-0.5">
                  {result.refs.map((r) => (
                    <span key={r} className="block">{r}</span>
                  ))}
                </p>
              )}
            </div>
          ) : loading || pending ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-start gap-2 text-sm text-surface-200">
                <Loader2 className="w-4 h-4 mt-0.5 flex-shrink-0 animate-spin" />
                <span>{result?.message || "Creando el pedido. Esto puede tardar."}</span>
              </p>
              <p className="text-[12px] text-surface-500 leading-relaxed">
                Podés dejarlo en segundo plano y seguir usando Nodo. El resultado aparece arriba del carrito y en el historial.
              </p>
            </div>
          ) : (
            <>
              <ul className="text-sm text-surface-200 space-y-1.5 max-h-40 overflow-y-auto">
                {shown.map((it, i) => (
                  <li key={`${it.name}-${i}`} className="flex justify-between gap-3">
                    <span className="truncate">{it.name}</span>
                    <span className="tabular-nums text-surface-500 flex-shrink-0">×{it.qty}</span>
                  </li>
                ))}
                {extra > 0 && (
                  <li className="text-xs text-surface-500">+{extra} línea{extra === 1 ? "" : "s"} más</li>
                )}
              </ul>

              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm border-t border-surface-800 pt-3">
                {lines.map((row) => (
                  <div key={row.label} className="contents">
                    <dt className="text-surface-500">{row.label}</dt>
                    <dd className="text-right text-surface-200 truncate">{row.value}</dd>
                  </div>
                ))}
              </dl>

              <p className="text-[12px] text-surface-500 leading-relaxed">{warning}</p>
              {onBackgroundChange && (
                <label className="flex items-start gap-2 text-[12px] text-surface-300 leading-snug cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-white"
                    checked={background}
                    onChange={(e) => onBackgroundChange(e.target.checked)}
                  />
                  <span>Dejarlo cargando en segundo plano. El pedido tarda; podés seguir usando Nodo y el resultado aparece arriba del carrito y en el historial.</span>
                </label>
              )}
              {error && <p className="text-sm text-red-400 leading-snug">{error}</p>}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-surface-800 flex gap-2">
          {done ? (
            <>
              <button
                type="button"
                onClick={onDone}
                className="flex-1 h-10 border border-surface-700 text-surface-300 hover:text-white rounded-sm text-sm"
              >
                Seguir en el carrito
              </button>
              <Link
                href={historyHref}
                onClick={onDone}
                className="flex-1 h-10 inline-flex items-center justify-center bg-white text-black hover:bg-surface-100 rounded-sm text-sm font-semibold"
              >
                Ver historial
              </Link>
            </>
          ) : pending || loading ? (
            <>
              {onLeaveInBackground && (
                <button
                  type="button"
                  onClick={onLeaveInBackground}
                  className="flex-1 h-10 border border-surface-700 text-white hover:bg-surface-900 rounded-sm text-sm"
                >
                  Dejar en segundo plano
                </button>
              )}
              <Link
                href={historyHref}
                onClick={onLeaveInBackground}
                className="flex-1 h-10 inline-flex items-center justify-center bg-white text-black hover:bg-surface-100 rounded-sm text-sm font-semibold"
              >
                Ver historial
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 h-10 border border-surface-700 text-surface-300 hover:text-white rounded-sm text-sm"
              >
                Cancelar
              </button>
              <CheckoutSubmit className="flex-1" onClick={onConfirm} disabled={blocking} loading={loading}>
                {confirmLabel}
              </CheckoutSubmit>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
