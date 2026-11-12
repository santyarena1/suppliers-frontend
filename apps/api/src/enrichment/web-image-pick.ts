import { codesIn, LOOKS, variantFor, words } from "./official-store-images";
import { https } from "./sources/manufacturers/common";
import { ShopifyProduct, shopifyImagesFor } from "./sources/manufacturers/shopify";

/**
 * Segunda búsqueda de fotos para Aula, IROK y ATK: cuando la tienda oficial no
 * tiene la variante, se busca en Google Imágenes (Serper) y se acepta una foto
 * solo si el título de la página dice el mismo modelo y los mismos colores, sin
 * colores ni versiones de más (una página con varios colores no sirve: la foto
 * puede ser de otro). Si ninguna cumple, el producto queda sin foto.
 */

export interface WebImageHit {
  imageUrl: string;
  title: string | null;
  source: string | null;
}

export interface WebImageCandidate extends WebImageHit {
  note: string;
}

/** Colores: si el título nombra uno que el producto no tiene, la foto puede ser de otro color. */
const COLORS = new Set([
  "negro", "blanco", "rosa", "violeta", "azul", "rojo", "verde", "gris", "plateado", "amarillo", "naranja",
  "marron", "beige", "celeste", "dorado",
]);

/** Versiones de un modelo: si el título dice una que el nombre no, es otro producto. */
const QUALIFIERS = new Set(["pro", "max", "he", "plus", "mini", "ultra", "air", "se", "lite", "extreme", "ultimate", "tkl", "v2"]);

/** No hace falta que el título los diga (idioma, conexión) o se miran aparte. */
const OPTIONAL = new Set(["ingles", "ingle", "espanol", "latam", "latino", "wireless", "wired", "inalambrico", "cableado", "switch"]);

/** Tamaños de mousepad: la foto es la misma en todos. */
const SIZES = new Set(["large", "mini", "medium", "small", "xl", "xxl", "grande", "chico", "mediano"]);
const SIZE_PATTERN = /\b\d{2,4}\s*[xX×]\s*\d{2,4}\b/g;

/** Sitios cuyas fotos suelen ser collages de varios colores o no son de una tienda. */
const BLOCKED_SOURCES = [
  "pinterest", "aliexpress", "alibaba", "temu", "shein", "dhgate", "youtube", "tiktok", "facebook",
  "instagram", "reddit", "x.com", "twitter", "ebay", "wish.com",
];

/** Tiendas de la marca y comercios grandes con una ficha por color: se prefieren. */
const PREFERRED_SOURCES = ["aulagear", "aula", "irok", "atk", "epomaker", "bestbuy", "mercadolibre", "amazon", "newegg"];

const plus = (text: string) => text.replace(/\+/g, " plus ");

function index(text: string): { set: Set<string>; compact: string } {
  const ws = words(plus(text));
  return { set: new Set(ws), compact: ws.join("") };
}

function has(idx: { set: Set<string>; compact: string }, w: string): boolean {
  return idx.set.has(w) || ((w.length >= 3 || /^\d+$/.test(w)) && idx.compact.includes(w));
}

const letters = (code: string) => code.replace(/\d.*$/, "");

/** Lo que tiene que decir el título de la página para que la foto sea de este producto. */
export function webRequirements(name: string): { required: string[]; colors: string[]; all: Set<string>; sized: boolean } {
  const sized = SIZE_PATTERN.test(name);
  SIZE_PATTERN.lastIndex = 0;
  const all = words(plus(name.replace(SIZE_PATTERN, " ")));
  const sw = all.indexOf("switch");
  const own = sw >= 0 ? all.slice(0, sw) : all;
  const required = [...new Set(own.filter((w) => !OPTIONAL.has(w) && !(sized && SIZES.has(w))))];
  return { required, colors: required.filter((w) => COLORS.has(w)), all: new Set(all), sized };
}

/** Por qué este resultado no sirve, o `null` si sirve. */
export function webHitProblem(hit: WebImageHit, item: { name: string; brand: string }): string | null {
  const title = hit.title ?? "";
  const source = (hit.source ?? "").toLowerCase();
  if (!title.trim()) return "sin título";
  if (BLOCKED_SOURCES.some((s) => source.includes(s))) return `sitio no confiable (${hit.source})`;
  const brand = item.brand.toLowerCase();
  if (!title.toLowerCase().includes(brand) && !source.includes(brand)) return `no dice ${item.brand}`;

  const req = webRequirements(item.name);
  const t = index(title);
  const missing = req.required.filter((w) => !has(t, w));
  if (missing.length) return `le falta ${missing.join(", ")}`;

  const extraColors = [...t.set].filter((w) => COLORS.has(w) && !req.all.has(w));
  if (extraColors.length) return `dice otros colores (${extraColors.join(", ")})`;
  const extraLooks = [...t.set].filter((w) => LOOKS.has(w) && !COLORS.has(w) && !req.all.has(w) && w !== "light" && w !== "dark");
  if (extraLooks.length) return `dice otra terminación (${extraLooks.join(", ")})`;
  const extraVersion = [...t.set].filter((w) => QUALIFIERS.has(w) && !req.all.has(w));
  if (extraVersion.length) return `es otra versión (${extraVersion.join(", ")})`;

  const nameWireless = req.all.has("wireless") || req.all.has("inalambrico");
  const nameWired = req.all.has("wired") || req.all.has("cableado");
  const titleWireless = t.set.has("wireless") || t.set.has("inalambrico");
  const titleWired = t.set.has("wired") || t.set.has("cableado");
  if (nameWireless && titleWired && !titleWireless) return "es la versión con cable";
  if (nameWired && titleWireless && !titleWired) return "es la versión inalámbrica";

  // F75 contra F99, S75 contra S99: mismo prefijo y otro número es otro modelo.
  const nameCodes = codesIn(item.name);
  const otherCode = codesIn(title).find((c) => !nameCodes.includes(c) && nameCodes.some((n) => letters(n) === letters(c) && !c.startsWith(n)));
  if (otherCode) return `nombra otro modelo (${otherCode})`;
  return null;
}

