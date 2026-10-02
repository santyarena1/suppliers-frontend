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

/** Código de fabricante o interno (100-100000263BOX): las webs casi nunca lo ponen. */
function isPartNumberToken(t: string): boolean {
  return /\d{6,}/.test(t);
}

const hasLetter = (t: string) => /[a-z]/i.test(t);

/**
 * Tokens que importan para encontrar el producto en la web propia. Sin códigos
 * de fabricante, y si hay un modelo con letras (5700G, A520M) los números
 * sueltos (100, 3377) no son obligatorios: antes un "(100-100000263BOX)" en el
 * nombre del distribuidor hacía que no se encontrara nada.
 */
export function ownStoreTokens(name: string): ScoredToken[] {
  const tokens = extractSearchTokens(name, 10).filter((t) => !isPartNumberToken(t.t));
  const mixedModel = tokens.some((t) => isModelSkuToken(t.t) && hasLetter(t.t));
  return tokens
    .filter((t) => !(mixedModel && /^\d+$/.test(t.t) && isModelSkuToken(t.t)))
    .slice(0, 8);
}

/** Plan de búsqueda acotado a una sola tienda. `null` si el nombre no aporta tokens. */
export function ownStoreSearchPlan(name: string): OwnStoreSearchPlan | null {
  const tokens = ownStoreTokens(name);
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
  // Mismo modelo (todos los SKU) y marca/línea: las palabras de más del
  // distribuidor ("65W WRAITH STEALTH", "16MB 4.6GHz") no lo vuelven dudoso.
  if (match.skuTotal > 0 && match.strongHits >= 2) return true;
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
  const tokens = ownStoreTokens(query);
  if (tokens.length === 0 || rows.length === 0) return null;
  const queryModels = new Set(tokens.filter((t) => isModelSkuToken(t.t)).map((t) => t.t));
  const queryIsBundle = /\b(combo|kit|pack)\b/.test(normalizeSearchText(query));

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
    confident: isConfidentOwnStoreMatch(best.match) && !isDifferentProduct(best.row, queryModels, queryIsBundle),
  };
}

/**
 * La web tiene otro producto aunque comparta el modelo: un combo cuando se busca
 * el procesador solo, o un modelo con letras de más (B550M en un combo).
 */
function isDifferentProduct(row: OwnStoreMatchRow, queryModels: Set<string>, queryIsBundle: boolean): boolean {
  const text = row.searchText || normalizeSearchText(row.name);
  if (!queryIsBundle && /\b(combo|kit|pack)\b/.test(text)) return true;
  return extractSearchTokens(text, 14).some(
    (p) => isModelSkuToken(p.t) && hasLetter(p.t) && !isPartNumberToken(p.t) && !queryModels.has(p.t)
  );
}
