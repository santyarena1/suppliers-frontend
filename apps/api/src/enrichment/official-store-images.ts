import { gtin14 } from "./keys";
import { https } from "./sources/manufacturers/common";
import { ShopifyProduct, ShopifyVariant, shopifyHandleFrom, shopifyImagesFor } from "./sources/manufacturers/shopify";

/** Tiendas oficiales (Shopify) de las marcas que trae la lista gremio de Aula. */
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

// ---------- Palabras ----------

/** Colores e idiomas que la lista escribe en inglés y la tienda en español (o al revés). */
const ALIASES: Record<string, string> = {
  black: "negro", negra: "negro", noir: "negro",
  white: "blanco", blanca: "blanco", blanc: "blanco",
  pink: "rosa", rosado: "rosa",
  purple: "violeta", morado: "violeta", lila: "violeta", purpura: "violeta",
  blue: "azul",
  red: "rojo", roja: "rojo",
  green: "verde",
  grey: "gris", gray: "gris",
  silver: "plateado", plata: "plateado",
  yellow: "amarillo", amarilla: "amarillo",
  orange: "naranja",
  brown: "marron",
  english: "ingles", us: "ingles", ansi: "ingles",
  spanish: "espanol", esp: "espanol",
  sw: "switch", switches: "switch",
  degradado: "degrade",
  blak: "negro",
};

/** Palabras de aspecto: si el nombre dice una, la variante (o el título) también. */
export const LOOKS = new Set([
  "negro", "blanco", "rosa", "violeta", "azul", "rojo", "verde", "gris", "plateado", "amarillo", "naranja", "marron",
  "beige", "celeste", "dorado", "light", "dark", "degrade", "contour", "frosted", "transparent", "translucent",
  "milk", "coffe", "coffee", "shadow", "petal", "lake", "comic", "semi",
]);

/** No distinguen productos ni variantes. */
const NOISE = new Set([
  "teclado", "mecanico", "aula", "irok", "atk", "mouse", "auricular", "auriculares", "mousepad", "idioma",
  "default", "title", "basic", "standard", "estandar", "version", "y", "de", "con", "the", "and", "gaming",
  "series", "serie", "line", "kit", "en", "layout",
]);

function singular(w: string): string {
  return w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
}

/** Palabras normalizadas: minúscula, sin acentos, con alias y en singular. */
export function words(text: string | null | undefined): string[] {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => ALIASES[w] ?? w)
    .filter((w) => !NOISE.has(w))
    .map(singular)
    .filter((w) => !NOISE.has(w));
}

/** "Mini+", "SE+", "Ultimate+": el "+" pegado al modelo es parte del modelo. */
function withTitlePlus(title: string | null | undefined): string {
  return (title ?? "").replace(/([A-Za-z0-9])\+/g, "$1 plus ");
}

/** En los nombres de la lista el "+" suele ir suelto ("A9 mini + Pink"). */
function withNamePlus(name: string): string {
  return name.replace(/\+/g, " plus ");
}

/** Aspecto que dice el nombre, sin lo que va después de "SW" (el switch: "SW Zenith Frosted"). */
function looksIn(name: string): string[] {
  const ws = words(withNamePlus(name));
  const sw = ws.indexOf("switch");
  return (sw >= 0 ? ws.slice(0, sw) : ws).filter((w) => LOOKS.has(w));
}

/** Lo que dice el nombre de la lista, para comparar palabra por palabra o pegado ("Hero 68" = "HERO68"). */
interface NameIndex {
  set: Set<string>;
  compact: string;
}

function indexName(name: string): NameIndex {
  const ws = words(withNamePlus(name));
  return { set: new Set(ws), compact: ws.join("") };
}

function has(name: NameIndex, w: string): boolean {
  // Pegado al resto ("Mini60" tiene "60", "Sideprint" tiene "print"): palabras de 3+ letras o números.
  return name.set.has(w) || ((w.length >= 3 || /^\d+$/.test(w)) && name.compact.includes(w));
}

// ---------- Producto ----------

/** Grupos de alternativas ("PRO/MAX" → [["pro","max"]]); el resto, una palabra por grupo. */
function titleRequirements(title: string | null | undefined): string[][] {
  const reqs: string[][] = [];
  for (const chunk of withTitlePlus(title).split(/\s+/).filter(Boolean)) {
    if (chunk.includes("/")) {
      const alternatives = chunk.split("/").flatMap((p) => words(p));
      if (alternatives.length) reqs.push(alternatives);
    } else {
      for (const w of words(chunk)) reqs.push([w]);
    }
  }
  return reqs;
}

