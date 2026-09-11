/**
 * Cómo se entiende lo que el comercio escribe en el buscador.
 *
 * La búsqueda pedía que el nombre contuviera la frase entera, así que "monitor
 * msi" traía los de Elit —que se llaman exactamente así— y dejaba afuera los de
 * Air, que los nombra "MONITOR 24 MSI". Las palabras estaban todas; lo que no
 * estaba era una contra la otra, pegadas. Acá se parte la consulta en palabras y
 * se piden todas, en cualquier orden y con lo que sea en el medio.
 */

/** Las palabras que hay que encontrar. Vacío = no hay nada que buscar. */
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

/**
 * Qué tan bien le cae un producto a la búsqueda.
 *
 * Exigir todas las palabras ensancha el resultado, así que el orden pasa a
 * importar: primero lo que dice la frase tal cual, después lo que tiene las
 * palabras en el nombre —y no en la marca—, y recién ahí el resto.
 */
export function scoreCatalogMatch(
  product: { name?: string | null; brand?: string | null },
  query: string,
  tokens: string[]
): number {
  const name = (product.name ?? "").toLowerCase();
  if (!name) return 0;
  const frase = query.trim().toLowerCase();

  let score = 0;
  if (frase && name.includes(frase)) score += 100;
  for (const t of tokens) {
    if (name.includes(t)) score += 10;
  }
  // Empezar con lo buscado suele ser el producto que se tenía en la cabeza.
  if (tokens.length > 0 && name.startsWith(tokens[0])) score += 5;
  return score;
}
