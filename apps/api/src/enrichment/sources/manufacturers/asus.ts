import { extractPage } from "../page-extract";
import { emptyResult, LookupQuery, ManufacturerConnector, SourceFetcher, SourceResult } from "../types";
import { acceptedCodes, compactCode, lastPathSegment, searchTerms } from "./common";

const SUGGEST = "https://odinapi.asus.com/recent-data/apiv2/SearchSuggestion";

interface AsusSuggestItem {
  Url?: string;
  Title?: string;
  ImageURL?: string;
}

export function asusSuggestUrl(term: string): string {
  const params = new URLSearchParams({
    SystemCode: "asus",
    WebsiteCode: "ar",
    SearchKey: term,
    SearchType: "ProductsAll",
    RowLimit: "6",
    sitelang: "es",
  });
  return `${SUGGEST}?${params.toString()}`;
}

/** Productos de la respuesta del buscador de ASUS. */
export function parseAsusSuggest(body: unknown): AsusSuggestItem[] {
  const result = (body as { Result?: { Content?: AsusSuggestItem[] }[] } | null)?.Result;
  if (!Array.isArray(result)) return [];
  return result.flatMap((r) => (Array.isArray(r.Content) ? r.Content : []));
}

/**
 * El buscador de ASUS es difuso (con el part number 90YV... devuelve otras
 * placas), así que solo vale un resultado cuyo último segmento de URL sea
 * exactamente el código de modelo (…/DUAL-RTX5060TI-O8G/).
 */
export function pickAsusMatch(items: AsusSuggestItem[], q: LookupQuery): AsusSuggestItem | null {
  const codes = acceptedCodes(q);
  return items.find((it) => it.Url && codes.has(compactCode(lastPathSegment(it.Url)))) ?? null;
}

export function asusResultFromPage(html: string, url: string, matched: string): SourceResult {
  const page = extractPage(html, url);
  const images = [...(page.product?.images ?? []), ...(page.ogImage ? [page.ogImage] : [])];
  return {
    ...emptyResult("asus", "manufacturer"),
    url,
    title: page.ogTitle?.split("|")[0]?.trim() || page.product?.name || null,
    brand: "ASUS",
    partNumber: page.product?.name ?? null,
    images: [...new Set(images)].map((u) => ({ url: u })),
    description: page.product?.description ?? page.ogDescription,
    category: page.breadcrumbs.length > 1 ? page.breadcrumbs[page.breadcrumbs.length - 2] : null,
    verified: true,
    matchNote: `modelo ${matched} = ficha oficial`,
  };
}

export const asusConnector: ManufacturerConnector = {
  source: "asus",
  brandKeys: ["asus", "rog", "asusrog", "tuf"],
  async lookup(q: LookupQuery, fetcher: SourceFetcher): Promise<SourceResult | null> {
    for (const term of searchTerms(q)) {
      const res = await fetcher("asus", asusSuggestUrl(term), { json: true });
      if (res.status !== 200) continue;
      const match = pickAsusMatch(parseAsusSuggest(res.body), q);
      if (!match?.Url) continue;
      const page = await fetcher("asus", match.Url);
      if (page.status !== 200 || typeof page.body !== "string") continue;
      return asusResultFromPage(page.body, match.Url, lastPathSegment(match.Url));
    }
    return null;
  },
};
