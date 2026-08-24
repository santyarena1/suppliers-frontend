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
  "producto", "original", "nuevo", "new",
]);

/** Tokens útiles para búsqueda fuzzy amplia (prioriza números y palabras >2 chars). */
export function extractSearchTokens(value: string, max = 6): string[] {
  const normalized = normalizeSearchText(value);
  const raw = normalized.split(" ").filter(Boolean);
  const scored = raw
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .map((t) => ({
      t,
      score: /^\d/.test(t) ? 3 : t.length >= 5 ? 2 : 1,
    }))
    .sort((a, b) => b.score - a.score || b.t.length - a.t.length);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const { t } of scored) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
