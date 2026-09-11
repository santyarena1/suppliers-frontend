/**
 * Cómo se entiende lo que se escribe en el buscador.
 *
 * Misma regla que aplica la API en `apps/api/src/providers/catalog-search.ts`:
 * hacen falta todas las palabras, en cualquier orden y con lo que sea en el
 * medio. Acá se repite porque cuando la búsqueda se combina con marca o
 * categoría, el filtro final lo hace el navegador sobre lo ya traído; si esto
 * pidiera la frase entera, "monitor msi" seguiría dejando afuera los que se
 * llaman "MONITOR 24 MSI".
 */

export function searchTokens(query: string, max = 8): string[] {
  const normalizado = query
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalizado) return [];
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const t of normalizado.split(" ")) {
    if (!t || vistos.has(t)) continue;
    vistos.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** true si el producto tiene todas las palabras buscadas, en nombre o marca. */
export function matchesSearchTokens(
  product: { name?: string | null; brand?: string | null },
  tokens: string[]
): boolean {
  if (tokens.length === 0) return true;
  const texto = `${product.name ?? ""} ${product.brand ?? ""}`
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return tokens.every((t) => texto.includes(t));
}
