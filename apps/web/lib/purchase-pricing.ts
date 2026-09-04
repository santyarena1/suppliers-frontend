/**
 * Precios de pedido offline y compra en esquema.
 * Misma lógica que `packages/shared/src/purchase-pricing.ts` (tests en la API).
 *
 * Partimos del costo neto (sin impuestos) y de la alícuota de IVA del producto.
 * El descuento extra es solo de esquema. Offline no aplica percepciones (IIBB);
 * los internos sí quedan. Sin alícuota de IVA no se inventa nada.
 */

export const IVA_ADJUSTMENTS = ["REMOVE", "HALF", "FLAT_10_5"] as const;
export type IvaAdjustment = (typeof IVA_ADJUSTMENTS)[number];

export const IVA_ADJUSTMENT_LABELS: Record<IvaAdjustment, string> = {
  REMOVE: "Descontar el IVA completo",
  HALF: "Dejar la mitad del IVA de cada producto",
  FLAT_10_5: "Normalizar todos los IVA a 10,5%",
};

/** Proveedores cuyo catálogo trae alícuota de IVA. El resto no puede usar offline/esquema. */
export const PROVIDERS_WITH_IVA_RATE = [
  "NEW_BYTES",
  "ELIT",
  "GRUPO_NUCLEO",
  "AIR",
  "INVID",
  "DIAPSTORE",
] as const;

export type PriceChannel = "API" | "LIST";

/**
 * Si conocemos la alícuota de IVA de cada producto de este proveedor, que es lo
 * que hace posible el pedido offline y el esquema. La conocemos cuando el
 * proveedor la informa por API, o cuando los precios salen de una lista
 * (proveedor por lista, o proveedor con API al que el comercio le carga su
 * propio Excel): la lista trae la alícuota por fila o por perfil.
 */
export function providerHasIvaRate(provider: string, priceChannel?: PriceChannel | string | null): boolean {
  if ((PROVIDERS_WITH_IVA_RATE as readonly string[]).includes(provider)) return true;
  if (provider.startsWith("LIST_")) return true;
  return priceChannel === "LIST";
}

/** Los precios de este proveedor, para este comercio, salen de una planilla. */
export function providerPricesFromList(provider: string, priceChannel?: PriceChannel | string | null): boolean {
  return provider.startsWith("LIST_") || priceChannel === "LIST";
}

export type PurchasePolicy = {
  /** API o LIST. Con LIST el carrito solo genera un mensaje para el vendedor. */
  priceChannel?: PriceChannel | null;
  /** IIBB manual (%) sobre el neto, para proveedores que cotizan por lista. */
  manualIibbPercent?: number | null;
  /** Otras percepciones manuales (%) sobre el neto, para proveedores que cotizan por lista. */
  manualPerceptionsPercent?: number | null;
  acceptsOffline: boolean;
  acceptsScheme: boolean;
  offlineIvaAdjustment: IvaAdjustment | null;
  schemeIvaAdjustment: IvaAdjustment | null;
  schemeDiscountPercent: number | null;
};

export const EMPTY_PURCHASE_POLICY: PurchasePolicy = {
  acceptsOffline: false,
  acceptsScheme: false,
  offlineIvaAdjustment: null,
  schemeIvaAdjustment: null,
  schemeDiscountPercent: null,
};

export type PurchasePriceInput = {
  net: number;
  ivaPercent: number | null;
  internosAmount?: number;
  iibbAmount?: number;
  /**
   * Alícuota de percepción en puntos (3 = 3%). Si viene, se aplica sobre el neto
   * ya descontado (lista o esquema). Gana sobre `iibbAmount`.
   */
  iibbPercent?: number | null;
  otherAmount?: number;
  ivaAdjustment: IvaAdjustment;
  schemeDiscountPercent?: number | null;
  dropPerceptions?: boolean;
};

export type PurchasePriceResult = {
  net: number;
  ivaPercent: number | null;
  ivaAmount: number | null;
  internosAmount: number;
  iibbAmount: number;
  otherAmount: number;
  gross: number;
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

export function ivaPoints(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw < 0) return null;
  if (raw === 0) return 0;
  if (raw <= 1) return round4(raw * 100);
  if (raw <= 100) return round4(raw);
  return null;
}

