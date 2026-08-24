/**
 * Normaliza precios crudos de la fuente externa.
 * Algunos locales (p.ej. Multiplo) publican centavos (*100).
 */
export function normalizeExternalPrice(precio: unknown, divisor = 1): number {
  const n = typeof precio === "number" ? precio : Number(precio);
  if (!Number.isFinite(n) || n <= 0) return 0;

  const d = divisor > 1 ? divisor : 1;
  if (d > 1) return n / d;

  // Fallback sin divisor de tienda: enteros absurdos ≥ 25M → centavos.
  if (Number.isInteger(n) && n >= 25_000_000) {
    return n / 100;
  }

  return n;
}

/**
 * Precio ya guardado en DB: no volver a dividir si ya está en pesos.
 * Solo corrige filas viejas aún en centavos.
 */
export function coerceStoredRetailPrice(price: number, divisor = 1): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (divisor > 1 && Number.isInteger(price) && price >= 25_000_000) {
    return price / divisor;
  }
  if (Number.isInteger(price) && price >= 25_000_000) {
    return price / 100;
  }
  return price;
}

/**
 * Detecta si una muestra de precios de una tienda viene en centavos.
 * Multiplo: enteros enormes (medianas de millones/billones en página 1).
 */
export function detectPriceDivisor(samplePrices: number[]): number {
  const prices = samplePrices.filter((p) => Number.isFinite(p) && p > 0);
  if (prices.length < 5) return 1;

  const intRatio =
    prices.filter((p) => Number.isInteger(p) || p === Math.floor(p)).length / prices.length;
  if (intRatio < 0.85) return 1;

  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  // Catálogos en pesos reales rara vez tienen mediana ≥ 50M en la 1ª página.
  if (median >= 50_000_000) return 100;
  return 1;
}

/** Tope de sanidad para referencias de venta en ARS. */
export const RETAIL_PRICE_SANITY_MAX = 25_000_000;

export function isSaneRetailPrice(price: number): boolean {
  return Number.isFinite(price) && price > 0 && price <= RETAIL_PRICE_SANITY_MAX;
}
