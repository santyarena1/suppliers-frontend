import type { NormalizedProduct } from "./types";
import { decodeEntities, stripTags } from "./html-table";

/** Subcategoría del menú del portal: cada una es un listado paginado. */
export interface NewTreeCategory {
  slug: string;
  catId: string;
  scatId: string;
  name: string;
  categoryName: string;
}

export interface NewTreeListingItem {
  itemId: string;
  name: string;
  productUrl?: string;
  imageUrl?: string;
  ean?: string;
  /** Precio mostrado: final con IVA incluido. */
  finalPrice?: number;
  currency?: string;
  ivaPercent?: number;
  /** semaforo1 = sin stock; el resto se considera disponible. */
  semaforo?: number;
}

export interface NewTreeDetail {
  name?: string;
  ean?: string;
  partNumber?: string;
  brand?: string;
  ivaPercent?: number;
  finalPrice?: number;
  currency?: string;
  description?: string;
  longDescription?: string;
  imageUrls: string[];
}

const SEMAFORO_OUT_OF_STOCK = 1;
const IVA_DEFAULT_PERCENT = 21;

export function listingPath(cat: NewTreeCategory | null, page: number): string {
  if (!cat) return `/ARTICULOS/m=0/BUS=;/A_PAGENUMBER=${page}/newtree.aspx`;
  return `/ARTICULOS/${cat.slug}/CAT_ID=${cat.catId}/SCAT_ID=${cat.scatId}/m=0/BUS=;/A_PAGENUMBER=${page}/newtree.aspx`;
}

export function detailPath(itemId: string): string {
  return `/DETALLE/producto/ITEM_ID=${itemId}/newtree.aspx`;
}

/** "USD 22,50" → { amount: 22.5, currency: "USD" }. Formato argentino (coma decimal). */
export function parseMoney(text: string): { amount: number; currency?: string } | null {
  const m = text.replace(/\s+/g, " ").match(/(USD|U\$S|ARS|\$)?\s*(-?[\d.]+,\d{1,4}|-?\d+)/i);
  if (!m) return null;
  const n = Number(m[2].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const tag = m[1]?.toUpperCase();
  const currency = tag ? (tag === "$" || tag === "ARS" ? "ARS" : "USD") : undefined;
  return { amount: n, currency };
}

function parseIva(text: string): number | undefined {
  const m = text.match(/IVA\s*([\d]+(?:[.,]\d+)?)\s*%/i);
  if (!m) return undefined;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function attr(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`${name}=["']([^"']*)["']`, "i"));
  return m ? decodeEntities(m[1]) : undefined;
}

/**
 * Menú de categorías del HOME: los `<a>` con SCAT_ID son subcategorías; los
 * que traen solo CAT_ID dan el nombre de la categoría madre.
 */
export function parseCategoryNav(html: string): NewTreeCategory[] {
  const anchorRe = /<a\b[^>]*href=["']([^"']*ARTICULOS\/[^"']*\/CAT_ID=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const parents = new Map<string, string>();
  const subs = new Map<string, NewTreeCategory>();
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    const href = m[1];
    const catId = m[2];
    const label = stripTags(m[3]);
    const scat = href.match(/SCAT_ID=(\d+)/i);
    if (!scat) {
      if (label && !parents.has(catId)) parents.set(catId, label);
      continue;
    }
    const slug = href.match(/ARTICULOS\/([^/]+)\/CAT_ID=/i)?.[1] ?? "";
    if (!slug || subs.has(scat[1])) continue;
    subs.set(scat[1], { slug, catId, scatId: scat[1], name: label, categoryName: "" });
  }
  return [...subs.values()].map((c) => ({ ...c, categoryName: parents.get(c.catId) ?? "" }));
}

/** Última página del paginador (`A_PAGENUMBER=n`). 1 si no hay paginador. */
export function parseMaxPage(html: string): number {
  let max = 1;
  const re = /A_PAGENUMBER[=:](\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) max = Math.max(max, Number(m[1]));
  return max;
}