export function adjustedIvaPoints(
  originalPoints: number | null,
  mode: IvaAdjustment
): { points: number | null; missingIva: boolean } {
  if (originalPoints == null) return { points: null, missingIva: true };
  if (mode === "REMOVE") return { points: 0, missingIva: false };
  if (mode === "FLAT_10_5") return { points: FLAT_IVA, missingIva: false };
  return { points: round4(originalPoints / 2), missingIva: false };
}

export function applySchemeDiscount(net: number, percent: number | null | undefined): number {
  const p = percent == null || !Number.isFinite(percent) ? 0 : Math.min(100, Math.max(0, percent));
  if (p === 0) return round4(net);
  return round4(net * (1 - p / 100));
}

function perceptionOnNet(
  originalNet: number,
  discountedNet: number,
  percent: number | null | undefined,
  amount: number | null | undefined,
  drop: boolean | undefined
): number {
  if (drop) return 0;
  if (percent != null && Number.isFinite(percent)) {
    if (percent <= 0 || percent > 100) return 0;
    return round4(discountedNet * (percent / 100));
  }
  const amt = asMoney(amount);
  if (amt <= 0) return 0;
  if (originalNet > 0 && discountedNet !== originalNet) {
    return round4(amt * (discountedNet / originalNet));
  }
  return amt;
}

export function computePurchaseUnit(input: PurchasePriceInput): PurchasePriceResult {
  const schemeDiscountPercent =
    input.schemeDiscountPercent == null || !Number.isFinite(input.schemeDiscountPercent)
      ? 0
      : Math.min(100, Math.max(0, input.schemeDiscountPercent));
  const originalNet = asMoney(input.net);
  const net = applySchemeDiscount(originalNet, schemeDiscountPercent);
  const original = ivaPoints(input.ivaPercent);
  const { points, missingIva } = adjustedIvaPoints(original, input.ivaAdjustment);
  const ivaAmount = points == null ? null : round4(net * (points / 100));
  const internosAmount = asMoney(input.internosAmount);
  const iibbAmount = perceptionOnNet(
    originalNet,
    net,
    input.iibbPercent,
    input.iibbAmount,
    input.dropPerceptions
  );
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

function asAdj(value: unknown): IvaAdjustment | null {
  return isIvaAdjustment(value) ? value : null;
}

export function parsePurchasePolicy(raw: {
  priceChannel?: string | null;
  manualIibbPercent?: number | string | null;
  manualPerceptionsPercent?: number | string | null;
  acceptsOffline?: boolean | null;
  acceptsScheme?: boolean | null;
  offlineIvaAdjustment?: string | null;
  schemeIvaAdjustment?: string | null;
  ivaAdjustment?: string | null;
  schemeDiscountPercent?: number | string | null;
} | null | undefined): PurchasePolicy {
  if (!raw) return { ...EMPTY_PURCHASE_POLICY };
  const legacy = asAdj(raw.ivaAdjustment);
  const schemeRaw = raw.schemeDiscountPercent;
  const schemeNum = schemeRaw == null || schemeRaw === "" ? null : Number(schemeRaw);
  const pct = (v: unknown) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    priceChannel: raw.priceChannel === "LIST" ? "LIST" : raw.priceChannel === "API" ? "API" : null,
    manualIibbPercent: pct(raw.manualIibbPercent),
    manualPerceptionsPercent: pct(raw.manualPerceptionsPercent),
    acceptsOffline: Boolean(raw.acceptsOffline),
    acceptsScheme: Boolean(raw.acceptsScheme),
    offlineIvaAdjustment: asAdj(raw.offlineIvaAdjustment) ?? legacy,
    schemeIvaAdjustment: asAdj(raw.schemeIvaAdjustment) ?? legacy,
    schemeDiscountPercent: schemeNum == null || !Number.isFinite(schemeNum) ? null : schemeNum,
  };
}
