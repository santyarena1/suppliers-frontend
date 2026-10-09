import { gtin14, modelTokens, pnKey } from "../../keys";
import { stripHtml } from "../icecat";
import { emptyResult, LookupQuery, ManufacturerConnector, SourceFetcher, SourceResult } from "../types";
import { acceptedCodes, compactCode, https, searchTerms } from "./common";

interface ShopifySuggestProduct {
  title?: string;
  handle?: string;
  url?: string;
}

export interface ShopifyProduct {
  title?: string;
  handle?: string;
  vendor?: string;
  type?: string;
  description?: string;
  images?: string[];
  url?: string;
  variants?: { sku?: string | null; barcode?: string | null; title?: string }[];
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

export function shopifyResult(source: string, origin: string, brand: string, p: ShopifyProduct, note: string): SourceResult {
  const description = p.description ? stripHtml(p.description) : null;
  return {
    ...emptyResult(source, "manufacturer"),
    url: p.handle ? `${origin}/products/${p.handle}` : null,
    title: p.title ?? null,
    brand,
    partNumber: p.variants?.find((v) => v.sku)?.sku ?? null,
    gtins: (p.variants ?? []).map((v) => gtin14(v.barcode)).filter((g): g is string => !!g),
    images: [...new Set((p.images ?? []).map(https))].map((url) => ({ url })),
    description: description && description.length >= 60 ? description.slice(0, 2000) : null,
    category: p.type ?? null,
    verified: true,
    matchNote: note,
  };
}

/** Tiendas oficiales en Shopify: buscador `suggest.json` + `/products/<handle>.js`. */
export function makeShopifyConnector(source: string, origin: string, brand: string, brandKeys: string[]): ManufacturerConnector {
  return {
    source,
    brandKeys,
    async lookup(q: LookupQuery, fetcher: SourceFetcher): Promise<SourceResult | null> {
      const tried = new Set<string>();
      for (const term of searchTerms(q)) {
        const res = await fetcher(source, shopifySuggestUrl(origin, term), { json: true });
        if (res.status !== 200) continue;
        for (const hit of parseShopifySuggest(res.body).slice(0, 3)) {
          if (!hit.handle || tried.has(hit.handle)) continue;
          tried.add(hit.handle);
          const prod = await fetcher(source, `${origin}/products/${hit.handle}.js`, { json: true });
          if (prod.status !== 200 || !prod.body) continue;
          const product = prod.body as ShopifyProduct;
          const note = shopifyMatch(product, q);
          if (note) return shopifyResult(source, origin, brand, product, note);
        }
      }
      return null;
    },
  };
}

export const hyperxConnector = makeShopifyConnector("hyperx", "https://hyperx.com", "HyperX", ["hyperx"]);
export const redragonConnector = makeShopifyConnector("redragon", "https://redragonshop.com", "Redragon", ["redragon"]);
