import type { StorefrontHiddenReason, StorefrontOrderStatus } from "@/lib/api";

/** Ayudantes de Vender en NODO (docs/PLAN_VENDER_EN_NODO.md). */

export function apiError(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message?.toString() || fallback;
}

/** Por qué la tienda no se ve, dicho para el dueño. */
export function hiddenReasonText(reason: StorefrontHiddenReason | null, suspendedReason?: string | null): string | null {
  switch (reason) {
    case "PAUSED":
      return "La pausaste: nadie la ve hasta que la reactives.";
    case "SUSPENDED":
      return `NODO frenó tu tienda${suspendedReason ? `: ${suspendedReason}` : ""}. Escribinos para revisarlo.`;
    case "STOCK_EXPIRED":
      return "Venció el stock confirmado. Confirmalo y vuelve a aparecer.";
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
