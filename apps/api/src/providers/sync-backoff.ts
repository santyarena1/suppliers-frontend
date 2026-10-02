/** Fallos seguidos que marcan el sync como pausado por error (y avisan al comercio). */
export const SYNC_MAX_FAILURES = 6;
/**
 * Tope del backoff. Pausado no es apagado: se sigue probando cada 2 h como mucho
 * y, cuando el proveedor vuelve, la sincronización continúa sola.
 */
export const SYNC_BACKOFF_CAP_MS = 2 * 60 * 60_000;
/** Precios por API más viejos que esto se marcan desactualizados aunque el intervalo sea largo. */
export const PRICES_STALE_FLOOR_MS = 48 * 60 * 60_000;

export interface SyncSchedule {
  enabled: boolean;
  syncIntervalMinutes: number;
  lastSyncedAt: Date | null;
  lastAttemptAt: Date | null;
  consecutiveFailures: number;
  pausedAt: Date | null;
}

/**
 * Cuándo toca el próximo sync automático. Sin fallos, el intervalo desde la
 * última sync OK. Con fallos, intervalo × 2^fallos desde el último intento
 * (tope 24 h): un portal caído o una clave mala no se reintentan en cada tick.
 * `null` = no corre (deshabilitado). Pausado por error sigue probando con el backoff.
 */
export function nextSyncAt(config: SyncSchedule): Date | null {
  if (!config.enabled) return null;
  const interval = Math.max(config.syncIntervalMinutes, 1) * 60_000;
  const failures = Math.max(config.consecutiveFailures, 0);
  if (failures > 0) {
    const from = config.lastAttemptAt ?? config.lastSyncedAt;
    if (!from) return new Date(0);
    const delay = Math.min(interval * 2 ** failures, SYNC_BACKOFF_CAP_MS);
    return new Date(from.getTime() + delay);
  }
  if (!config.lastSyncedAt) return new Date(0);
  return new Date(config.lastSyncedAt.getTime() + interval);
}

export function isSyncDue(config: SyncSchedule, now = new Date()): boolean {
  const at = nextSyncAt(config);
  return at !== null && at.getTime() <= now.getTime();
}

/**
 * Precios por API desactualizados: la última sync OK es de hace más de 2
 * intervalos (con auto-sync) o de más de 48 h. Nunca menos de 2 h, para no
 * alarmar por una corrida que viene un rato atrasada.
 */
export function pricesAreStale(
  config: { enabled: boolean; syncIntervalMinutes: number; lastSyncedAt: Date | null },
  now = new Date()
): boolean {
  if (!config.lastSyncedAt) return false;
  const byInterval = config.enabled ? Math.max(config.syncIntervalMinutes, 1) * 60_000 * 2 : PRICES_STALE_FLOOR_MS;
  const limit = Math.max(Math.min(byInterval, PRICES_STALE_FLOOR_MS), 2 * 60 * 60_000);
  return now.getTime() - config.lastSyncedAt.getTime() > limit;
}

/** El error técnico del portal, en criollo para el comercio. */
export function syncFailureReason(message: string): string {
  const m = message.toLowerCase();
  if (/no hay credenciales/.test(m)) return "No hay cuenta cargada para este proveedor.";
  if (/\b429\b|too many|rate limit|demasiad/.test(m)) {
    return "El proveedor limitó las consultas por exceso de pedidos. Se reintenta más tarde.";
  }
  if (/\b403\b|forbidden|bloque/.test(m)) {
    return "El portal del proveedor rechazó el acceso (403): la cuenta puede estar bloqueada o sin permiso.";
  }
  if (/\b401\b|unauthori|credencial|contrase|password|usuario o|login|incorrect/.test(m)) {
    return "La cuenta del proveedor no es válida: revisá usuario y contraseña.";
  }
  if (/cloudflare|captcha/.test(m)) return "El portal del proveedor bloqueó el acceso automático (Cloudflare).";
  if (/eai_again|enotfound|econnrefused|econnreset|etimedout|timeout|timed out|socket hang up|\b50[0-4]\b|unavailable/.test(m)) {
    return "El portal del proveedor no responde o está caído.";
  }
  const short = message.replace(/\s+/g, " ").trim().slice(0, 160);
  return short ? `La sincronización falló: ${short}` : "La sincronización falló.";
}
