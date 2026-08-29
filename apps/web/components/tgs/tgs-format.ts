import { formatARS, formatUSD } from "@/lib/format";
import type { TgsScopeLevel } from "@/lib/tgs-api";

export function tgsErr(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export function tgsFechaCorta(value: string | null | undefined) {
  if (!value) return "—";
  const day = value.slice(0, 10);
  const [y, m, d] = day.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

export function tgsFecha(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(" ", " · ");
}

export function tgsMoney2(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function tgsLocalLabel(localId: number | null | undefined) {
  if (localId == null) return "—";
  if (localId === 1) return "Local Principal";
  return `Local ${localId}`;
}

export function tgsMoney(n: number | null | undefined, moneda?: string | null) {
  if (n == null || Number.isNaN(n)) return "—";
  if ((moneda ?? "ARS").toUpperCase() === "USD") return formatUSD(n);
  return formatARS(n);
}

export function tgsEstadoClass(estado: string | null | undefined) {
  const key = (estado ?? "").toLowerCase();
  if (["pagada", "completada", "entregado", "cerrado"].some((s) => key.includes(s))) {
    return "bg-emerald-500/15 text-emerald-300";
  }
  if (["anulado", "cancelad", "rechaz"].some((s) => key.includes(s))) {
    return "bg-red-500/15 text-red-300";
  }
  if (["proceso", "recepcion", "pendiente", "abierto", "presupuesto"].some((s) => key.includes(s))) {
    return "bg-amber-500/15 text-amber-300";
  }
  return "bg-surface-700 text-surface-300";
}

export function tgsScopeLabel(level: TgsScopeLevel | undefined) {
  if (level === "read_write") return "Lectura y escritura";
  if (level === "read") return "Solo lectura";
  return "Apagado";
}

export function tgsScopeClass(level: TgsScopeLevel | undefined) {
  if (level === "read_write") return "bg-emerald-500/15 text-emerald-300";
  if (level === "read") return "bg-sky-500/15 text-sky-300";
  return "bg-surface-700 text-surface-400";
}

export function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return { desde: `${y}-${m}-01`, hasta: `${y}-${m}-${String(last).padStart(2, "0")}` };
}

export function dash(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  return String(value);
}
