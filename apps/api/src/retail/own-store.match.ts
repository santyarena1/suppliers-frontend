import {
  extractSearchTokens,
  isModelSkuToken,
  normalizeSearchText,
  passesRelevanceGate,
  scoreRetailMatch,
  type MatchScore,
  type ScoredToken,
} from "./retail-search.util";
import { coerceStoredRetailPrice, isSaneRetailPrice } from "./retail-price.util";

export interface OwnStoreSearchPlan {
  tokens: ScoredToken[];
  /** Si hay SKU de modelo, el pool tiene que contenerlos todos. */
  skuTokens: string[];
  /** Si no hay SKU, cualquiera de estos tokens abre el pool. */
  orTokens: string[];
}

export interface OwnStoreMatchRow {
  id: string;
  name: string;
  searchText: string;
  price: number;
  productUrl: string | null;
  imageUrl: string | null;
  syncedAt: Date;
  currency: string;
}

export interface OwnStorePriceContext {
  name: string;
  externalId: number;
  priceDivisor: number;
}

export interface OwnStoreMatch {
  productId: string;
  name: string;
  price: number;
  currency: string;
  productUrl: string | null;
  imageUrl: string | null;
  syncedAt: string;
  coverage: number;
  confident: boolean;
}

/** Plan de búsqueda acotado a una sola tienda. `null` si el nombre no aporta tokens. */
export function ownStoreSearchPlan(name: string): OwnStoreSearchPlan | null {
  const tokens = extractSearchTokens(name, 8);
  if (tokens.length === 0) return null;
  const skuTokens = [...new Set(tokens.filter((t) => isModelSkuToken(t.t)).map((t) => t.t))];
  const strong = tokens.filter((t) => t.strong).map((t) => t.t);
  const orTokens = [...new Set([...strong, ...tokens.slice(0, 4).map((t) => t.t)])];
  return { tokens, skuTokens, orTokens };
}

/**
 * La card solo muestra el margen cuando el título de la web parece el mismo
 * producto. La ficha puede mostrar un match más flojo, marcado como aproximado.
 */
export function isConfidentOwnStoreMatch(match: MatchScore): boolean {
  if (match.hits < 1) return false;
  if (match.skuTotal > 0 && match.skuHits < match.skuTotal) return false;
  if (match.strongTotal >= 2 && match.strongHits < match.strongTotal) return false;
  if (match.coverage < 0.5) return false;
  return match.strongHits >= 1 || match.hits >= 2;
}

/** Elige el mejor producto de la tienda propia que pasa el filtro de relevancia. */
export function pickOwnStoreMatch(
  rows: OwnStoreMatchRow[],
  query: string,
  store: OwnStorePriceContext
): OwnStoreMatch | null {
  const tokens = extractSearchTokens(query, 8);
  if (tokens.length === 0 || rows.length === 0) return null;

  let best: { row: OwnStoreMatchRow; match: MatchScore; price: number } | null = null;
  for (const row of rows) {
    const text = row.searchText || normalizeSearchText(row.name);
    const match = scoreRetailMatch(text, tokens);
    if (!passesRelevanceGate(match, tokens)) continue;
    const price = coerceStoredRetailPrice(row.price, store.priceDivisor ?? 1, {
      storeName: store.name,
      storeExternalId: store.externalId,
    });
    if (!isSaneRetailPrice(price)) continue;
    if (
      !best ||
      match.score > best.match.score ||
      (match.score === best.match.score && price < best.price)
    ) {
      best = { row, match, price };
    }
  }
  if (!best) return null;

  return {
    productId: best.row.id,
    name: best.row.name,
    price: best.price,
    currency: best.row.currency || "ARS",
    productUrl: best.row.productUrl,
    imageUrl: best.row.imageUrl,
    syncedAt: best.row.syncedAt.toISOString(),
    coverage: best.match.coverage,
    confident: isConfidentOwnStoreMatch(best.match),
  };
}
