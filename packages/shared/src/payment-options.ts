/**
 * Formas de pago de un distribuidor, con el descuento o el recargo que aplican.
 *
 * Son **solo informativas**: NODO no elige la forma de pago ni la manda al
 * confirmar el carrito. Sirven para decidir la compra, igual que el precio de
 * esquema o el de offline, que también se muestran al lado del precio de lista
 * sin que el sistema opere con ellos.
 *
 * Algunas se aprenden del portal cuando el carrito cotiza (New Bytes informa el
 * interés de cada medio de pago); el resto no pasa por ninguna consulta, así que
 * el comercio las carga a mano en la configuración del proveedor.
 */

export const PAYMENT_OPTION_KINDS = ["DISCOUNT", "SURCHARGE"] as const;
export type PaymentOptionKind = (typeof PAYMENT_OPTION_KINDS)[number];

export interface PaymentOption {
  /** Estable, para poder editar y borrar sin depender del nombre. */
  id: string;
  /** Cómo la llama el proveedor: "Transferencia", "3 cuotas", "Efectivo". */
  label: string;
  /** Puntos porcentuales sobre el precio final, siempre positivo. */
  percent: number;
  kind: PaymentOptionKind;
  /** `cart` la trajo el portal; `manual` la cargó el comercio. */
  source: "cart" | "manual";
  at?: string | null;
}

export function isPaymentOptionKind(value: unknown): value is PaymentOptionKind {
  return value === "DISCOUNT" || value === "SURCHARGE";
}

/** El precio con esta forma de pago. Un recargo sube, un descuento baja. */
export function applyPaymentOption(price: number, option: Pick<PaymentOption, "percent" | "kind">): number {
  if (!Number.isFinite(price)) return price;
  const factor = option.kind === "SURCHARGE" ? 1 + option.percent / 100 : 1 - option.percent / 100;
  return price * factor;
}

/**
 * Normaliza lo que venga de la base o del cliente.
 *
 * La columna es JSON y la escriben dos caminos distintos (la pantalla de
 * configuración y lo aprendido del carrito), así que nada de lo que sale de ahí
 * se da por bueno sin revisar.
 */
export function parsePaymentOptions(raw: unknown): PaymentOption[] {
  if (!Array.isArray(raw)) return [];
  const out: PaymentOption[] = [];
  const vistos = new Set<string>();
  for (const item of raw) {
    const option = parsePaymentOption(item);
    if (!option || vistos.has(option.id)) continue;
    vistos.add(option.id);
    out.push(option);
    if (out.length >= 20) break;
  }
  return out;
}

function parsePaymentOption(raw: unknown): PaymentOption | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const label = typeof rec.label === "string" ? rec.label.trim().slice(0, 60) : "";
  if (!label) return null;
  const percent = Number(rec.percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  const kind = isPaymentOptionKind(rec.kind) ? rec.kind : "DISCOUNT";
  const id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim().slice(0, 60) : paymentOptionId(label);
  return {
    id,
    label,
    percent: Math.round(percent * 100) / 100,
    kind,
    source: rec.source === "cart" ? "cart" : "manual",
    at: typeof rec.at === "string" ? rec.at : null,
  };
}

/** Id derivado del nombre: lo aprendido del portal vuelve a caer en la misma fila. */
export function paymentOptionId(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "opcion";
}

/**
 * Mezcla lo que acaba de cotizar el portal con lo que ya había.
 *
 * Lo cargado a mano no se toca: si el comercio escribió un recargo distinto del
 * que informa el portal, es porque sabe algo que el portal no dice.
 */
export function mergeLearnedPaymentOptions(
  existing: PaymentOption[],
  learned: PaymentOption[]
): PaymentOption[] {
  const out = [...existing];
  for (const option of learned) {
    const i = out.findIndex((o) => o.id === option.id);
    if (i < 0) {
      out.push(option);
      continue;
    }
    if (out[i].source === "manual") continue;
    out[i] = { ...out[i], percent: option.percent, kind: option.kind, at: option.at };
  }
  return out.slice(0, 20);
}
