"use client";

import { Loader2, Send, Store } from "lucide-react";

/**
 * Pestaña del carrito de la tienda de otro comercio (Vender en NODO): el pedido le
 * llega a la tienda por NODO y queda a confirmar. No hay mensaje que copiar.
 */
export default function StorefrontCartAction({
  name,
  sending,
  disabled,
  onSend,
}: {
  name: string;
  sending: boolean;
  disabled: boolean;
  onSend: () => void;
}) {
  return (
    <div className="cart-action flex flex-col gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300">
          <Store className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{name} es un local que vende en NODO</p>
          <p className="mt-0.5 text-xs leading-relaxed text-surface-400">
            El pedido le llega por NODO y lo tiene que confirmar. Cuando responda te avisamos, y el pago y la entrega
            los coordinan directo entre ustedes.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onSend}
        disabled={disabled}
        className="self-start flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg px-3 py-2"
      >
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        {sending ? "Enviando…" : `Enviar pedido a ${name}`}
      </button>
    </div>
  );
}
