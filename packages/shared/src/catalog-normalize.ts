/** Normaliza un texto de marca/categoría para comparación (sin acentos, minúsculas, sin símbolos). */
export function normalizeCatalogKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[®™©]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Slug URL-safe desde un nombre de catálogo. */
export function slugifyCatalog(value: string): string {
  const key = normalizeCatalogKey(value).replace(/\s+/g, "-");
  return key.replace(/^-+|-+$/g, "") || "sin-nombre";
}

/** Título legible conservando el original cuando es razonable. */
export function catalogDisplayName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  if (trimmed.length <= 3 || trimmed === trimmed.toUpperCase()) return trimmed;
  return trimmed;
}
