const TZ = "America/Argentina/Buenos_Aires";

export function argentinaDayKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

function addCalendarDay(ymd: string, days = 1): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function noonInArgentina(ymd: string): Date {
  return new Date(`${ymd}T15:00:00.000Z`);
}

export type DailyPricePoint = {
  capturedAt: string;
  price: number;
  label: string;
};

/** Un punto visible por cada día AR, copiando el último precio si ese día no hubo sync. */
export function dailyChartPoints(
  points: { capturedAt: string; price: number }[],
  until = new Date(),
): DailyPricePoint[] {
  const porDia = new Map<string, { capturedAt: string; price: number }>();
  for (const p of [...points].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
  )) {
    if (!(p.price > 0)) continue;
    const d = new Date(p.capturedAt);
    if (Number.isNaN(d.getTime())) continue;
    porDia.set(argentinaDayKey(d), { capturedAt: p.capturedAt, price: p.price });
  }
  const days = [...porDia.keys()].sort();
  if (days.length === 0) return [];
  const start = days[0];
  const lastKnown = days[days.length - 1];
  const endKey = argentinaDayKey(until);
  const end = endKey > lastKnown ? endKey : lastKnown;
  const out: DailyPricePoint[] = [];
  let last = porDia.get(start)!;
  for (let day = start; day <= end; day = addCalendarDay(day)) {
    const hit = porDia.get(day);
    if (hit) last = hit;
    const at = noonInArgentina(day);
    out.push({
      capturedAt: at.toISOString(),
      price: last.price,
      label: at.toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
        timeZone: TZ,
      }),
    });
  }
  return out;
}
