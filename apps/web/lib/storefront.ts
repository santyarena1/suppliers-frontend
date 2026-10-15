import type { StorefrontHiddenReason, StorefrontOrderStatus, StorefrontStockState } from "@/lib/api";

/** Ayudantes de Vender en NODO (docs/PLAN_VENDER_EN_NODO.md). */

export function apiError(err: unknown, fallback: string): string {
  const fromApi = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message?.toString();
  if (fromApi) return fromApi;
  // Las subidas de archivos (fetch) tiran un Error con el mensaje del servidor.
  return err instanceof Error && err.message && !/^Request failed|Network Error/i.test(err.message) ? err.message : fallback;
}

/** Por qué la tienda no se ve, dicho para el dueño. */
export function hiddenReasonText(reason: StorefrontHiddenReason | null, suspendedReason?: string | null): string | null {
  switch (reason) {
    case "PAUSED":
      return "La pausaste: nadie la ve hasta que la reactives.";
    case "SUSPENDED":
      return `NODO frenó tu tienda${suspendedReason ? `: ${suspendedReason}` : ""}. Escribinos para revisarlo.`;
    case "CLOSED":
      return "La cerraste. Abrila de nuevo cuando quieras.";
    case "STOCK_EXPIRED":
      return "Venció el stock confirmado y elegiste que se oculte. Confirmalo y vuelve a aparecer.";
    case "NO_STOCK_CONFIRMED":
      return "Confirmá el stock para que aparezca en el buscador.";
    case "NO_PRODUCTS":
      return "Cargá productos (con una planilla o a mano) para empezar a vender.";
    case "OWNER_INACTIVE":
      return "Tu comercio está inactivo en NODO.";
    default:
      return null;
  }
}

export const ORDER_STATUS_LABEL: Record<StorefrontOrderStatus, string> = {
  PENDING: "Por confirmar",
  CONFIRMED: "Confirmado",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
};

export const ORDER_STATUS_TONE: Record<StorefrontOrderStatus, string> = {
  PENDING: "text-sky-200 bg-sky-500/10 border-sky-500/30",
  CONFIRMED: "text-emerald-200 bg-emerald-500/10 border-emerald-500/30",
  REJECTED: "text-red-200 bg-red-500/10 border-red-500/30",
  CANCELLED: "text-surface-300 bg-surface-800 border-surface-700",
};

/** "hace 3 h", "ayer", "hace 2 días". */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(min) || min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

/** "en 5 h", "mañana", "en 2 días"; `null` si ya pasó. */
export function untilText(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const min = Math.floor((new Date(iso).getTime() - Date.now()) / 60_000);
  if (!Number.isFinite(min) || min <= 0) return null;
  if (min < 60) return `en ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `en ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "mañana" : `en ${d} días`;
}

export function money(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const cur = currency === "ARS" ? "ARS" : "USD";
  const n = value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cur === "ARS" ? `$ ${n}` : `US$ ${n}`;
}

/** Link de WhatsApp a partir de un teléfono cargado como venga (Argentina por defecto). */
export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  // 10 dígitos = característica + número local: se le agrega el 54 9 de celulares de Argentina.
  if (digits.length === 10) digits = `549${digits}`;
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  MERCADOPAGO: "Mercado Pago",
  CARD: "Tarjeta",
  CHECK: "Cheque",
  CRYPTO: "Cripto / USDT",
  CURRENT_ACCOUNT: "Cuenta corriente",
};

export const DELIVERY_OPTION_LABEL: Record<string, string> = {
  PICKUP: "Retiro en el local",
  OWN_DELIVERY: "Envío propio",
  MOTO: "Moto / mensajería",
  CARRIER: "Transporte o correo",
};

export const INVOICE_TYPE_LABEL: Record<string, string> = {
  A: "Factura A",
  B: "Factura B",
  NONE: "Sin factura",
};

export const PRODUCT_CONDITION_LABEL: Record<string, string> = {
  NEW: "Nuevo",
  OPEN_BOX: "Caja abierta",
  REFURBISHED: "Reacondicionado",
  USED: "Usado",
};

/** Cada cuántos días se pide confirmar el stock (0 = nunca). Mismas opciones que el servidor. */
export const STOCK_DAY_OPTIONS = [
  { value: 1, label: "Todos los días" },
  { value: 2, label: "Cada 2 días" },
  { value: 3, label: "Cada 3 días" },
  { value: 7, label: "Cada semana" },
  { value: 15, label: "Cada 15 días" },
  { value: 30, label: "Cada mes" },
  { value: 0, label: "No pedírmelo" },
];

export function labelsOf(values: string[] | null | undefined, labels: Record<string, string>): string[] {
  return (values ?? []).map((v) => labels[v]).filter((v): v is string => Boolean(v));
}

/** Cómo está el stock, dicho para el comprador. `null` si no hay nada que decir. */
export function buyerStockText(state: StorefrontStockState, confirmedAt: string | null): { text: string; warn: boolean } | null {
  switch (state) {
    case "FRESH":
    case "DUE_SOON":
      return { text: `Stock confirmado ${ago(confirmedAt)}`, warn: false };
    case "EXPIRED":
      return { text: `El local no confirma el stock desde ${ago(confirmedAt)}: puede no estar al día`, warn: true };
    case "UNCONFIRMED":
      return { text: "El local todavía no confirmó el stock", warn: true };
    default:
      return confirmedAt ? { text: `Stock actualizado ${ago(confirmedAt)}`, warn: false } : null;
  }
}

/** Link de invitación a una tienda privada. */
export function inviteUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://nodohub.app";
  return `${origin}/tienda/${token}`;
}
