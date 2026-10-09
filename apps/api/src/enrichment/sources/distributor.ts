import { AttributeValue, mapSpecsToSchema } from "../attributes";
import { CategorySchema } from "../schemas";

/** Lo que el módulo lee de cada ficha (`ProviderSyncCache`). Solo lectura. */
export interface DistributorFicha {
  id: string;
  provider: string;
  externalId: string;
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  partNumber: string | null;
  ean: string | null;
  description: string | null;
  longDescription: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  warranty: string | null;
  weight: number | null;
  weightUnit: string | null;
  raw: unknown;
  /** La foto actual la eligió la IA (Serper): no cuenta como foto del distribuidor. */
  aiImage: boolean;
}

export interface DistributorImage {
  url: string;
  provider: string;
}

const IMAGE_URL = /^https?:\/\/[^\s"']+\.(?:jpe?g|png|webp)(?:\?[^\s"']*)?$/i;
const MAX_RAW_IMAGES = 8;

/** URLs de fotos que trae el `raw` del distribuidor (galerías que no se copian a `imageUrl`). */
export function rawImageUrls(raw: unknown, depth = 0, out: string[] = []): string[] {
  if (out.length >= MAX_RAW_IMAGES || depth > 4 || raw === null || raw === undefined) return out;
  if (typeof raw === "string") {
    if (IMAGE_URL.test(raw.trim()) && !out.includes(raw.trim())) out.push(raw.trim());
    return out;
  }
  if (Array.isArray(raw)) {
    for (const item of raw) rawImageUrls(item, depth + 1, out);
    return out;
  }
  if (typeof raw === "object") {
    for (const value of Object.values(raw as Record<string, unknown>)) rawImageUrls(value, depth + 1, out);
  }
  return out;
}

/**
 * Algunos distribuidores publican miniaturas con una variante grande al lado
 * (Elit: _s.webp → _l.webp). Se prueba primero la grande.
 */
export function largerVariants(url: string): string[] {
  const elit = url.match(/^(https:\/\/images\.elit\.com\.ar\/.+)_s(\.\w+)$/);
  return elit ? [`${elit[1]}_l${elit[2]}`, url] : [url];
}

/** Fotos de los distribuidores (sin las elegidas por IA), sin repetir. */
export function distributorImages(fichas: DistributorFicha[]): DistributorImage[] {
  const seen = new Set<string>();
  const out: DistributorImage[] = [];
  for (const f of fichas) {
    const urls = [...(f.imageUrl && !f.aiImage ? [f.imageUrl] : []), ...rawImageUrls(f.raw)];
    for (const url of urls.flatMap((u) => (f.aiImage && u === f.imageUrl ? [u] : largerVariants(u)))) {
      if (seen.has(url) || (f.aiImage && url === f.imageUrl)) continue;
      seen.add(url);
      out.push({ url, provider: f.provider });
    }
  }
  return out;
}

/** Textos de los distribuidores para que la IA extraiga atributos (con su origen). */
export function distributorTexts(fichas: DistributorFicha[]): { provider: string; text: string }[] {
  return fichas.map((f) => ({
    provider: f.provider,
    text: [f.name, f.description, f.longDescription].filter(Boolean).join("\n").slice(0, 4000),
  }));
}

function warrantySpec(f: DistributorFicha): { name: string; value: string }[] {
  return f.warranty ? [{ name: "garantia", value: f.warranty }] : [];
}

function weightSpec(f: DistributorFicha): { name: string; value: string }[] {
  if (!f.weight || f.weight <= 0) return [];
  return [{ name: "peso", value: `${f.weight} ${f.weightUnit ?? "kg"}` }];
}

/** Atributos que ya vienen en columnas de la ficha (garantía, peso). */
export function distributorAttributes(schema: CategorySchema, fichas: DistributorFicha[]): Record<string, AttributeValue> {
  const merged: Record<string, AttributeValue> = {};
  for (const f of fichas) {
    const attrs = mapSpecsToSchema(schema, [...warrantySpec(f), ...weightSpec(f)], "distributor", 0.6, f.provider);
    for (const [k, v] of Object.entries(attrs)) if (!merged[k]) merged[k] = v;
  }
  return merged;
}
