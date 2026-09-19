export { argentinaHour, isCronQuietHours } from "../common/cron-window";
export { CRON_TZ as TZ } from "../common/cron-window";
import { isCronQuietHours } from "../common/cron-window";

/** 06:00–22:59 AR: ingest y sync permitidos. */
export function isRetailDaytime(now = new Date()): boolean {
  return !isCronQuietHours(now);
}
