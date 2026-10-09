import { extractPage } from "../page-extract";
import { emptyResult, LookupQuery, ManufacturerConnector, SourceFetcher, SourceResult } from "../types";
import { compactCode, lastPathSegment } from "./common";

const ORIGIN = "https://www.tp-link.com";

export function tplinkSearchUrl(term: string): string {
  return `${ORIGIN}/ar/search/?q=${encodeURIComponent(term)}&t=product`;
}

/** Fichas de producto enlazadas desde la búsqueda: /ar/<sección>/<tipo>/<modelo>/ */
export function parseTplinkSearch(html: string): string[] {
  const urls = new Set<string>();
  for (const m of html.matchAll(/href="(\/ar\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+\/)"/g)) {
    if (!m[1].startsWith("/ar/support/") && !m[1].startsWith("/ar/search/")) urls.add(`${ORIGIN}${m[1]}`);
  }
  return [...urls];
}

/** Palabras en minúscula, sin signos: "Deco X50(3-pack)" → ["deco", "x50", "3", "pack"]. */
function words(raw: string | null | undefined): string[] {
  return (raw ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** `needle` aparece como palabras seguidas dentro de `hay` ("archer c6" no está en "archer c60"). */
function containsWords(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((w, j) => hay[i + j] === w)) return true;
  }
  return false;
}

/**
 * El modelo de TP-Link es el último segmento de la URL (archer-c6, deco-x50).
 * Coincide si es igual al part number o si sus palabras aparecen seguidas en
 * el part number o en el nombre; gana el más largo (así "deco-x50" no le gana
 * a "deco-x50-outdoor" cuando el nombre dice Outdoor).
 */
export function pickTplinkMatch(urls: string[], q: LookupQuery): { url: string; model: string } | null {
  const texts = [q.partNumber, q.name, ...q.hints].map(words);
  const candidates = urls
    .map((url) => ({ url, model: lastPathSegment(url) }))
    .filter(({ model }) => {
      const c = compactCode(model);
      if (c.length < 4 || !/\d/.test(c)) return false;
      if (q.pnKey && c === q.pnKey) return true;
      const modelWords = words(model);
      return texts.some((t) => containsWords(t, modelWords));
    })
    .sort((a, b) => b.model.length - a.model.length);
  return candidates[0] ?? null;
}

export function tplinkResultFromPage(html: string, url: string, model: string): SourceResult {
  const page = extractPage(html, url);
  const gallery = [...new Set(html.match(/https:\/\/static\.tp-link\.com\/upload\/image-line\/\d+_?large_[A-Za-z0-9_]+\.(?:jpg|png|webp)/g) ?? [])];
  const images = [...(page.ogImage ? [page.ogImage] : []), ...gallery];
  const crumb = page.breadcrumbs[page.breadcrumbs.length - 1] ?? null;
  return {
    ...emptyResult("tplink", "manufacturer"),
    url,
    title: crumb ?? page.ogTitle,
    brand: "TP-Link",
    partNumber: model,
    images: [...new Set(images)].map((u) => ({ url: u })),
    description: page.ogDescription,
    category: page.breadcrumbs.length > 1 ? page.breadcrumbs[page.breadcrumbs.length - 2] : null,
    verified: true,
    matchNote: `modelo ${model} = ficha oficial`,
  };
}

export const tplinkConnector: ManufacturerConnector = {
  source: "tplink",
  brandKeys: ["tplink", "mercusys", "tapo"],
  async lookup(q: LookupQuery, fetcher: SourceFetcher): Promise<SourceResult | null> {
    const terms = [q.partNumber, ...q.hints].filter((t): t is string => !!t && compactCode(t).length >= 4).slice(0, 2);
    for (const term of terms) {
      const res = await fetcher("tplink", tplinkSearchUrl(term));
      if (res.status !== 200 || typeof res.body !== "string") continue;
      const match = pickTplinkMatch(parseTplinkSearch(res.body), q);
      if (!match) continue;
      const page = await fetcher("tplink", match.url);
      if (page.status !== 200 || typeof page.body !== "string") continue;
      return tplinkResultFromPage(page.body, match.url, match.model);
    }
    return null;
  },
};
