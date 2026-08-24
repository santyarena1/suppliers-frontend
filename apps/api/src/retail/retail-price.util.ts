/**
 * Normalización de precios retail (Precio Líder).
 *
 * Hechos verificados contra la API en vivo:
 * - Multiplo (id 31): publica centavos enteros (p.ej. 1_218_600_000 → $12.186.000).
 * - El resto de locales publican pesos ARS (p.ej. gabinete 4500X ≈ 330_000–380_000).
 *
 * Un auto-detect viejo marcó varios locales como ÷100 y guardó precios /100
 * (340_500 → 3_405). Por eso la precisión importa: NUNCA ÷100 fuera de Multiplo.
 */

/** Solo Multiplo publica centavos. No inferir por muestra de precios. */
export function isCentsBasedStore(name: string, externalId?: number): boolean {
  if (externalId === 31) return true;
  return /multiplo/i.test(String(name ?? "").trim());
}

/** Divisor efectivo: ignora priceDivisor viejo/errado en DB. */
export function resolvePriceDivisor(name: string, externalId?: number): number {
  return isCentsBasedStore(name, externalId) ? 100 : 1;
}

/** Crudo de la API → pesos ARS para persistir. */
export function normalizeExternalPrice(precio: unknown, divisor = 1): number {
  const n = typeof precio === "number" ? precio : Number(precio);
  if (!Number.isFinite(n) || n <= 0) return 0;

  if (divisor > 1) return roundMoney(n / divisor);

  // Safety net: crudo absurdo sin divisor (legado / Multiplo sin marcar)
  if (Number.isInteger(n) && n >= 25_000_000) return roundMoney(n / 100);
  return n;
}

/**
 * Valor en DB → pesos para UI.
 * - Multiplo (divisor 100): solo ÷100 si el número sigue en escala de centavos crudos (≥25M).
 * - Cualquier otro: nunca ÷100 por divisor de tienda (puede estar mal en DB).
 */
export function coerceStoredRetailPrice(
  price: number,
  divisor = 1,
  opts?: { storeName?: string; storeExternalId?: number }
): number {
  if (!Number.isFinite(price) || price <= 0) return 0;

  const cents = opts
    ? isCentsBasedStore(opts.storeName ?? "", opts.storeExternalId)
    : divisor > 1;

  if (cents) {
    if (Number.isInteger(price) && price >= 25_000_000) return roundMoney(price / 100);
    return price;
  }

  // No-cents: si quedó un crudo absurdo (≥25M), corregir; si no, devolver tal cual.
  if (Number.isInteger(price) && price >= 25_000_000) return roundMoney(price / 100);
  return price;
}

/**
 * @deprecated Solo tests / diagnóstico. NO usar en ingest: genera falsos positivos.
 * Los catálogos ARS normales tienen enteros ≥100k (gabinetes, notebooks).
 */
export function detectPriceDivisor(samplePrices: number[]): number {
  const prices = samplePrices.filter((p) => Number.isFinite(p) && p > 0);
  if (prices.length < 5) return 1;

  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  // Solo medianes típicas de Multiplo (centavos de PCs armadas)
  if (median >= 50_000_000) return 100;
  return 1;
}

export const RETAIL_PRICE_SANITY_MAX = 25_000_000;

export function isSaneRetailPrice(price: number): boolean {
  return Number.isFinite(price) && price > 0 && price <= RETAIL_PRICE_SANITY_MAX;
}

/**
 * Recompone un precio ~100× chico vs el costo de compra (falso ÷100).
 */
export function repairImplausibleRetailPrice(
  saleArs: number,
  costArs: number | null | undefined
): number {
  if (!Number.isFinite(saleArs) || saleArs <= 0) return saleArs;
  if (costArs == null || !(costArs > 0)) return saleArs;

  const scaled = saleArs * 100;
  if (saleArs < costArs * 0.08 && scaled >= costArs * 0.35 && scaled <= costArs * 4) {
    return roundMoney(scaled);
  }
  return saleArs;
}

/**
 * Dentro de un resultado de búsqueda: si un precio no-cents está ~100× bajo
 * respecto a la mediana del resto, recompone ×100.
 */
export function repairPricesAgainstPeers(
  items: { price: number; centsStore: boolean }[]
): number[] {
  const peerPrices = items
    .filter((i) => !i.centsStore && i.price > 0)
    .map((i) => i.price)
    .sort((a, b) => a - b);

  if (peerPrices.length < 3) return items.map((i) => i.price);

  const median = peerPrices[Math.floor(peerPrices.length / 2)] ?? 0;
  if (!(median > 0)) return items.map((i) => i.price);

  return items.map((i) => {
    if (i.centsStore || !(i.price > 0)) return i.price;
    const scaled = i.price * 100;
    const tooCheap = i.price < median * 0.05;
    const scaledOk = scaled >= median * 0.25 && scaled <= median * 4;
    if (tooCheap && scaledOk) return roundMoney(scaled);
    return i.price;
  });
}

/**
 * ¿El catálogo de un local no-cents parece haber sido dividido por 100?
 * Usa el tramo caro (top precios): en locales de PC suele ser ≥200k–millones.
 * Tras un falso ÷100 el top queda en ~2k–50k.
 */
export function catalogLooksFalselyDivided(samplePrices: number[]): boolean {
  const prices = samplePrices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => b - a);
  if (prices.length < 8) return false;

  const top = prices.slice(0, Math.min(25, prices.length));
  const mid = top[Math.floor(top.length / 2)] ?? 0;
  if (!(mid > 0)) return false;

  // Top-mediana demasiado baja para un local de hardware, pero ×100 vuelve a zona sana
  const scaled = mid * 100;
  return mid < 100_000 && scaled >= 200_000 && scaled <= 20_000_000;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
