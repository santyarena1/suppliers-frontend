/**
 * Freno para dar de baja faltantes después de una sincronización.
 *
 * Si el proveedor devolvió bastante menos de lo que había (una página vacía,
 * un corte que no llegó a ser error), "lo que no vino" no son productos dados
 * de baja: es la sincronización incompleta. Ocultar o borrar ahí vacía el
 * catálogo del comercio sin motivo, y borrar no tiene vuelta atrás.
 */
export const MISSING_GUARD_MIN_BEFORE = 20;
export const MISSING_GUARD_MIN_RATIO = 0.5;

export function missingActionIsSafe(before: number, seen: number): boolean {
  if (before < MISSING_GUARD_MIN_BEFORE) return true;
  return seen >= before * MISSING_GUARD_MIN_RATIO;
}

export function incompleteSyncMessage(before: number, seen: number): string {
  return `La última sincronización trajo ${seen} de ${before} productos. Por las dudas no se dio de baja ningún faltante; se reintenta en la próxima.`;
}

/**
 * Al guardar la configuración: si antes alguna acción ocultaba productos y
 * ahora ninguna lo hace, lo oculto se vuelve a mostrar en el momento (sin
 * esperar a la próxima sincronización). Lo borrado no vuelve: no existe más.
 */
export function shouldUnhideOnConfigChange(
  before: { zeroStockAction?: string | null; missingProductAction?: string | null } | null,
  after: { zeroStockAction?: string | null; missingProductAction?: string | null }
): boolean {
  const hid = before?.zeroStockAction === "HIDE" || before?.missingProductAction === "HIDE";
  const hides = after.zeroStockAction === "HIDE" || after.missingProductAction === "HIDE";
  return hid && !hides;
}
