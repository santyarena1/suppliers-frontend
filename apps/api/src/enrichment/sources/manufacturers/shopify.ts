import { gtin14, modelTokens, pnKey } from "../../keys";
import { stripHtml } from "../icecat";
import { emptyResult, LookupQuery, ManufacturerConnector, SourceFetcher, SourceResult } from "../types";
import { acceptedCodes, compactCode, https, searchTerms } from "./common";

interface ShopifySuggestProduct {
  title?: string;
  handle?: string;
  url?: string;
}

export interface ShopifyVariant {
  id?: number;
  title?: string;
  sku?: string | null;
  barcode?: string | null;
  options?: string[];
  featured_image?: { src?: string | null } | null;
}

export interface ShopifyProduct {
  title?: string;
  handle?: string;
  vendor?: string;
  type?: string;
  description?: string;
  images?: string[];
  url?: string;
  variants?: ShopifyVariant[];
}

export function shopifySuggestUrl(origin: string, term: string): string {
  return `${origin}/search/suggest.json?q=${encodeURIComponent(term)}&resources%5Btype%5D=product&resources%5Blimit%5D=4`;
}

export function parseShopifySuggest(body: unknown): ShopifySuggestProduct[] {
  const products = (body as { resources?: { results?: { products?: ShopifySuggestProduct[] } } } | null)?.resources?.results?.products;
  return Array.isArray(products) ? products : [];
}

/**
 * Coincide si una variante tiene el mismo SKU (part number) o el mismo código
 * de barras, o si el título trae como token el mismo código de modelo
 * ("COBRA M711" sí, "COBRA-FPS M711-FPS" no).
 */
export function shopifyMatch(p: ShopifyProduct, q: LookupQuery): string | null {
  for (const v of p.variants ?? []) {
    if (q.pnKey && v.sku && pnKey(v.sku) === q.pnKey) return `SKU ${v.sku} coincide`;
    if (q.gtin && v.barcode && gtin14(v.barcode) === q.gtin) return `código de barras ${v.barcode} coincide`;
  }
  const codes = acceptedCodes(q);
  const titleToken = modelTokens(p.title).find((t) => codes.has(compactCode(t)));
  return titleToken ? `modelo ${titleToken} en el título` : null;
}

/** Colores e idiomas que las listas escriben en inglés y las tiendas en español (o al revés). */
const WORD_ALIASES: Record<string, string> = {
  black: "negro", negra: "negro",
  white: "blanco", blanca: "blanco",
  pink: "rosa", rosado: "rosa",
  purple: "violeta", morado: "violeta", lila: "violeta",
  blue: "azul",
  red: "rojo", roja: "rojo",
  green: "verde",
  grey: "gris", gray: "gris",
  yellow: "amarillo", amarilla: "amarillo",
  orange: "naranja",
  beige: "beige",
  english: "ingles", us: "ingles",
  spanish: "espanol", esp: "espanol", es: "espanol",
  sw: "switch", switches: "switch",
};

/** Palabras de un nombre u opción, en minúscula, sin acentos y con los alias de arriba. */
export function variantWords(text: string | null | undefined): string[] {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => WORD_ALIASES[w] ?? w);
}

/**
 * La variante (color, idioma, switch) que es este producto. Primero por código
 * de barras o SKU. Si no, por las palabras de las opciones: vale solo si
 * todas las palabras de la variante están en el nombre del producto y es la
 * única variante que cumple. Si hay duda, ninguna.
 */
export function shopifyVariantFor(p: ShopifyProduct, q: LookupQuery): ShopifyVariant | null {
  const variants = p.variants ?? [];
  if (variants.length === 0) return null;
  const byCode =
    (q.gtin ? variants.find((v) => v.barcode && gtin14(v.barcode) === q.gtin) : undefined) ??
    (q.pnKey ? variants.find((v) => v.sku && pnKey(v.sku) === q.pnKey) : undefined);
  if (byCode) return byCode;
  if (variants.length === 1) return variants[0];

  const nameWords = new Set(variantWords(q.name));
  const fits = variants.filter((v) => {
    const words = (v.options?.length ? v.options : [v.title ?? ""]).flatMap((o) => variantWords(o));
    return words.length > 0 && words.every((w) => nameWords.has(w));
  });
  return fits.length === 1 ? fits[0] : null;
}

/**
 * Fotos de esa variante, nunca las de otro color.
 * - Producto de una sola variante: todas las fotos.
 * - Varias variantes: la foto propia de la variante y, si la galería está
 *   ordenada por variante (cada una con su foto, en orden), las que siguen
 *   hasta la foto de la próxima variante.
 * - Sin variante identificada o sin foto propia: ninguna (mejor sin foto que con la de otro color).
 */
