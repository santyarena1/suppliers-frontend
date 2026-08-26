/** Ficha sin foto usable: null, vacío o solo espacios. */
export function hasProductImage(url?: string | null): boolean {
  return Boolean(url?.trim());
}

/**
 * Si el proveedor trae foto, gana. Si no trae, se conserva la que ya había
 * (p. ej. la que cargó “Primera foto”), para que el cron no la borre.
 */
export function mergeProductImage(
  incoming?: string | null,
  previous?: string | null
): string | null {
  const next = incoming?.trim() ?? "";
  if (next) return next;
  const keep = previous?.trim() ?? "";
  return keep || null;
}

export type ImageQueryProduct = {
  name?: string | null;
  brand?: string | null;
  ean?: string | null;
  partNumber?: string | null;
  sku?: string | null;
};

/** Texto para Serper: marca + nombre + código (EAN / part number / SKU). */
export function buildImageSearchQuery(product: ImageQueryProduct): string {
  const brand = product.brand?.trim() ?? "";
  const name = product.name?.trim() ?? "";
  let q = [brand, name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const code = (product.ean || product.partNumber || product.sku || "").trim();
  if (code.length >= 5 && !q.toLowerCase().includes(code.toLowerCase())) {
    q = `${q} ${code}`.trim();
  }
  return q.slice(0, 220);
}

const HTTP_URL = /^https?:\/\//i;

export type SerperImageHit = {
  imageUrl: string;
  thumbnailUrl: string | null;
  title: string | null;
  source: string | null;
};

function firstHttp(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && HTTP_URL.test(value.trim())) return value.trim();
  }
  return null;
}

export function pickSerperImages(payload: unknown, max = 10): SerperImageHit[] {
  const rec = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const images = rec && Array.isArray(rec.images) ? rec.images : [];
  const out: SerperImageHit[] = [];
  const seen = new Set<string>();
  for (const raw of images) {
    if (!raw || typeof raw !== "object") continue;
    const img = raw as Record<string, unknown>;
    const imageUrl = firstHttp(img.imageUrl, img.image_url, img.thumbnailUrl, img.link);
    if (!imageUrl || seen.has(imageUrl)) continue;
    seen.add(imageUrl);
    out.push({
      imageUrl,
      thumbnailUrl: firstHttp(img.thumbnailUrl, img.thumbnail_url, imageUrl),
      title: typeof img.title === "string" ? img.title : null,
      source: typeof img.source === "string" ? img.source : typeof img.domain === "string" ? img.domain : null,
    });
    if (out.length >= max) break;
  }
  return out;
}

export function pickFirstImageUrl(payload: unknown): string | null {
  return pickSerperImages(payload, 1)[0]?.imageUrl ?? null;
}
