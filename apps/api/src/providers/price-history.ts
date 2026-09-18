export const PRICE_HISTORY_TZ = "America/Argentina/Buenos_Aires";

/**
 * Día calendario en Argentina (YYYY-MM-DD).
 * Prisma guarda `DateTime` como `timestamp without time zone` con reloj UTC:
 * hay que interpretar el instante en AR, no asumir que el naive ya es local.
 */
export function argentinaDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PRICE_HISTORY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Expresión SQL: día calendario AR para `ProductPriceHistory.capturedAt`.
 * `timezone('America/Argentina/…', capturedAt)` falla: trata el naive como si
 * ya fuera hora argentina. Hay que anclarlo a UTC primero.
 */
export const SQL_CAPTURED_AT_ARGENTINA_DAY =
  `((h."capturedAt" AT TIME ZONE 'UTC') AT TIME ZONE '${PRICE_HISTORY_TZ}')::date`;

/** YYYY-MM-DD desde un DATE de Postgres (UTC midnight) o string. */
export function pgDateToYmd(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Suma días a una fecha YYYY-MM-DD (sin zona horaria). */
export function addCalendarDay(ymd: string, days = 1): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Mediodía en Argentina para etiquetar un día calendario. */
export function noonInArgentina(ymd: string): Date {
  return new Date(`${ymd}T15:00:00.000Z`);
}

/**
 * Un punto por día: el último precio de esa jornada. Varias syncs el mismo
 * día no tienen que inflar el gráfico ni dejar el mismo producto “en baja”
 * para siempre.
 */
export function collapsePriceHistoryByDay<T extends { capturedAt: Date }>(points: T[]): T[] {
  const byDay = new Map<string, T>();
  for (const p of points) {
    byDay.set(argentinaDayKey(p.capturedAt), p);
  }
  return [...byDay.values()];
}

/**
 * Serie continua: un punto por cada día desde el primero hasta `until`
 * (hoy por defecto). Los días sin movimiento copian el último precio.
 */
export function fillPriceHistoryDays<T extends { capturedAt: Date }>(
  points: T[],
  until: Date = new Date(),
): T[] {
  const collapsed = collapsePriceHistoryByDay(points);
  if (collapsed.length === 0) return [];
  const byDay = new Map(collapsed.map((p) => [argentinaDayKey(p.capturedAt), p] as const));
  const days = [...byDay.keys()].sort();
  const start = days[0];
  const lastKnown = days[days.length - 1];
  const endKey = argentinaDayKey(until);
  const end = endKey > lastKnown ? endKey : lastKnown;
  const out: T[] = [];
  let last = byDay.get(start)!;
  for (let day = start; day <= end; day = addCalendarDay(day)) {
    const hit = byDay.get(day);
    if (hit) last = hit;
    out.push({ ...last, capturedAt: noonInArgentina(day) });
  }
  return out;
}
