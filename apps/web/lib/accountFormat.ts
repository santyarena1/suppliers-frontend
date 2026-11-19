/**
 * Formato de lo que muestran las cuentas de los distribuidores: fechas, estados
 * de los pedidos de NODO e importes que llegan como texto del portal. Cada portal
 * manda fechas e importes a su manera; acá se ven todos igual.
 */
import { formatAccountSum, parseAccountAmount } from "@/lib/account-history";
import { orderStatusLabel } from "@/lib/format";

const TZ = "America/Argentina/Buenos_Aires";

/**
 * Fecha del portal → «dd/mm/aaaa» (y «hh:mm» si trae hora). Acepta ISO con zona
 * («2026-11-16T15:31:13.906Z», se pasa a hora argentina), «2026-11-16»,
 * «16-11-2026 13:26:15» y «16/11/2026». Si no la entiende, la deja como vino.
 */
export function fmtPortalDate(raw: string | null | undefined, opts?: { time?: boolean }): string {
  if (raw == null || String(raw).trim() === "") return "—";
  const s = String(raw).trim();
  const withTime = opts?.time !== false;
  // ISO con hora y zona: es un instante, va en hora argentina.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && /(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("es-AR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
        timeZone: TZ,
      }).replace(",", "");
    }
  }
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}${withTime && m[4] && !(m[4] === "00" && m[5] === "00") ? ` ${m[4]}:${m[5]}` : ""}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}${withTime && m[4] ? ` ${m[4].padStart(2, "0")}:${m[5]}` : ""}`;
  return s;
}

/** Fecha y hora de algo guardado en NODO (ISO), en hora argentina, sin segundos. */
export function fmtNodoDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fmtPortalDate(iso);
  return d
    .toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ })
    .replace(",", "");
}

const DRAFT_TONE: Record<string, string> = {
  CREATED: "bg-sky-500/10 text-sky-400",
  PENDING: "bg-amber-500/10 text-amber-400",
  PENDING_APPROVAL: "bg-amber-500/10 text-amber-400",
  OFFLINE: "bg-surface-700/60 text-surface-300",
  REJECTED: "bg-red-500/10 text-red-400",
  FAILED: "bg-red-500/10 text-red-400",
};

/** Estado de un pedido hecho desde NODO, en palabras y con su color. `created` cambia cómo se dice «creado» en ese portal. */
export function draftStatus(status: string | null | undefined, created?: string): { label: string; cls: string } {
  const s = status ?? "";
  return {
    label: s === "CREATED" && created ? created : s ? orderStatusLabel(s) : "—",
    cls: DRAFT_TONE[s] ?? "bg-surface-700/60 text-surface-300",
  };
}

/** Total de un pedido de NODO (siempre en dólares: se guarda el subtotal en USD). */
export function fmtDraftTotal(total: string | number | null | undefined, currency: "USD" | "ARS" = "USD"): string {
  const n = parseAccountAmount(total);
  return n == null ? "—" : formatAccountSum(n, currency);
}

/** Moneda escrita en un texto del portal: «US$», «U$S», «USD», «u$s» → USD; «$», «ARS», «Pesos» → ARS. */
export function currencyIn(raw: string | null | undefined): "USD" | "ARS" | null {
  const s = String(raw ?? "");
  if (/u\s?\$\s?s|us\s?\$|usd|d[oó]lar/i.test(s)) return "USD";
  if (/\$|ars|peso/i.test(s)) return "ARS";
  return null;
}

/**
 * Importe que llega como texto («US$ 1234.50», «USD 12.50», «311,471.04») →
 * «US$ 1.234,50». La moneda sale del texto o, si no la dice, de `fallback`.
 */
export function fmtPortalMoney(raw: string | number | null | undefined, fallback?: "USD" | "ARS" | null, currencyText?: string | null): string {
  if (raw == null || raw === "") return "—";
  // Solo si es un importe (con o sin moneda): un texto como «Incluido» queda como vino.
  if (typeof raw === "string" && !/^\s*(us\s?\$|u\$s|usd|ars|\$)?\s*-?\s*[\d.,]*\d\s*(usd|ars)?\s*$/i.test(raw)) return raw;
  const n = parseAccountAmount(raw);
  if (n == null) return String(raw);
  const cur = currencyIn(currencyText) ?? (typeof raw === "string" ? currencyIn(raw) : null) ?? fallback ?? null;
  return formatAccountSum(n, cur);
}
