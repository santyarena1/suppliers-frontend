/** Paginado y filtro por mes para historiales de pedidos / cta cte. */

export const ACCOUNT_PAGE_SIZE = 25;

export type MonthFilter = string | "all"; // YYYY-MM | all

export function currentMonthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Mes calendario YYYY-MM a partir del texto (DD/MM/YYYY o ISO).
 * Usa el día del comprobante, no la zona horaria del browser: un
 * `2026-09-01T00:00:00.000Z` es septiembre, no el 31/08 en Argentina.
 */
export function accountMonthKey(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    const month = Number(dmy[2]);
    if (!Number.isFinite(y) || month < 1 || month > 12) return null;
    return `${y}-${String(month).padStart(2, "0")}`;
  }
  return null;
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return currentMonthKey(d);
}

export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Interpreta fechas típicas de portales AR (DD/MM/YYYY, ISO, etc.). */
export function parseAccountDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();

  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    const d = new Date(y, Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  const ms = Date.parse(s);
  if (!Number.isNaN(ms)) return new Date(ms);
  return null;
}

export function inMonth(date: Date | null, ym: MonthFilter): boolean {
  if (ym === "all") return true;
  // Sin fecha legible: no ocultamos la fila (mejor verla que perderla).
  if (!date) return true;
  return currentMonthKey(date) === ym;
}

export function matchesMonth(
  ym: MonthFilter,
  dates: Array<string | null | undefined>
): boolean {
  if (ym === "all") return true;
  const keys = dates.map(accountMonthKey).filter((k): k is string => Boolean(k));
  if (keys.length === 0) return true;
  return keys.includes(ym);
}

export function latestMonthKey<T>(
  rows: T[],
  getDate: (row: T) => string | null | undefined
): string | null {
  let best: string | null = null;
  for (const row of rows) {
    const key = accountMonthKey(getDate(row));
    if (key && (best == null || key > best)) best = key;
  }
  return best;
}

export type MonthFilterOpts<T> = {
  extraDates?: (row: T) => Array<string | null | undefined>;
  keep?: (row: T) => boolean;
};

export function filterByMonth<T>(
  rows: T[],
  getDate: (row: T) => string | null | undefined,
  ym: MonthFilter,
  opts?: MonthFilterOpts<T>
): T[] {
  if (ym === "all") return rows;
  return rows.filter((row) => {
    if (opts?.keep?.(row)) return true;
    return matchesMonth(ym, [getDate(row), ...(opts?.extraDates?.(row) ?? [])]);
  });
}

export function paginateRows<T>(
  rows: T[],
  page: number,
  pageSize = ACCOUNT_PAGE_SIZE
): { items: T[]; total: number; page: number; pages: number } {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize),
    total,
    page: safePage,
    pages,
  };
}

/** Parsea importes de portales (número, "1.234,56", "USD 120", etc.). */
export function parseAccountAmount(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim().replace(/\s/g, "");
  s = s.replace(/[^\d,.\-]/g, "");
  if (!s || s === "-" || s === "." || s === ",") return null;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    // El último separador suele ser el decimal.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // "1234,56" o "1.234" mal tipado como coma → decimal si hay 1–2 dígitos finales
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasDot) {
    // miles US "1,234.56" ya sin comas; o miles EU "1.234" sin decimales
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function sumAccountAmounts(
  values: Array<string | number | null | undefined>
): number | null {
  let sum = 0;
  let any = false;
  for (const v of values) {
    const n = parseAccountAmount(v);
    if (n != null) {
      sum += n;
      any = true;
    }
  }
  return any ? sum : null;
}

export function formatAccountSum(
  n: number,
  currency?: string | null
): string {
  const code = currency === "USD" || currency === "ARS" ? currency : null;
  if (code) {
    return n.toLocaleString("es-AR", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
