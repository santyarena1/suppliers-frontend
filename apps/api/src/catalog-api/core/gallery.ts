/**
 * Galería del producto tal como la manda el distribuidor. La ficha guarda solo
 * la foto principal en `imageUrl`; el resto queda en los datos crudos:
 * Elit `imagenes: string[]`, Grupo Núcleo `url_imagenes: {url}[]`,
 * Distecna y Polytech `images: string[]`, Ceven `itemimages_detail: { urls: {url}[] }`,
 * y otros con nombres parecidos.
 */
const GALLERY_KEY = /^(imagenes|images|url_imagenes|imagenes_url|itemimages_detail|gallery|galeria|pictures|fotos|photos)$/i;
/** Algunos distribuidores envuelven la lista en un objeto. */
const NESTED_LIST_KEYS = ["urls", "images", "items", "list"] as const;
const URL_KEYS = ["url", "src", "href", "link", "imageUrl", "image_url"] as const;
const MAX_IMAGES = 20;

function asUrl(value: unknown): string | null {
  if (typeof value === "string") {
    const v = value.trim();
    // Ceven publica rutas con espacios: se codifican para que la URL sea válida.
    return /^https?:\/\//i.test(v) ? v.replace(/ /g, "%20") : null;
  }
  if (value && typeof value === "object") {
    for (const key of URL_KEYS) {
      const url = asUrl((value as Record<string, unknown>)[key]);
      if (url) return url;
    }
  }
  return null;
}

function listOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of NESTED_LIST_KEYS) {
    const inner = (value as Record<string, unknown>)[key];
    if (Array.isArray(inner)) return inner;
  }
  return [];
}

/** Todas las fotos de la galería del distribuidor, sin repetir y en su orden. */
export function galleryFromRaw(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!GALLERY_KEY.test(key)) continue;
    for (const item of listOf(value)) {
      const url = asUrl(item);
      if (url && !out.includes(url)) out.push(url);
      if (out.length >= MAX_IMAGES) return out;
    }
  }
  return out;
}

/** Foto principal primero y después el resto de la galería, sin repetir. */
export function imagesOf(row: { imageUrl: string | null; gallery: string[] }): string[] {
  const main = row.imageUrl ? asUrl(row.imageUrl) ?? row.imageUrl : null;
  const all = main ? [main, ...row.gallery] : row.gallery;
  return [...new Set(all)];
}
