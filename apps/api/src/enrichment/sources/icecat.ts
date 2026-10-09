import { gtin14, pnKey } from "../keys";
import { emptyResult, LookupQuery, SourceFetcher, SourceImage, SourceResult } from "./types";

/**
 * Open Icecat (API "live" JSON). Se busca primero por GTIN y, si no está, por
 * marca + código del fabricante: hay productos (p. ej. placas ASUS) que Icecat
 * no indexa por el EAN que cargan los distribuidores pero sí por el código.
 */
export const ICECAT_BASE = "https://live.icecat.biz/api";
export const ICECAT_LANGUAGE = "es";

type Json = Record<string, unknown>;

function obj(v: unknown): Json | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
function localized(v: unknown): string | null {
  return str(obj(v)?.Value) ?? str(v);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function icecatUrls(q: LookupQuery, username: string): { by: "gtin" | "code"; url: string }[] {
  const base = `${ICECAT_BASE}?UserName=${encodeURIComponent(username)}&Language=${ICECAT_LANGUAGE}`;
  const out: { by: "gtin" | "code"; url: string }[] = [];
  if (q.gtin) out.push({ by: "gtin", url: `${base}&GTIN=${q.gtin.replace(/^0+(?=\d{13})/, "")}` });
  if (q.brand && q.partNumber) {
    out.push({ by: "code", url: `${base}&Brand=${encodeURIComponent(q.brand)}&ProductCode=${encodeURIComponent(q.partNumber.trim())}` });
  }
  return out;
}

/** Respuesta de Icecat → resultado normalizado (null si no trae producto). */
export function parseIcecat(payload: unknown, q: LookupQuery, by: "gtin" | "code"): SourceResult | null {
  const root = obj(payload);
  const data = obj(root?.data);
  const info = obj(data?.GeneralInfo);
  if (!data || !info) return null;

  const result = emptyResult("icecat", "icecat");
  const gtins = (Array.isArray(info.GTIN) ? info.GTIN : [])
    .map((g) => gtin14(String(g)))
    .filter((g): g is string => !!g);
  const brandPartCode = str(info.BrandPartCode);
  const icecatId = str(info.IcecatId) ?? String(info.IcecatId ?? "");

  const images: SourceImage[] = [];
  const seen = new Set<string>();
  for (const g of Array.isArray(data.Gallery) ? data.Gallery : []) {
    const pic = obj(g);
    const url = str(pic?.Pic) ?? str(pic?.Pic500x500);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    images.push({ url, width: num(pic?.PicWidth), height: num(pic?.PicHeight) });
  }
  const main = obj(data.Image);
  const mainUrl = str(main?.HighPic);
  if (mainUrl && !seen.has(mainUrl)) images.unshift({ url: mainUrl, width: num(main?.HighPicWidth), height: num(main?.HighPicHeight) });

  const specs: { name: string; value: string }[] = [];
  for (const group of Array.isArray(data.FeaturesGroups) ? data.FeaturesGroups : []) {
    for (const f of Array.isArray(obj(group)?.Features) ? (obj(group)!.Features as unknown[]) : []) {
      const feature = obj(f);
      const name = localized(obj(feature?.Feature)?.Name);
      const value = str(feature?.PresentationValue) ?? str(feature?.Value);
      if (name && value) specs.push({ name, value });
    }
  }

  const summary = obj(info.SummaryDescription);
  const description = obj(info.Description);
  const longDesc = str(description?.LongDesc);
  const marketing = longDesc ? stripHtml(longDesc) : null;

  const qPn = q.pnKey;
  const codeMatches = !!(qPn && brandPartCode && pnKey(brandPartCode) === qPn);
  const gtinMatches = !!(q.gtin && gtins.includes(q.gtin));
  const verified = by === "gtin" ? gtinMatches || codeMatches : codeMatches || gtinMatches;

  return {
    ...result,
    url: icecatId ? `https://icecat.biz/p/${icecatId}` : null,
    title: str(info.Title),
    brand: str(info.Brand),
    partNumber: brandPartCode,
    // Sin espacios: así lo publica el fabricante (DUAL-RTX5060TI-O8G).
    modelCode: str(info.ProductName)?.replace(/\s+/g, "") ?? null,
    gtins,
    images,
    description: str(summary?.ShortSummaryDescription),
    longDescription: marketing && marketing.length > 80 ? marketing : str(summary?.LongSummaryDescription),
    specs,
    category: localized(obj(info.Category)?.Name),
    verified,
    matchNote: verified
      ? by === "gtin"
        ? "EAN encontrado en Icecat"
        : `código ${brandPartCode} coincide`
      : `Icecat devolvió ${brandPartCode ?? "otro código"} (${gtins[0] ?? "sin EAN"})`,
  };
}

/** Busca en Icecat por GTIN y después por marca + código. */
export async function lookupIcecat(q: LookupQuery, username: string, fetcher: SourceFetcher): Promise<SourceResult | null> {
  for (const attempt of icecatUrls(q, username)) {
    const res = await fetcher("icecat", attempt.url, { json: true });
    if (res.status !== 200) continue;
    const parsed = parseIcecat(res.body, q, attempt.by);
    if (parsed) return parsed;
  }
  return null;
}