/** Tarjetas `.product` de un listado. */
export function parseListing(html: string): NewTreeListingItem[] {
  const parts = html.split(/<div\s+class=["']product["']\s*>/i).slice(1);
  const items: NewTreeListingItem[] = [];
  for (const block of parts) {
    const idMatch = block.match(/id=["']COD(\d+)["']/i) ?? block.match(/ITEM_ID=(\d+)/i);
    if (!idMatch) continue;
    const itemId = idMatch[1];
    const title = block.match(/<a\b[^>]*class=["']titprod["'][^>]*>([\s\S]*?)<\/a>/i);
    const name = title ? stripTags(title[1]) : "";
    if (!name) continue;
    const titleAnchor = block.match(/<a\b[^>]*class=["']titprod["'][^>]*>/i)?.[0] ?? "";
    const productUrl = attr(titleAnchor, "href");
    const img = block.match(/<img\b[^>]*src=["']([^"']+)["']/i)?.[1];
    const eanFromImage = img?.match(/\/(\d{8,14})_\d+\.\w+$/)?.[1];
    const priceBlock = block.match(/<div\s+class=["']price\s+semaforo(\d)["'][^>]*>([\s\S]*?)<\/div>/i);
    const money = priceBlock ? parseMoney(stripTags(priceBlock[2])) : null;
    const ivaText = block.match(/<div\s+class=["']ivaprod["'][^>]*>([\s\S]*?)<\/div>/i);
    items.push({
      itemId,
      name,
      productUrl,
      imageUrl: img,
      ean: eanFromImage,
      finalPrice: money && money.amount > 0 ? money.amount : undefined,
      currency: money?.currency,
      ivaPercent: ivaText ? parseIva(stripTags(ivaText[1])) : undefined,
      semaforo: priceBlock ? Number(priceBlock[1]) : undefined,
    });
  }
  return items;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** El precio del portal es final (IVA incluido); el neto se deriva con la alícuota de la tarjeta. */
export function mapListingItem(item: NewTreeListingItem, cat: NewTreeCategory | null): NormalizedProduct {
  const iva = item.ivaPercent ?? IVA_DEFAULT_PERCENT;
  const finalPrice = item.finalPrice;
  const price = finalPrice != null ? round4(finalPrice / (1 + iva / 100)) : undefined;
  const outOfStock = item.semaforo === SEMAFORO_OUT_OF_STOCK;
  return {
    externalId: item.itemId,
    sku: item.itemId,
    ean: item.ean,
    name: item.name,
    category: cat?.categoryName || undefined,
    subcategory: cat?.name || undefined,
    price,
    finalPrice,
    currency: item.currency ?? (finalPrice != null ? "USD" : undefined),
    ivaPercent: finalPrice != null ? iva : item.ivaPercent,
    stock: outOfStock ? 0 : undefined,
    stockStatus: item.semaforo == null ? undefined : outOfStock ? "Sin stock" : "Disponible",
    imageUrl: item.imageUrl,
    productUrl: item.productUrl,
    raw: item,
  };
}

/** "Modelo : PROBE700B" → "PROBE700B". El label debe ir seguido de ":" y no ser parte de otra palabra (MARCAS). */
function labelValue(text: string, label: string): string | undefined {
  const re = new RegExp(
    `(?:^|[^A-Za-zÁÉÍÓÚáéíóú])${label}\\s*:\\s*([^|]+?)(?=\\s*(?:\\||C[oó]digo\\s*:|Modelo\\s*:|Marca\\s*:|Stock\\s*:|USD|ARS|$))`,
    "i"
  );
  const m = text.match(re);
  const v = m ? m[1].trim() : "";
  return v || undefined;
}

/** Ficha de producto: Código (EAN), Modelo (part number), Marca, IVA y descripción. */
export function parseDetail(html: string): NewTreeDetail {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const text = stripTags(body.replace(/<\/(h\d|p|div|li|tr)>/gi, " | ")).replace(/ |&nbsp;/g, " ");
  const name = body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const priceMatch = text.match(/(USD|ARS|\$)\s*[\d.]+,\d+\s*\|?\s*Precio Final/i);
  const money = priceMatch ? parseMoney(priceMatch[0]) : null;
  const iva = parseIva(text);
  const start = text.search(/Caracter[ií]sticas|Descripci[oó]n/i);
  const end = text.search(/Descargar Ficha|CATEGORIAS|INFORMACION/i);
  const longDescription =
    start >= 0
      ? text.slice(start, end > start ? end : start + 4000).replace(/\s*\|\s*/g, "\n").trim()
      : undefined;
  const images = [...body.matchAll(/<img\b[^>]*src=["']([^"']+_800\.\w+)["']/gi)].map((m) => decodeEntities(m[1]));
  return {
    name: name ? stripTags(name[1]) : undefined,
    ean: labelValue(text, "C[oó]digo")?.match(/\d{8,14}/)?.[0],
    partNumber: labelValue(text, "Modelo"),
    brand: labelValue(text, "Marca"),
    ivaPercent: iva,
    finalPrice: money && money.amount > 0 ? money.amount : undefined,
    currency: money?.currency,
    description: longDescription ? longDescription.split("\n").slice(0, 3).join(" ").slice(0, 500) : undefined,
    longDescription,
    imageUrls: [...new Set(images)],
  };
}
