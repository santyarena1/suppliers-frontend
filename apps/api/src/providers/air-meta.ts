import type { NormalizedProduct } from "./types";
import { asRecord, asString } from "./json-value";

/**
 * Ficha de Air que usa AcuStock para fotos y descripción (AirComputersClient.php,
 * herramienta "fichas/fotos"): GET mas_info.php?codiart= con la sesión del portal.
 * Devuelve JSON con `codiart`, `pictures[].source|url` y/o `imgs[].uri|url`,
 * `description` o `texto` (HTML), `attributes[]` ({ id, name, value, unit }) y
 * la garantía en `garantia` (meses) o `warranty.time`/`time_u`.
 */
export const AIR_META_URL = "https://www.air-intra.com/2025/ar/mas_info.php";

/**
 * Impuesto interno por rubro de Air, en %. El CSV no lo informa; AcuStock lo
 * completa con este mapa: MONITORES importados (001-0320) 10,5 %; MONITORES CX
 * (002-0320, nacionales) no pagan. El precio de lista de esos rubros ya trae el
 * interno adentro (no el IVA).
 */
export const AIR_INTERNAL_TAX_BY_RUBRO: Record<string, number> = {
  "001-0320": 10.5,
};

/** "001-0320", "0010320" o "001-0320 MONITORES" → "001-0320". */
export function normalizeAirRubro(raw: string | undefined): string | undefined {
  const m = raw?.trim().match(/^(\d{3})-?(\d{4})\b/);
  return m ? `${m[1]}-${m[2]}` : undefined;
}

export function airInternalTaxPercent(rubro: string | undefined): number {
  const code = normalizeAirRubro(rubro);
  return code ? (AIR_INTERNAL_TAX_BY_RUBRO[code] ?? 0) : 0;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Precio de lista con interno adentro → neto, y el final con IVA + interno
 * sobre ese neto (mismo desglose que AcuStock). Sin interno no cambia nada.
 */
export function splitAirInternalTax(
  listPrice: number | undefined,
  ivaPercent: number | undefined,
  internalTax: number
): { price: number | undefined; finalPrice: number | undefined } {
  if (listPrice == null || !(listPrice > 0) || !(internalTax > 0)) return { price: listPrice, finalPrice: undefined };
  const net = round4(listPrice / (1 + internalTax / 100));
  const finalPrice = ivaPercent != null && Number.isFinite(ivaPercent) ? round4(net * (1 + (ivaPercent + internalTax) / 100)) : undefined;
  return { price: net, finalPrice };
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pictureUrls(meta: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const collect = (list: unknown, keys: string[]) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const rec = asRecord(item);
      if (!rec) continue;
      const url = keys.map((k) => asString(rec[k])).find(Boolean);
      if (url && /^https?:\/\//i.test(url)) urls.push(url);
    }
  };
  collect(meta.pictures, ["source", "url"]);
  collect(meta.imgs, ["uri", "url"]);
  // nd.png es el "sin foto" del portal.
  return [...new Set(urls)].filter((u) => !/\/nd\.png(\?|$)/i.test(u));
}

function attributeValue(meta: Record<string, unknown>, match: (id: string, name: string) => boolean): string | undefined {
  if (!Array.isArray(meta.attributes)) return undefined;
  for (const attr of meta.attributes) {
    const rec = asRecord(attr);
    if (!rec) continue;
    const id = (asString(rec.id) ?? "").toUpperCase();
    const name = (asString(rec.name) ?? "").toLowerCase();
    if (!match(id, name)) continue;
    const value = asString(rec.value);
    if (value) return value;
  }
  return undefined;
}

function eanFrom(meta: Record<string, unknown>): string | undefined {
  const raw = attributeValue(
    meta,
    (id, name) => ["GTIN", "EAN", "BARCODE", "UPC"].includes(id) || /\b(ean|gtin|c[oó]digo de barras?|barcode|upc)\b/.test(name)
  );
  const digits = raw?.replace(/\D+/g, "");
  return digits && digits.length >= 8 ? digits : undefined;
}

function warrantyFrom(meta: Record<string, unknown>): string | undefined {
  const months = asString(meta.garantia);
  if (months) return /^\d+$/.test(months) ? `${months} meses` : months;
  const w = asRecord(meta.warranty);
  const time = asString(w?.time);
  if (!time) return undefined;
  return `${time} ${asString(w?.time_u) ?? "meses"}`;
}

/**
 * JSON de mas_info.php → parche de la ficha (foto, descripción, EAN, garantía).
 * Nombre, marca y categoría no se tocan: los resuelve el sync. Si el portal no
 * devolvió la ficha (sin `codiart`), `null`.
 */
export function mapAirMeta(body: unknown): Partial<NormalizedProduct> | null {
  let data = body;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data.replace(/^﻿/, ""));
    } catch {
      return null;
    }
  }
  const meta = asRecord(Array.isArray(data) ? data[0] : data);
  if (!meta || !asString(meta.codiart)) return null;
  const patch: Partial<NormalizedProduct> = {};
  const images = pictureUrls(meta);
  if (images[0]) patch.imageUrl = images[0];
  const html = typeof meta.description === "string" && meta.description.trim() ? meta.description : typeof meta.texto === "string" ? meta.texto : "";
  const text = htmlToText(html);
  if (text) {
    patch.longDescription = text;
    patch.description = text.replace(/\s+/g, " ").slice(0, 500);
  }
  const ean = eanFrom(meta);
  if (ean) patch.ean = ean;
  const warranty = warrantyFrom(meta);
  if (warranty) patch.warranty = warranty;
  return patch;
}
