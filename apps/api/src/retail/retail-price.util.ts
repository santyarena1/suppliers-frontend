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
 * - Si divisor=100 y el número sigue en escala de centavos, ÷100.
 * - Si ya está en pesos (post-ingest), se deja.
 */
export function coerceStoredRetailPrice(price: number, divisor = 1): number {
  if (!Number.isFinite(price) || price <= 0) return 0;

  if (divisor > 1) {
    if (isStillCentavosScale(price, divisor)) return price / divisor;
    return price;
  }

  if (Number.isInteger(price) && price >= 25_000_000) return price / 100;
  return price;
}

/**
 * ¿Sigue en escala de centavos?
 * Multiplo crudo: 1_500_000, 37_384_476, 1_218_600_000
 * Ya en pesos: 15_000, 373_844.76, 12_186_000
 */
function isStillCentavosScale(price: number, divisor: number): boolean {
  if (divisor !== 100) return price >= 25_000_000 && Number.isInteger(price);

  // Ya tiene centavos decimales → pesos
  if (!Number.isInteger(price)) return false;

  // Entero enorme (≥25M) → casi seguro crudo
  if (price >= 25_000_000) return true;

  // Entero con “centavos” pegados (…xx ≠ 00) p.ej. 37384476 ya cubierto;
  // 1500076 → /100 = 15000.76
  if (price >= 100_000 && price % 100 !== 0) return true;

  // Entero redondo en centavos de producto chico/medio: 100_000–5_000_000
  // → $1.000–$50.000 (típico cable/cooler). Un PC ya en pesos (~8–15M) no entra.
  if (price >= 100_000 && price <= 5_000_000) return true;

  return false;
}

export function detectPriceDivisor(samplePrices: number[]): number {
  const prices = samplePrices.filter((p) => Number.isFinite(p) && p > 0);
  if (prices.length < 5) return 1;

  const intRatio =
    prices.filter((p) => Number.isInteger(p) || p === Math.floor(p)).length / prices.length;
  if (intRatio < 0.85) return 1;

  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  if (median >= 50_000_000) return 100;
  if (sorted[0] >= 100_000 && intRatio >= 0.95) return 100;
  return 1;
}

export const RETAIL_PRICE_SANITY_MAX = 25_000_000;

export function isSaneRetailPrice(price: number): boolean {
  return Number.isFinite(price) && price > 0 && price <= RETAIL_PRICE_SANITY_MAX;
}
