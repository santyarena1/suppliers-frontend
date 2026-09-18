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
