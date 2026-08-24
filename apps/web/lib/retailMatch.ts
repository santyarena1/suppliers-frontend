/** Coincidencia de nombre: cuántas palabras del proveedor aparecen en el local. */

const STOP = new Set([
  "a", "al", "con", "de", "del", "el", "en", "la", "las", "los", "para", "por",
  "un", "una", "y", "o", "the", "of", "and", "or", "p",
]);

export function tokenizeProductName(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/**
 * % de palabras del producto del proveedor que aparecen en el título del local.
 * No penaliza palabras extra del local (adornos / marketing).
 */
export function providerNameMatchRatio(providerName: string, retailName: string): number {
  const providerTokens = [...new Set(tokenizeProductName(providerName))];
  if (providerTokens.length === 0) return 0;

  const retailTokens = new Set(tokenizeProductName(retailName));
  if (retailTokens.size === 0) return 0;

  let hits = 0;
  for (const t of providerTokens) {
    if (retailTokens.has(t)) {
      hits += 1;
      continue;
    }
    // Modelos parciales: "360" vs tokens del local, o "th240" ⊆ "th240v2"
    for (const r of retailTokens) {
      if (r.includes(t) || t.includes(r)) {
        hits += 1;
        break;
      }
    }
  }

  return hits / providerTokens.length;
}

export const BEST_MATCH_THRESHOLD = 0.85;

export function marginVsCostPercent(saleArs: number, costArs: number | null | undefined): number | null {
  if (costArs == null || !(costArs > 0) || !(saleArs > 0)) return null;
  return (saleArs / costArs - 1) * 100;
}

/**
 * Precio de local ~100× bajo vs costo (falso ÷100) → recompone ×100.
 */
export function repairImplausibleSalePrice(
  saleArs: number,
  costArs: number | null | undefined
): number {
  if (!Number.isFinite(saleArs) || saleArs <= 0) return saleArs;
  if (costArs == null || !(costArs > 0)) return saleArs;
  const scaled = saleArs * 100;
  if (saleArs < costArs * 0.08 && scaled >= costArs * 0.35 && scaled <= costArs * 4) {
    return scaled;
  }
  return saleArs;
}

/**
 * % de tokens de la búsqueda activa que aparecen en el título del local.
 * Con 1 palabra (“4500x”), cualquier título que la contenga = 100%.
 */
export function queryMatchRatio(query: string, retailName: string): number {
  return providerNameMatchRatio(query, retailName);
}
