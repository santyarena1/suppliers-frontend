/**
 * Normaliza precios crudos de la fuente externa.
 * Multiplo: los últimos 2 dígitos son siempre centavos → ÷100.
 */

/** Tiendas que publican el precio en centavos (últimos 2 dígitos). */
export function isCentsBasedStore(name: string, externalId?: number): boolean {
  if (externalId === 31) return true;
  return /multiplo/i.test(name.trim());
}

/** Crudo → pesos. Con divisor 100: siempre /100 (últimos 2 = centavos). */
export function normalizeExternalPrice(precio: unknown, divisor = 1): number {
  const n = typeof precio === "number" ? precio : Number(precio);
  if (!Number.isFinite(n) || n <= 0) return 0;

  if (divisor > 1) return n / divisor;

  // Fallback genérico: enteros absurdo ≥ 25M
  if (Number.isInteger(n) && n >= 25_000_000) return n / 100;
  return n;
}

/**
 * Valor en DB → pesos para UI.
 * Solo corrige crudos legados claramente en centavos (≥25M).
 * No tocar 100k–5M: un gabinete ya en pesos (~340.000) se destruía a ~3.400.
 */
export function coerceStoredRetailPrice(price: number, divisor = 1): number {
  if (!Number.isFinite(price) || price <= 0) return 0;

  if (divisor > 1) {
    if (isStillCentavosScale(price)) return price / divisor;
    return price;
  }

  if (Number.isInteger(price) && price >= 25_000_000) return price / 100;
  return price;
}

/**
 * ¿Sigue en escala de centavos crudos?
 * Multiplo crudo típico: 37_384_476, 1_218_600_000
 * Ya en pesos: 15_000, 373_844.76, 340_500, 12_186_000
 */
function isStillCentavosScale(price: number): boolean {
  if (!Number.isInteger(price)) return false;
  // Entero enorme → casi seguro crudo (centavos pegados)
  return price >= 25_000_000;
}

/**
 * Auto-detectar divisor solo con señal fuerte.
 * Precios ARS normales (100k–2M) NO son centavos — no marcar ÷100.
 */
export function detectPriceDivisor(samplePrices: number[]): number {
  const prices = samplePrices.filter((p) => Number.isFinite(p) && p > 0);
  if (prices.length < 5) return 1;

  const intRatio =
    prices.filter((p) => Number.isInteger(p) || p === Math.floor(p)).length / prices.length;
  if (intRatio < 0.85) return 1;

  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  // Solo medianes absurdas en escala de centavos (p.ej. 50M+ = $500k+)
  if (median >= 50_000_000) return 100;
  return 1;
}

export const RETAIL_PRICE_SANITY_MAX = 25_000_000;

export function isSaneRetailPrice(price: number): boolean {
  return Number.isFinite(price) && price > 0 && price <= RETAIL_PRICE_SANITY_MAX;
}

/**
 * Si el precio quedó ~100× chico vs el costo (falso ÷100), lo recompone.
 * Útil cuando el divisor de la tienda quedó mal marcado en DB.
 */
export function repairImplausibleRetailPrice(
  saleArs: number,
  costArs: number | null | undefined
): number {
  if (!Number.isFinite(saleArs) || saleArs <= 0) return saleArs;
  if (costArs == null || !(costArs > 0)) return saleArs;

  const scaled = saleArs * 100;
  const tooCheap = saleArs < costArs * 0.08;
  const scaledPlausible = scaled >= costArs * 0.35 && scaled <= costArs * 4;
  if (tooCheap && scaledPlausible) return scaled;
  return saleArs;
}