export function shopifyImagesFor(p: ShopifyProduct, variant: ShopifyVariant | null): string[] {
  const all = [...new Set((p.images ?? []).map(https))];
  const variants = p.variants ?? [];
  if (variants.length <= 1) return all;
  const own = variant?.featured_image?.src ? https(variant.featured_image.src) : null;
  if (!own) return [];

  const featured = variants.map((v) => (v.featured_image?.src ? https(v.featured_image.src) : null));
  const positions = featured.map((src) => (src ? all.indexOf(src) : -1));
  const distinct = new Set(featured).size === featured.length;
  const ordered = positions.every((pos, i) => pos >= 0 && (i === 0 || pos > positions[i - 1]));
  if (!distinct || !ordered) return [own];

  const start = all.indexOf(own);
  const next = positions.filter((pos) => pos > start).sort((a, b) => a - b)[0] ?? all.length;
  return all.slice(start, next);
}

export function shopifyResult(
  source: string,
  origin: string,
  brand: string,
  p: ShopifyProduct,
  note: string,
  q?: LookupQuery
): SourceResult {
  const description = p.description ? stripHtml(p.description) : null;
  const variant = q ? shopifyVariantFor(p, q) : (p.variants ?? []).length === 1 ? p.variants![0] : null;
  const images = shopifyImagesFor(p, variant);
  const multi = (p.variants ?? []).length > 1;
  return {
    ...emptyResult(source, "manufacturer"),
    url: p.handle ? `${origin}/products/${p.handle}${variant?.id && multi ? `?variant=${variant.id}` : ""}` : null,
    title: p.title ?? null,
    brand,
    partNumber: variant?.sku ?? p.variants?.find((v) => v.sku)?.sku ?? null,
    gtins: (variant ? [variant] : p.variants ?? []).map((v) => gtin14(v.barcode)).filter((g): g is string => !!g),
    images: images.map((url) => ({ url })),
    description: description && description.length >= 60 ? description.slice(0, 2000) : null,
    category: p.type ?? null,
    verified: true,
    matchNote: multi
      ? `${note}; ${variant ? `variante «${variant.title}»` : "sin variante identificada: sin fotos"}`
      : note,
  };
}

/** Handle de un link a la misma tienda ("…/products/teclado-aula-f75?x=1" → "teclado-aula-f75"). */
export function shopifyHandleFrom(url: string | null | undefined, origin: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = (h: string) => h.replace(/^www\./, "").toLowerCase();
    if (host(u.host) !== host(new URL(origin).host)) return null;
    const m = u.pathname.match(/\/products\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Tiendas oficiales en Shopify. Si la lista del proveedor trae el link a la
 * ficha de la tienda, se va directo a ese producto; si no, buscador
 * `suggest.json` + `/products/<handle>.js`.
 */
export function makeShopifyConnector(source: string, origin: string, brand: string, brandKeys: string[]): ManufacturerConnector {
  return {
    source,
    brandKeys,
    async lookup(q: LookupQuery, fetcher: SourceFetcher): Promise<SourceResult | null> {
      const tried = new Set<string>();
      const tryHandle = async (handle: string): Promise<SourceResult | null> => {
        if (tried.has(handle)) return null;
        tried.add(handle);
        const prod = await fetcher(source, `${origin}/products/${handle}.js`, { json: true });
        if (prod.status !== 200 || !prod.body) return null;
        const product = prod.body as ShopifyProduct;
        const note = shopifyMatch(product, q);
        return note ? shopifyResult(source, origin, brand, product, note, q) : null;
      };

      for (const url of q.productUrls ?? []) {
        const handle = shopifyHandleFrom(url, origin);
        const found = handle ? await tryHandle(handle) : null;
        if (found) return found;
      }
      for (const term of searchTerms(q)) {
        const res = await fetcher(source, shopifySuggestUrl(origin, term), { json: true });
        if (res.status !== 200) continue;
        for (const hit of parseShopifySuggest(res.body).slice(0, 3)) {
          if (!hit.handle) continue;
          const found = await tryHandle(hit.handle);
          if (found) return found;
        }
      }
      return null;
    },
  };
}

export const hyperxConnector = makeShopifyConnector("hyperx", "https://hyperx.com", "HyperX", ["hyperx"]);
export const redragonConnector = makeShopifyConnector("redragon", "https://redragonshop.com", "Redragon", ["redragon"]);
/** Aula, IROK y ATK: tiendas oficiales en Argentina (links de la lista gremio de Aula). */
export const aulaConnector = makeShopifyConnector("aula", "https://aulagaming.com.ar", "Aula", ["aula"]);
export const irokConnector = makeShopifyConnector("irok", "https://irokgaming.com.ar", "IROK", ["irok"]);
export const atkConnector = makeShopifyConnector("atk", "https://atkgaming.com.ar", "ATK", ["atk"]);
