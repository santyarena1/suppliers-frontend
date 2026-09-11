/**
 * Formas de pago de un distribuidor, con el descuento o el recargo que aplican.
 * Misma lógica que `packages/shared/src/payment-options.ts` (tests en la API).
 *
 * Son **solo informativas**: NODO no elige la forma de pago ni la manda al
 * confirmar el carrito. Se muestran al lado del precio para decidir la compra,
 * igual que el precio de esquema o el de offline.
 */

export const PAYMENT_OPTION_KINDS = ["DISCOUNT", "SURCHARGE"] as const;
export type PaymentOptionKind = (typeof PAYMENT_OPTION_KINDS)[number];

export interface PaymentOption {
  id: string;
  label: string;
  /** Puntos porcentuales sobre el precio final, siempre positivo. */
  percent: number;
  kind: PaymentOptionKind;
  /** `cart` la trajo el portal; `manual` la cargó el comercio. */
  source: "cart" | "manual";
  at?: string | null;
}

export const PAYMENT_OPTION_KIND_LABELS: Record<PaymentOptionKind, string> = {
  DISCOUNT: "Descuento",
  SURCHARGE: "Recargo",
};

/** El precio con esta forma de pago. Un recargo sube, un descuento baja. */
export function applyPaymentOption(
  price: number,
  option: Pick<PaymentOption, "percent" | "kind">
): number {
  if (!Number.isFinite(price)) return price;
  const factor = option.kind === "SURCHARGE" ? 1 + option.percent / 100 : 1 - option.percent / 100;
  return price * factor;
}

export function paymentOptionId(label: string): string {
  return (
    label
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "opcion"
  );
}

/** Las que mueven el precio. Un 0% no es una opción de precio, es un dato. */
export function pricedPaymentOptions(options: PaymentOption[] | undefined | null): PaymentOption[] {
  if (!options?.length) return [];
  return options.filter((o) => Number.isFinite(o.percent) && o.percent > 0);
}

/**
 * Guarda en el servidor las formas de pago que informó el portal.
 *
 * Solo llegan las que mueven el precio: un medio sin interés no es una opción
 * de precio. El interés que informa el portal es siempre un recargo; los
 * descuentos por pago no pasan por ninguna consulta, los carga el comercio.
 */
export function rememberPaymentOptions(
  provider: string,
  informadas: { label: string; interest?: number | null }[]
): void {
  const options: PaymentOption[] = [];
  for (const p of informadas) {
    const label = p.label?.trim();
    const percent = Number(p.interest);
    if (!label || !Number.isFinite(percent) || percent <= 0 || percent > 100) continue;
    options.push({
      id: paymentOptionId(label),
      label,
      percent: Math.round(percent * 100) / 100,
      kind: "SURCHARGE",
      source: "cart",
    });
  }
  if (options.length === 0) return;
  void import("@/lib/api").then(({ myApi, invalidateMyProviders }) =>
    myApi
      .recordObservedPaymentOptions(provider as never, options)
      .then(() => invalidateMyProviders())
      .catch(() => {
        /* sin conexión queda para la próxima cotización */
      })
  );
}
