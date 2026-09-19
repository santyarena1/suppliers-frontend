/**
 * Ventana de crons en hora Argentina.
 * De 23:00 a 06:00 no corre ninguno. Staging y CRON_DISABLED apagan todo.
 */

export const CRON_TZ = "America/Argentina/Buenos_Aires";

/** Primera hora (inclusive) en que los crons duermen. */
export const CRON_QUIET_FROM_HOUR = 23;
/** Hora (inclusive) en que vuelven a correr. */
export const CRON_QUIET_UNTIL_HOUR = 6;

export function argentinaHour(now = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: CRON_TZ,
    hour: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .find((p) => p.type === "hour")?.value;
  const n = Number(hour);
  return Number.isFinite(n) ? n : 0;
}

/** 23:00–05:59 AR: nada de sync, ingest ni fotos programadas. */
export function isCronQuietHours(now = new Date()): boolean {
  const hour = argentinaHour(now);
  return hour >= CRON_QUIET_FROM_HOUR || hour < CRON_QUIET_UNTIL_HOUR;
}

export function cronsAreGloballyEnabled(): boolean {
  if (process.env.CRON_DISABLED === "true") return false;
  const env = (
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.RAILWAY_ENVIRONMENT ||
    ""
  ).toLowerCase();
  if (env.includes("staging")) return false;
  return true;
}

/** ¿Este tick debe hacer trabajo? */
export function shouldRunScheduledJob(now = new Date()): boolean {
  return cronsAreGloballyEnabled() && !isCronQuietHours(now);
}
