/**
 * Precios de pedido offline y compra en esquema.
 *
 * Partimos del costo neto (sin impuestos) y de la alícuota de IVA del producto.
 * Internos e IIBB no se tocan. El descuento de esquema se aplica sobre el neto
 * y después se recalcula el IVA.
 *
 * Alícuota: 21 = 21%. No inventamos 21% si el producto no trajo IVA.
 */

export const IVA_ADJUSTMENTS = ["REMOVE", "HALF", "FLAT_10_5"] as const;
export type IvaAdjustment = (typeof IVA_ADJUSTMENTS)[number];

export const IVA_ADJUSTMENT_LABELS: Record<IvaAdjustment, string> = {
  REMOVE: "Descontar el IVA completo",
  HALF: "Dejar la mitad del IVA de cada producto",
  FLAT_10_5: "Normalizar todos los IVA a 10,5%",
};

export type PurchasePolicy = {
  acceptsOffline: boolean;
  acceptsScheme: boolean;
  ivaAdjustment: IvaAdjustment | null;
  schemeDiscountPercent: number | null;
};

export const EMPTY_PURCHASE_POLICY: PurchasePolicy = {
  acceptsOffline: false,
  acceptsScheme: false,
  ivaAdjustment: null,
  schemeDiscountPercent: null,
};

export type PurchasePriceInput = {
  net: number;
  /** Alícuota en puntos (21 = 21%). `null` = el producto no trajo IVA. */
  ivaPercent: number | null;
  internosAmount?: number;
  iibbAmount?: number;
  otherAmount?: number;
  ivaAdjustment: IvaAdjustment;
  /** Solo esquema. 8 = 8% sobre el neto. */
  schemeDiscountPercent?: number | null;
};

export type PurchasePriceResult = {
  net: number;
  ivaPercent: number | null;
  ivaAmount: number | null;
  internosAmount: number;
  iibbAmount: number;
  otherAmount: number;
  gross: number;
  /** true cuando el modo necesita la alícuota original y el producto no la trae. */
  missingIva: boolean;
  schemeDiscountPercent: number;
};

const FLAT_IVA = 10.5;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function asMoney(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n) || n < 0) return 0;
  return round4(n);
}

/** Normaliza 0.21 / 21 a puntos (21). `null` si no hay dato usable. */
export function ivaPoints(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw < 0) return null;
  if (raw === 0) return 0;
  if (raw <= 1) return round4(raw * 100);
  if (raw <= 100) return round4(raw);
  return null;
}

/**
 * Alícuota resultante. `HALF` sin alícuota original no se puede calcular.
 * `REMOVE` y `FLAT_10_5` no necesitan el IVA original.
 */
export function adjustedIvaPoints(
  originalPoints: number | null,
  mode: IvaAdjustment
): { points: number | null; missingIva: boolean } {
  if (mode === "REMOVE") return { points: 0, missingIva: false };
  if (mode === "FLAT_10_5") return { points: FLAT_IVA, missingIva: false };
  if (originalPoints == null) return { points: null, missingIva: true };
  return { points: round4(originalPoints / 2), missingIva: false };
}

export function applySchemeDiscount(net: number, percent: number | null | undefined): number {
  const p = percent == null || !Number.isFinite(percent) ? 0 : Math.min(100, Math.max(0, percent));
  if (p === 0) return round4(net);
  return round4(net * (1 - p / 100));
}

export function computePurchaseUnit(input: PurchasePriceInput): PurchasePriceResult {
  const schemeDiscountPercent =
    input.schemeDiscountPercent == null || !Number.isFinite(input.schemeDiscountPercent)
      ? 0
      : Math.min(100, Math.max(0, input.schemeDiscountPercent));
  const net = applySchemeDiscount(asMoney(input.net), schemeDiscountPercent);
  const original = ivaPoints(input.ivaPercent);
  const { points, missingIva } = adjustedIvaPoints(original, input.ivaAdjustment);
  const ivaAmount = points == null ? null : round4(net * (points / 100));
  const internosAmount = asMoney(input.internosAmount);
  const iibbAmount = asMoney(input.iibbAmount);
  const otherAmount = asMoney(input.otherAmount);
  const ivaForGross = ivaAmount ?? 0;
  const gross = round4(net + ivaForGross + internosAmount + iibbAmount + otherAmount);

  return {
    net,
    ivaPercent: points,
    ivaAmount,
    internosAmount,
    iibbAmount,
    otherAmount,
    gross,
    missingIva,
    schemeDiscountPercent,
  };
}

export function isIvaAdjustment(value: unknown): value is IvaAdjustment {
  return typeof value === "string" && (IVA_ADJUSTMENTS as readonly string[]).includes(value);
}

export function parsePurchasePolicy(raw: {
  acceptsOffline?: boolean | null;
  acceptsScheme?: boolean | null;
  ivaAdjustment?: string | null;
  schemeDiscountPercent?: number | string | null;
}): PurchasePolicy {
  const schemeRaw = raw.schemeDiscountPercent;
  const schemeNum =
    schemeRaw == null || schemeRaw === ""
      ? null
      : Number(schemeRaw);
  return {
    acceptsOffline: Boolean(raw.acceptsOffline),
    acceptsScheme: Boolean(raw.acceptsScheme),
    ivaAdjustment: isIvaAdjustment(raw.ivaAdjustment) ? raw.ivaAdjustment : null,
    schemeDiscountPercent:
      schemeNum == null || !Number.isFinite(schemeNum) ? null : schemeNum,
  };
}
