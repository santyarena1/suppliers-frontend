"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  PAYMENT_OPTION_KIND_LABELS,
  PAYMENT_OPTION_KINDS,
  paymentOptionId,
  type PaymentOption,
  type PaymentOptionKind,
} from "@/lib/payment-options";

const INPUT =
  "w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500";

/**
 * Formas de pago del distribuidor con su descuento o recargo.
 *
 * Se muestran junto al precio para decidir la compra y nada más: NODO no elige
 * la forma de pago ni la manda al confirmar el carrito, igual que pasa con el
 * precio de esquema y el de offline.
 *
 * Las que el portal informa al cotizar entran solas y quedan marcadas; el resto
 * no pasa por ninguna consulta, así que se cargan a mano.
 */
export default function PaymentOptionsEditor({
  options,
  onChange,
}: {
  options: PaymentOption[];
  onChange: (next: PaymentOption[]) => void;
}) {
  function update(i: number, cambios: Partial<PaymentOption>) {
    onChange(options.map((o, j) => (j === i ? { ...o, ...cambios } : o)));
  }

  function rename(i: number, label: string) {
    // El id sigue al nombre solo mientras la fila la maneja el comercio: si lo
    // trajo el portal, cambiarlo rompería el reencuentro con la próxima
    // cotización.
    const cambios: Partial<PaymentOption> =
      options[i].source === "manual" ? { label, id: paymentOptionId(label) } : { label };
    update(i, cambios);
  }

  function add() {
    onChange([
      ...options,
      { id: `nueva-${options.length + 1}`, label: "", percent: 0, kind: "DISCOUNT", source: "manual" },
    ]);
  }

  return (
    <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
      <div>
        <div className="text-sm font-semibold text-white">Formas de pago</div>
        <p className="text-xs text-surface-500 mt-1 leading-relaxed">
          Descuentos y recargos según cómo se pague. Se muestran como otra opción de precio en
          la búsqueda y en la ficha del producto. Son solo informativos: NODO no elige la forma
          de pago ni la manda al confirmar el carrito. Las que informa el portal al cotizar se
          cargan solas; el resto las agregás vos.
        </p>
      </div>

      {options.length === 0 ? (
        <p className="text-xs text-surface-500">
          Todavía no hay ninguna cargada para este distribuidor.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {options.map((option, i) => (
            <div key={`${option.id}-${i}`} className="flex items-center gap-2">
              <input
                value={option.label}
                onChange={(e) => rename(i, e.target.value)}
                placeholder="Transferencia, 3 cuotas, efectivo…"
                maxLength={60}
                className={`${INPUT} flex-1 min-w-0`}
              />
              <select
                value={option.kind}
                onChange={(e) => update(i, { kind: e.target.value as PaymentOptionKind })}
                className={`${INPUT} w-32 flex-shrink-0`}
              >
                {PAYMENT_OPTION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PAYMENT_OPTION_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1 flex-shrink-0">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={option.percent}
                  onChange={(e) => update(i, { percent: Number(e.target.value) || 0 })}
                  className={`${INPUT} w-20 text-right tabular-nums`}
                />
                <span className="text-xs text-surface-500">%</span>
              </div>
              <span
                className={`text-[10px] w-16 flex-shrink-0 text-center ${
                  option.source === "cart" ? "text-emerald-400/90" : "text-surface-600"
                }`}
              >
                {option.source === "cart" ? "del portal" : "manual"}
              </span>
              <button
                type="button"
                onClick={() => onChange(options.filter((_, j) => j !== i))}
                aria-label={`Quitar ${option.label || "forma de pago"}`}
                className="flex-shrink-0 p-2 rounded-lg text-surface-500 hover:text-rose-300 hover:bg-surface-800 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={add}
        className="self-start inline-flex items-center gap-1.5 text-xs text-brand-300 hover:text-brand-200 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Agregar forma de pago
      </button>
    </div>
  );
}
