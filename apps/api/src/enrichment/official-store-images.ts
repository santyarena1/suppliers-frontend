import { gtin14 } from "./keys";
import { compactCode } from "./sources/manufacturers/common";
import { ShopifyProduct, shopifyHandleFrom, shopifyImagesFor, shopifyVariantFor } from "./sources/manufacturers/shopify";

/** Tiendas oficiales (Shopify) cuyas fichas linkean las listas de los proveedores. */
export const OFFICIAL_STORES = [
  { source: "aula", origin: "https://aulagaming.com.ar" },
  { source: "irok", origin: "https://irokgaming.com.ar" },
  { source: "atk", origin: "https://atkgaming.com.ar" },
] as const;

export type OfficialStore = (typeof OFFICIAL_STORES)[number];

export const OFFICIAL_STORE_HOSTS = OFFICIAL_STORES.map((s) => new URL(s.origin).host);

/** La tienda y el producto (handle) de un link de la lista, o `null` si no es de una tienda oficial. */
export function officialStoreLink(url: string | null | undefined): { store: OfficialStore; handle: string } | null {
  for (const store of OFFICIAL_STORES) {
    const handle = shopifyHandleFrom(url, store.origin);
    if (handle) return { store, handle };
  }
  return null;
}

/** Códigos de modelo del nombre (tokens con letras y números: F75, N9, S99…). */
function modelCodes(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/[^A-Za-z0-9]+/)
    .map(compactCode)
    .filter((t) => t.length >= 2 && /\d/.test(t) && /[A-Z]/.test(t));
}

/**
 * El link de la lista apunta a este producto: si el nombre trae códigos de
 * modelo, al menos uno está en el título de la tienda. Corta links copiados mal.
 */
export function linkMatchesName(product: ShopifyProduct, name: string): boolean {
  const codes = modelCodes(name);
  if (codes.length === 0) return true;
  const title = new Set(modelCodes(product.title));
  const compactTitle = compactCode(product.title);
  return codes.some((c) => title.has(c) || compactTitle.includes(c));
}

export interface OfficialImagePick {
  images: string[];
  /** Por qué esas fotos (o por qué ninguna). */
  note: string;
}

/**
 * Fotos de la tienda oficial para un producto de la lista. Solo las de su
 * variante (color, idioma, switch): por código de barras (EAN) o, si no, por
 * las palabras de la variante en el nombre cuando es la única que encaja.
 * Si hay duda, ninguna: mejor sin foto que con la de otro color.
 */
export function pickOfficialImages(product: ShopifyProduct, item: { name: string; ean: string | null }): OfficialImagePick {
  if (!linkMatchesName(product, item.name)) {
    return { images: [], note: `el link de la lista lleva a «${product.title ?? "?"}», que no coincide con el nombre` };
  }
  const variants = product.variants ?? [];
  const gtin = gtin14(item.ean);
  const variant = shopifyVariantFor(product, {
    brandKey: null,
    brand: null,
    partNumber: null,
    pnKey: null,
    gtin,
    name: item.name,
    hints: [],
  });
  const images = shopifyImagesFor(product, variant);
  if (variants.length <= 1) return { images, note: images.length ? "producto de una sola variante" : "la ficha no tiene fotos" };
  if (!variant) return { images: [], note: "no se pudo identificar la variante (color) con certeza" };
  const how = gtin && variant.barcode && gtin14(variant.barcode) === gtin ? "EAN" : "nombre";
  return images.length
    ? { images, note: `variante «${variant.title ?? "?"}» por ${how}` }
    : { images: [], note: `la variante «${variant.title ?? "?"}» no tiene foto propia` };
}
