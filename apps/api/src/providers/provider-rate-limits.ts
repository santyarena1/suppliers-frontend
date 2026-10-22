import type { Provider } from "@nodo/shared";

/**
 * Intervalo mínimo entre syncs automáticas por distribuidor, en minutos. Manda
 * sobre el `syncIntervalMinutes` del comercio cuando este es más corto.
 *
 * Grupo Núcleo (catálogo entero en un GET) y Solution Box (un listado por rubro
 * más fichas sueltas) suspendieron la cuenta con la sync cada 1 h (oct-2026).
 * Desde el 21/10, cada 12 h mientras vemos si levantan el bloqueo.
 */
export const PROVIDER_MIN_SYNC_MINUTES: Partial<Record<Provider, number>> = {
  GRUPO_NUCLEO: 720,
  SOLUTION_BOX: 720,
};

/**
 * Pausados por un 403/429, estos distribuidores se prueban solos una vez por día:
 * si siguen bloqueados la corrida corta en el primer pedido; si responden, la
 * sync se reactiva con el ritmo de arriba.
 */
export const BLOCKED_PROBE_MINUTES = 24 * 60;

/** Tras un intento (cron o manual), cuánto esperar antes de aceptar "Sincronizar ahora". */
export const PROVIDER_MANUAL_COOLDOWN_MINUTES: Partial<Record<Provider, number>> = {
  GRUPO_NUCLEO: 60,
  SOLUTION_BOX: 60,
};

export function effectiveSyncMinutes(provider: string, configured: number): number {
  const min = PROVIDER_MIN_SYNC_MINUTES[provider as Provider] ?? 0;
  return Math.max(configured, min, 1);
}

/** Minutos que faltan para poder sincronizar a mano; 0 = ya se puede. */
export function manualSyncWaitMinutes(provider: string, lastAttemptAt: Date | null, now = new Date()): number {
  const cooldown = PROVIDER_MANUAL_COOLDOWN_MINUTES[provider as Provider];
  if (!cooldown || !lastAttemptAt) return 0;
  const left = lastAttemptAt.getTime() + cooldown * 60_000 - now.getTime();
  return left > 0 ? Math.ceil(left / 60_000) : 0;
}

/** El portal rechazó o limitó el acceso (403, 429). */
export function isAccessBlockedError(message: string): boolean {
  return /\b(403|429)\b|forbidden|too many requests|limit[oó] los pedidos/i.test(message);
}

/**
 * En los distribuidores que suspenden la cuenta, reintentar después de un 403/429
 * solo empeora la suspensión: la sync se pausa en el primer fallo de ese tipo.
 * El resto sigue con la pausa a los SYNC_MAX_FAILURES (un 403 suelto de Cloudflare
 * no tiene que sacar al distribuidor del buscador).
 */
export function shouldPauseOnFirstFailure(provider: string, message: string): boolean {
  return provider in PROVIDER_MIN_SYNC_MINUTES && isAccessBlockedError(message);
}