/** Cuántas palabras de modelo del título están en el nombre, o -1 si falta alguna. */
export function productFit(product: ShopifyProduct, name: string): number {
  const idx = indexName(name);
  const reqs = titleRequirements(product.title);
  if (reqs.length === 0) return -1;
  for (const alternatives of reqs) if (!alternatives.some((w) => has(idx, w))) return -1;
  return reqs.length;
}

// ---------- Variante ----------

function optionValues(v: ShopifyVariant): string[] {
  const opts = (v.options ?? []).filter((o) => o && o.trim());
  return opts.length ? opts : [v.title ?? ""];
}

interface VariantFit {
  variant: ShopifyVariant;
  score: number;
  key: string;
}

/**
 * La variante que es este producto. Cada opción (color, switch…) tiene que
 * estar entera en el nombre. Una opción que no se menciona nunca (por ejemplo,
 * el switch, que la lista no dice) no cuenta, salvo la primera, que es la que
 * distingue el color. Gana la más específica; si empatan dos de distinto color,
 * no hay certeza y no se elige ninguna.
 */
export function variantFor(product: ShopifyProduct, item: { name: string; ean: string | null }): { variant: ShopifyVariant | null; how: string } {
  const variants = product.variants ?? [];
  if (variants.length === 0) return { variant: null, how: "la ficha no tiene variantes" };
  const gtin = gtin14(item.ean);
  const byEan = gtin ? variants.find((v) => v.barcode && gtin14(v.barcode) === gtin) : undefined;
  if (byEan) return { variant: byEan, how: "EAN" };
  if (variants.length === 1) return { variant: variants[0], how: "única variante" };

  const idx = indexName(item.name);
  // Lo que ya dice el título (F75, PRO…) no hace más específica a una variante.
  const titleWords = new Set(titleRequirements(product.title).flat());
  const dims = Math.max(...variants.map((v) => optionValues(v).length));
  const valueFits = (value: string) => {
    const ws = words(value);
    return ws.length > 0 && ws.every((w) => has(idx, w));
  };
  // Opciones 2 y 3 que el nombre no menciona nunca: no cuentan.
  const ignored = new Set<number>();
  for (let d = 1; d < dims; d++) {
    if (!variants.some((v) => valueFits(optionValues(v)[d] ?? ""))) ignored.add(d);
  }
  const fits: VariantFit[] = [];
  for (const v of variants) {
    const values = optionValues(v);
    let score = 0;
    let ok = true;
    const keyParts: string[] = [];
    values.forEach((value, d) => {
      if (ignored.has(d)) return;
      if (!valueFits(value)) ok = false;
      score += words(value).filter((w) => !titleWords.has(w)).length;
      keyParts.push(value);
    });
    if (ok) fits.push({ variant: v, score, key: keyParts.join(" / ") });
  }
  if (fits.length === 0) return { variant: null, how: "ninguna variante coincide con el nombre" };
  // Un color o terminación del nombre que la variante no tiene: es otra (o la tienda no la tiene).
  const looks = looksIn(item.name);
  const covering = fits.filter((f) => {
    const own = optionValues(f.variant).flatMap((v) => words(v));
    const ownCompact = own.join("");
    return looks.every((w) => titleWords.has(w) || own.includes(w) || ownCompact.includes(w));
  });
  if (covering.length === 0) return { variant: null, how: `a ninguna variante le cierra todo el aspecto del nombre (${looks.join(", ")})` };
  fits.splice(0, fits.length, ...covering);
  const best = Math.max(...fits.map((f) => f.score));
  const top = fits.filter((f) => f.score === best);
  const keys = new Set(top.map((f) => f.key));
  if (keys.size > 1) return { variant: null, how: `empate entre ${[...keys].map((k) => `«${k}»`).join(" y ")}` };
  // Mismo color con distinto switch: la del que tenga foto.
  const chosen = top.find((f) => f.variant.featured_image?.src) ?? top[0];
  return { variant: chosen.variant, how: "nombre" };
}

// ---------- Elección ----------

export interface OfficialImagePick {
  images: string[];
  /** De qué producto y variante salió (o por qué ninguna). */
  note: string;
  handle: string | null;
}

