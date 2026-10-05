import type { ProductView } from "../core/projection";
import { validGtin } from "../core/ids";
import { csvLine } from "./export-format";

/**
 * Feeds de producto para Google Merchant Center (RSS 2.0 con `g:`) y para el
 * catálogo de Meta (CSV). Un producto entra si tiene precio de venta y foto
 * (los dos los exigen).
 */

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Link del producto en la tienda del comercio, desde su plantilla. */
export function productLink(template: string, p: ProductView): string {
  const values: Record<string, string> = {
    id: p.id,
    sku: p.sku ?? "",
    ean: p.ean ?? "",
    partNumber: p.partNumber ?? "",
    slug: slugify(p.name),
  };
  return template.replace(/\{(id|sku|ean|partNumber|slug)\}/g, (_m, key: string) => encodeURIComponent(values[key] ?? ""));
}

function xml(text: string | number | null | undefined): string {
  return String(text ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  image: string;
  extraImages: string[];
  availability: "in_stock" | "out_of_stock";
  price: string;
  brand: string | null;
  gtin: string | null;
  mpn: string | null;
  productType: string | null;
}

export function feedItem(p: ProductView, template: string): FeedItem | null {
  const sale = p.bestOffer?.price?.sale?.gross;
  const currency = p.bestOffer?.price?.currency;
  const image = p.images[0]?.url;
  if (sale == null || !currency || !image) return null;
  return {
    id: p.id,
    title: p.name.slice(0, 150),
    description: (p.longDescription || p.description || p.name).slice(0, 5000),
    link: productLink(template, p),
    image,
    extraImages: p.images.slice(1, 11).map((i) => i.url),
    availability: p.availability.inStock ? "in_stock" : "out_of_stock",
    price: `${sale.toFixed(2)} ${currency}`,
    brand: p.brand?.name ?? null,
    // Google rechaza un GTIN con el dígito verificador mal: mejor sin GTIN que uno inválido.
    gtin: p.ean && validGtin(p.ean) ? p.ean : null,
    mpn: p.partNumber,
    productType: p.subcategory?.path.join(" > ") ?? p.category?.path.join(" > ") ?? null,
  };
}

export function googleFeedHeader(title: string, link: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n<channel>\n<title>${xml(title)}</title>\n<link>${xml(link)}</link>\n<description>Catálogo de ${xml(title)} generado por NODO</description>\n`;
}

export const GOOGLE_FEED_FOOTER = "</channel>\n</rss>\n";

export function googleFeedItem(item: FeedItem): string {
  const tag = (name: string, value: string | null) => (value ? `<g:${name}>${xml(value)}</g:${name}>` : "");
  return [
    "<item>",
    tag("id", item.id),
    `<title>${xml(item.title)}</title>`,
    `<description>${xml(item.description)}</description>`,
    `<link>${xml(item.link)}</link>`,
    tag("image_link", item.image),
    ...item.extraImages.map((url) => tag("additional_image_link", url)),
    tag("availability", item.availability),
    tag("price", item.price),
    tag("condition", "new"),
    tag("brand", item.brand),
    tag("gtin", item.gtin),
    tag("mpn", item.mpn),
    !item.gtin && !item.mpn ? tag("identifier_exists", "no") : "",
    tag("product_type", item.productType),
    "</item>\n",
  ]
    .filter(Boolean)
    .join("");
}

export const META_COLUMNS = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand", "gtin", "mpn"];

export function metaFeedLine(item: FeedItem): string {
  return csvLine(
    [
      item.id,
      item.title,
      item.description,
      item.availability === "in_stock" ? "in stock" : "out of stock",
      "new",
      item.price,
      item.link,
      item.image,
      item.brand,
      item.gtin,
      item.mpn,
    ],
    ","
  );
}
