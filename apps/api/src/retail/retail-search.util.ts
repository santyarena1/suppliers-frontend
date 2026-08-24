/** Normaliza texto para búsqueda amplia (sin acentos, minúsculas, limpio). */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const STOPWORDS = new Set([
  "a", "al", "con", "de", "del", "el", "en", "la", "las", "los", "para", "por",
  "un", "una", "y", "o", "the", "of", "and", "or", "gb", "tb", "ssd", "hdd",
  "ddr", "ddr4", "ddr5", "gen", "gen4", "gen5", "pack", "kit", "caja", "box",
  "producto", "original", "nuevo", "new", "p", "amd", "intel",
]);

/** Tokens genéricos: suman poco y solos no deberían abrir el pool. */
const WEAK_TOKENS = new Set([
  ...STOPWORDS,
  "cooler", "fan", "cpu", "gpu", "pc", "rgb", "argb", "led", "lcd",
  "potencia", "max", "mini", "plus", "pro", "ultra", "super",
  "black", "white", "blanco", "negro", "wht", "version", "ver",
  "v1", "v2", "v3", "v4", "mm", "watt", "watts", "sync", "ex",
  "gabinete", "case", "tower", "water", "liquid", "aire", "air",
]);

export type ScoredToken = { t: string; strong: boolean };

/** Tokens útiles; marca fuertes (marca/modelo) vs débiles (categoría/genéricos). */
export function extractSearchTokens(value: string, max = 10): ScoredToken[] {
  const normalized = normalizeSearchText(value);
  const raw = normalized.split(" ").filter(Boolean);

  const scored = raw
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .map((t) => {
      const strong =
        !WEAK_TOKENS.has(t) &&
        (t.length >= 4 || /^\d/.test(t) || /[a-z]+\d|\d+[a-z]/i.test(t));
      const rank = strong ? (/^\d/.test(t) ? 4 : t.length >= 6 ? 3 : 2) : 1;
      return { t, strong, rank };
    })
    .sort((a, b) => b.rank - a.rank || b.t.length - a.t.length);

  const seen = new Set<string>();
  const out: ScoredToken[] = [];
  for (const { t, strong } of scored) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push({ t, strong });
    if (out.length >= max) break;
  }
  return out;
}

export interface MatchScore {
  score: number;
  hits: number;
  strongHits: number;
  strongTotal: number;
  coverage: number;
}

/** Score de un producto vs tokens de la query. */
export function scoreRetailMatch(searchText: string, tokens: ScoredToken[]): MatchScore {
  const text = searchText || "";
  const strong = tokens.filter((x) => x.strong);
  const weak = tokens.filter((x) => !x.strong);

  let score = 0;
  let hits = 0;
  let strongHits = 0;

  for (const { t, strong: isStrong } of tokens) {
    if (!text.includes(t)) continue;
    hits += 1;
    if (isStrong) {
      strongHits += 1;
      score += t.length >= 6 || /^\d/.test(t) ? 8 : 5;
    } else {
      score += 1;
    }
  }

  // Bigramas consecutivos de la query (marca + modelo)
  const rawTokens = tokens.map((x) => x.t);
  for (let i = 0; i < rawTokens.length - 1; i++) {
    const bigram = `${rawTokens[i]} ${rawTokens[i + 1]}`;
    if (text.includes(bigram)) score += 10;
  }

  if (hits >= 2) score += hits * 2;
  if (hits >= 3) score += 4;
  if (strongHits >= 2) score += strongHits * 4;
  if (strong.length > 0 && strongHits === strong.length) score += 12;

  const coverage = tokens.length ? hits / tokens.length : 0;
  return {
    score,
    hits,
    strongHits,
    strongTotal: strong.length,
    coverage,
  };
}

/**
 * ¿Pasa el umbral de relevancia?
 * Exigimos señal de marca/modelo sin matar coincidencias parciales.
 */
export function passesRelevanceGate(m: MatchScore, tokens: ScoredToken[]): boolean {
  if (tokens.length === 0 || m.hits === 0) return false;

  const strong = tokens.filter((t) => t.strong);
  if (strong.length >= 2) {
    // Al menos 1 fuerte + algo más, o 2 fuertes
    if (m.strongHits >= 2) return true;
    if (m.strongHits >= 1 && m.hits >= 3) return true;
    if (m.strongHits >= 1 && m.coverage >= 0.45) return true;
    return false;
  }

  if (strong.length === 1) {
    return m.strongHits >= 1 && (m.hits >= 2 || tokens.length <= 2);
  }

  const needHits = tokens.length >= 3 ? Math.ceil(tokens.length * 0.5) : Math.max(1, tokens.length - 1);
  return m.hits >= needHits;
}