/**
 * Fotos de la tienda oficial para un producto de la lista. Busca el producto
 * por las palabras de modelo en todo el catálogo de la tienda (el link de la
 * lista a veces apunta a otro producto: solo desempata) y la variante por el
 * color del nombre. Si hay duda, ninguna: mejor sin foto que con la de otro.
 */
export function pickOfficialImages(
  catalog: ShopifyProduct[],
  item: { name: string; ean: string | null; linkedHandle: string | null }
): OfficialImagePick {
  const gtin = gtin14(item.ean);
  if (gtin) {
    for (const p of catalog) {
      if ((p.variants ?? []).some((v) => v.barcode && gtin14(v.barcode) === gtin)) return finish(p, item);
    }
  }
  const scored = catalog.map((p) => ({ p, fit: productFit(p, item.name) })).filter((s) => s.fit > 0);
  if (scored.length === 0) {
    // El título de la tienda dice algo más ("Combo Kit 4 en 1…"): vale el link de la lista
    // solo si todos los códigos de modelo del nombre (T650, N9…) están en ese título.
    const linked = catalog.find((p) => p.handle === item.linkedHandle);
    if (linked && codesIn(item.name).length > 0 && codesIn(item.name).every((c) => compactTitle(linked).includes(c))) {
      return finish(linked, item);
    }
    return { images: [], note: "ningún producto de la tienda coincide con el modelo", handle: null };
  }
  const best = Math.max(...scored.map((s) => s.fit));
  let top = scored.filter((s) => s.fit === best);
  if (top.length > 1) {
    const linked = top.filter((s) => s.p.handle === item.linkedHandle);
    if (linked.length === 1) top = linked;
  }
  if (top.length > 1) {
    // Varios productos con el mismo modelo: vale solo si exactamente uno tiene la variante.
    const withVariant = top.filter((s) => variantFor(s.p, item).variant);
    if (withVariant.length !== 1) {
      return { images: [], note: `varios productos posibles: ${top.map((s) => `«${s.p.title}»`).join(", ")}`, handle: null };
    }
    top = withVariant;
  }
  return finish(top[0].p, item);
}

/** Códigos de modelo del nombre: tokens con letras y números (F75, N9, T650). */
export function codesIn(name: string): string[] {
  return name
    .split(/[^A-Za-z0-9]+/)
    .map((t) => t.toUpperCase())
    .filter((t) => t.length >= 2 && /\d/.test(t) && /[A-Z]/.test(t));
}

function compactTitle(p: ShopifyProduct): string {
  return (p.title ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function finish(p: ShopifyProduct, item: { name: string; ean: string | null }): OfficialImagePick {
  const { variant, how } = variantFor(p, item);
  const label = `«${p.title ?? p.handle}»`;
  if (!variant) return { images: [], note: `${label}: ${how}`, handle: p.handle ?? null };
  const images = shopifyImagesFor(p, variant).map(https);
  const vname = (p.variants ?? []).length > 1 ? ` variante «${variant.title}»` : "";
  if (images.length === 0) return { images: [], note: `${label}${vname} (${how}) no tiene foto propia`, handle: p.handle ?? null };
  return { images, note: `${label}${vname} por ${how}`, handle: p.handle ?? null };
}

// ---------- products.json ----------

interface CatalogVariant {
  id?: number;
  title?: string;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  sku?: string | null;
  barcode?: string | null;
  featured_image?: { src?: string | null } | null;
}

interface CatalogProduct {
  title?: string;
  handle?: string;
  images?: { src?: string }[];
  variants?: CatalogVariant[];
}

/** `/products.json` de Shopify en la forma de `/products/<handle>.js`. */
export function fromCatalogJson(body: unknown): ShopifyProduct[] {
  const products = (body as { products?: CatalogProduct[] } | null)?.products;
  if (!Array.isArray(products)) return [];
  return products.map((p) => ({
    title: p.title,
    handle: p.handle,
    images: (p.images ?? []).map((i) => i.src).filter((s): s is string => Boolean(s)),
    variants: (p.variants ?? []).map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku ?? null,
      barcode: v.barcode ?? null,
      options: [v.option1, v.option2, v.option3].filter((o): o is string => Boolean(o)),
      featured_image: v.featured_image?.src ? { src: v.featured_image.src } : null,
    })),
  }));
}