/** Resultados que sirven, primero los de tiendas de la marca y comercios grandes. */
export function pickWebImages(hits: WebImageHit[], item: { name: string; brand: string }): { candidates: WebImageCandidate[]; rejected: string[] } {
  const candidates: (WebImageCandidate & { order: number; rank: number })[] = [];
  const rejected: string[] = [];
  hits.forEach((hit, order) => {
    const problem = webHitProblem(hit, item);
    if (problem) {
      rejected.push(`${hit.source ?? "?"}: ${problem}`);
      return;
    }
    const source = (hit.source ?? "").toLowerCase();
    const pref = PREFERRED_SOURCES.findIndex((s) => source.includes(s));
    candidates.push({ ...hit, note: `«${hit.title}» (${hit.source ?? "?"})`, order, rank: pref < 0 ? PREFERRED_SOURCES.length : pref });
  });
  candidates.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return { candidates: candidates.map(({ order: _o, rank: _r, ...c }) => c), rejected };
}

/** Lo que se busca en Google: marca + nombre, sin el idioma del teclado. */
export function webImageQuery(name: string, brand: string): string {
  const clean = name.replace(/\b(ingl[eé]s|espa[nñ]ol|english|spanish)\b/gi, " ").replace(/\s+/g, " ").trim();
  return `${brand} ${clean}`.slice(0, 200);
}

// ---------- Tiendas oficiales de la marca en otros países ----------

/** Tiendas Shopify de la marca afuera (o socias oficiales) donde buscar lo que la de Argentina no tiene. */
export const SECONDARY_STORES: Record<string, { origin: string; brandInTitle: boolean }[]> = {
  aula: [
    { origin: "https://aulagear.com", brandInTitle: false },
    { origin: "https://epomaker.com", brandInTitle: true },
  ],
};

/** El título del producto nombra el mismo modelo que la lista (sin mirar colores, que van en las variantes). */
export function sameModelTitle(title: string | null | undefined, name: string, brand: string, brandInTitle: boolean): boolean {
  const raw = title ?? "";
  if (brandInTitle && !raw.toLowerCase().includes(brand.toLowerCase())) return false;
  const req = webRequirements(name);
  const model = req.required.filter((w) => !LOOKS.has(w));
  if (model.length === 0) return false;
  const t = index(raw);
  if (!model.every((w) => has(t, w))) return false;
  if ([...t.set].some((w) => QUALIFIERS.has(w) && !req.all.has(w))) return false;
  // Un producto por color ("AULA F75 White"): el color del título tiene que ser del nombre.
  if ([...t.set].some((w) => (COLORS.has(w) || LOOKS.has(w)) && !req.all.has(w))) return false;
  const nameCodes = codesIn(name);
  if (codesIn(raw).some((c) => !nameCodes.includes(c) && nameCodes.some((n) => letters(n) === letters(c) && !c.startsWith(n)))) return false;
  return true;
}

/**
 * Foto de la variante en otra tienda de la marca: el producto tiene que ser del
 * mismo modelo y la variante cerrar con todos los colores del nombre (las mismas
 * reglas que en la tienda de Argentina). Si hay dos productos posibles, ninguno.
 */
export function pickSecondaryImages(
  catalog: ShopifyProduct[],
  item: { name: string; brand: string; brandInTitle: boolean }
): { images: string[]; note: string } {
  const models = catalog.filter((p) => sameModelTitle(p.title, item.name, item.brand, item.brandInTitle));
  if (models.length === 0) return { images: [], note: "ningún producto del mismo modelo" };
  const withVariant = models
    .map((p) => ({ p, v: variantFor(p, { name: item.name, ean: null }) }))
    .filter((x) => x.v.variant);
  if (withVariant.length === 0) {
    return { images: [], note: `${models.map((p) => `«${p.title}»`).join(", ")}: ${variantFor(models[0], { name: item.name, ean: null }).how}` };
  }
  if (withVariant.length > 1) return { images: [], note: `varios productos posibles: ${withVariant.map((x) => `«${x.p.title}»`).join(", ")}` };
  const { p, v } = withVariant[0];
  // Ficha de una sola variante: el color lo tiene que decir el título o la variante.
  if ((p.variants ?? []).length <= 1) {
    const own = index(`${p.title ?? ""} ${v.variant!.title ?? ""}`);
    const missing = webRequirements(item.name).colors.filter((c) => !has(own, c));
    if (missing.length) return { images: [], note: `«${p.title}» no dice el color (${missing.join(", ")})` };
  }
  // Con varias variantes, solo la foto propia de la variante: sin ella no hay certeza del color.
  if ((p.variants ?? []).length > 1 && !v.variant!.featured_image?.src) {
    return { images: [], note: `«${p.title}» variante «${v.variant!.title}» no tiene foto propia` };
  }
  const images = shopifyImagesFor(p, v.variant).map(https);
  if (images.length === 0) return { images: [], note: `«${p.title}» sin fotos` };
  return { images, note: `«${p.title}» variante «${v.variant!.title}» por ${v.how}` };
}
