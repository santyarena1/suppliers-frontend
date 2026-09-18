export const PRICE_HISTORY_TZ = "America/Argentina/Buenos_Aires";

/** Día calendario en Argentina (YYYY-MM-DD). */
export function argentinaDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PRICE_HISTORY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
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
