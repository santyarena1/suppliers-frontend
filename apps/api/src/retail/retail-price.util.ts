/**
 * Normaliza precios crudos de la fuente externa.
 * Algunos locales (p.ej. Multiplo) publican centavos como entero
 * (`37384476` = `$ 373.844,76`).
 */
export function normalizeExternalPrice(precio: unknown): number {
  const n = typeof precio === "number" ? precio : Number(precio);
  if (!Number.isFinite(n) || n <= 0) return 0;

  // Entero absurdo (≥ 25M): casi seguro vienen en centavos (*100).
  // Un cooler a 37.384.476 en la API es 373.844,76 en la tienda.
  if (Number.isInteger(n) && n >= 25_000_000) {
    return n / 100;
  }

  return n;
}

/** Tope de sanidad para referencias de venta en ARS (descarta basura extrema). */
export const RETAIL_PRICE_SANITY_MAX = 25_000_000;

export function isSaneRetailPrice(price: number): boolean {
  return Number.isFinite(price) && price > 0 && price <= RETAIL_PRICE_SANITY_MAX;
}
