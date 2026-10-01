/**
 * Bloqueo por intentos fallidos de contraseña, por cuenta.
 *
 * El límite por IP no alcanza: con muchas IPs (proxies, botnets) se puede
 * probar contraseñas contra una misma cuenta sin techo. Acá cuenta la cuenta,
 * venga de donde venga el intento. Cada tanda de fallos bloquea más tiempo.
 */

export const LOCK_THRESHOLD = 5;
const LOCK_STEPS_MS = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

/** Cuánto bloquear después de este fallo; `null` = todavía no se bloquea. */
export function lockForFailure(failedCount: number): number | null {
  if (failedCount < LOCK_THRESHOLD || failedCount % LOCK_THRESHOLD !== 0) return null;
  const step = Math.min(failedCount / LOCK_THRESHOLD - 1, LOCK_STEPS_MS.length - 1);
  return LOCK_STEPS_MS[step];
}

export function isLocked(lockedUntil: Date | null | undefined, now = new Date()): boolean {
  return Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());
}

export function minutesLeft(lockedUntil: Date, now = new Date()): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
}
