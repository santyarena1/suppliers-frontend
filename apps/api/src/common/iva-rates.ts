/**
 * Alícuotas de IVA que existen en Argentina. Cualquier otro porcentaje es un
 * error de lectura (una columna corrida, un carrito del portal con restos) y
 * no se muestra ni se cobra: se vieron "IVA" de 400 % y de 2800 %.
 */
export const KNOWN_IVA_RATES = [0, 2.5, 5, 10.5, 21, 27] as const;

/** La alícuota conocida más cercana, si está a menos de `tolerance` puntos (redondeos). */
export function knownIvaRate(percent: number | null | undefined, tolerance = 0.6): number | undefined {
  if (percent == null || !Number.isFinite(percent)) return undefined;
  let best: number | undefined;
  for (const rate of KNOWN_IVA_RATES) {
    if (Math.abs(percent - rate) <= tolerance && (best === undefined || Math.abs(percent - rate) < Math.abs(percent - best))) {
      best = rate;
    }
  }
  return best;
}
