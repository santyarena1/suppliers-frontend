const TZ = "America/Argentina/Buenos_Aires";

/** Hora 0–23 en Argentina. El cron no filtra por hora (fallaba / se saltaba la noche). */
export function argentinaHour(now = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now).find((p) => p.type === "hour")?.value;
  const n = Number(hour);
  return Number.isFinite(n) ? n : 0;
}

export function isRetailDaytime(now = new Date()): boolean {
  const hour = argentinaHour(now);
  return hour >= 6 && hour < 21;
}
