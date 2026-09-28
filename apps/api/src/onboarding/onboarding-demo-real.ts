import type { DemoProductSeed } from "./onboarding-demo";

/** Una oferta real del catálogo de referencia (el comercio espejo del superadmin). */
export interface RealDemoCandidate {
  provider: string;
  externalId: string;
  sku: string | null;
  partNumber: string | null;
  ean: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  longDescription: string | null;
  imageUrl: string | null;
  warranty: string | null;
  price: number;
  finalPrice: number | null;
  ivaPercent: number | null;
  stock: number;
  currency: string | null;
}

export interface RealDemo {
  products: DemoProductSeed[];
  /** Lo que se busca en el recorrido: la marca del producto que está en los dos distros. */
  comparisonQuery: string;
}

const NORTE = "LIST_DEMO_NORTE";
const SUR = "LIST_DEMO_SUR";
/** Una por categoría, en el orden en que conviene mostrarlas. */
const CATEGORY_HINTS = ["monitor", "ssd", "teclado", "notebook", "router", "auricular", "webcam", "memoria", "placa de video"];
/** Preferencia para el producto que se compara entre los dos distros. */
const PAIR_HINTS = ["mouse", "monitor", "auricular", "teclado", "ssd", "notebook", "webcam", "router"];
const MIN_PRODUCTS = 6;
const MAX_PRODUCTS = 10;

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Mismo producto en distintos distribuidores: por EAN o, si no hay, por part number. */
function productKey(c: RealDemoCandidate): string | null {
  const ean = norm(c.ean).replace(/\D/g, "");
  if (ean.length >= 8) return `ean:${ean}`;
  const pn = norm(c.partNumber).replace(/[\s-]/g, "");
  return pn.length >= 4 ? `pn:${pn}` : null;
}

function usable(c: RealDemoCandidate): boolean {
  return Boolean(c.imageUrl && c.name.trim() && c.price > 0 && c.stock > 0);
}

function toSeed(c: RealDemoCandidate, provider: string): DemoProductSeed {
  // Estable: el mismo producto real siempre da el mismo id demo (reseed idempotente).
  const id = `${c.provider}-${c.externalId}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
  return {
    provider,
    externalId: `DEMO-${provider === NORTE ? "N" : "S"}-${id}`,
    sku: c.sku ?? c.externalId,
    partNumber: c.partNumber ?? "",
    ean: c.ean ?? "",
    name: c.name.trim(),
    brand: c.brand?.trim() || "",
    category: c.category ?? "",
    subcategory: c.subcategory ?? "",
    description: c.description ?? "",
    longDescription: c.longDescription ?? c.description ?? "",
    imageUrl: c.imageUrl ?? "",
    warranty: c.warranty ?? "",
    price: c.price,
    finalPrice: c.finalPrice ?? c.price,
    ivaPercent: c.ivaPercent ?? 21,
    stock: c.stock,
    currency: c.currency ?? "USD",
  };
}

/**
 * Arma la demo con productos, fotos y precios reales: un producto que existe en
 * dos distribuidores reales va a Demo Norte y Demo Sur (para mostrar la
 * comparación) y el resto, uno por categoría, se reparte entre los dos.
 * Devuelve `null` si el catálogo no alcanza: se usa la demo fija.
 */
export function pickRealDemo(candidates: RealDemoCandidate[]): RealDemo | null {
  const pool = candidates.filter(usable).sort((a, b) => b.stock - a.stock);

  const byKey = new Map<string, RealDemoCandidate[]>();
  for (const c of pool) {
    const key = productKey(c);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), c]);
  }
  // Para mostrar la comparación conviene algo vistoso (mouse, monitor…) antes que un pendrive.
  const hintRank = (c: RealDemoCandidate) => {
    const i = PAIR_HINTS.findIndex((hint) => norm(c.name).includes(hint));
    return i === -1 ? PAIR_HINTS.length : i;
  };
  let pair: [RealDemoCandidate, RealDemoCandidate] | null = null;
  for (const group of byKey.values()) {
    const first = group[0];
    const other = group.find((c) => c.provider !== first.provider);
    if (!other || !first.brand) continue;
    if (!pair || hintRank(first) < hintRank(pair[0])) pair = [first, other];
  }
  if (!pair) return null;

  const products: DemoProductSeed[] = [toSeed(pair[0], NORTE), toSeed(pair[1], SUR)];
  const usedKeys = new Set([productKey(pair[0])]);
  const usedNames = new Set(pair.map((c) => norm(c.name)));

  for (const hint of CATEGORY_HINTS) {
    if (products.length >= MAX_PRODUCTS) break;
    const found = pool.find((c) => {
      const key = productKey(c);
      return norm(c.name).includes(hint) && !usedNames.has(norm(c.name)) && !(key && usedKeys.has(key));
    });
    if (!found) continue;
    usedNames.add(norm(found.name));
    const key = productKey(found);
    if (key) usedKeys.add(key);
    products.push(toSeed(found, products.length % 2 === 0 ? NORTE : SUR));
  }

  if (products.length < MIN_PRODUCTS) return null;
  return { products, comparisonQuery: pair[0].brand!.trim() };
}
