/**
 * Modo vendedor: márgenes de venta del comercio. Contrato compartido entre la
 * API y la web, y la cuenta pura del precio de venta.
 * Diseño completo en docs/PLAN_MODO_VENDEDOR.md.
 */
import type { TaxLine } from "./tax-lines";

/** Avisos de novedades que la web muestra una sola vez por persona. */
export const ANNOUNCEMENTS = ["seller-mode-2026-10"] as const;
export type AnnouncementKey = (typeof ANNOUNCEMENTS)[number];

export function isAnnouncementKey(value: string): value is AnnouncementKey {
  return (ANNOUNCEMENTS as readonly string[]).includes(value);
}

export type SaleMarginScope = "STORE" | "PROVIDER" | "CATEGORY" | "PRODUCT";
/** FINAL = sobre el costo final con impuestos; NET = sobre el neto (+ IVA después). */
export type SaleMarginBase = "FINAL" | "NET";
/** De dónde sale el margen que se aplicó. `none` = no hay regla: venta = costo. */
export type SaleMarginSource = "product" | "category" | "provider" | "store" | "none";

/** Límites del margen (en puntos: 25 = 25 %). */
export const SALE_MARGIN_MIN = -50;
export const SALE_MARGIN_MAX = 1000;

export interface SalePriceView {
  /** Venta neta (sin IVA). */
  price: number | null;
  /** Venta final (con IVA e internos). */
  finalPrice: number | null;
  /** `null` para quien no ve costos: con el margen se reconstruiría el costo. */
  marginPercent: number | null;
  source: SaleMarginSource | null;
  base: SaleMarginBase | null;
}

/** Categoría del distribuidor tal como la nombra él, para agrupar reglas. */
export function saleCategoryKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return key || null;
}

/** Clave legible y única de cada regla dentro de un comercio. */
export const saleRuleKey = {
  store: () => "STORE",
  provider: (provider: string) => `P:${provider}`,
  category: (provider: string, categoryKey: string) => `C:${provider}:${categoryKey}`,
  product: (provider: string, externalId: string) => `X:${provider}:${externalId}`,
};

/** Reglas de un comercio ya indexadas por clave (`saleRuleKey`). */
export type SaleMarginRuleSet = ReadonlyMap<string, number>;

/**
 * Margen de un producto: gana el más específico.
 * Producto > categoría del distribuidor > distribuidor > comercio > sin regla (0).
 */
export function resolveSaleMargin(
  rules: SaleMarginRuleSet,
  item: { provider: string; externalId: string; category: string | null | undefined }
): { percent: number; source: SaleMarginSource } {
  const product = rules.get(saleRuleKey.product(item.provider, item.externalId));
  if (product != null) return { percent: product, source: "product" };
  const cat = saleCategoryKey(item.category);
  if (cat) {
    const category = rules.get(saleRuleKey.category(item.provider, cat));
    if (category != null) return { percent: category, source: "category" };
  }
  const provider = rules.get(saleRuleKey.provider(item.provider));
  if (provider != null) return { percent: provider, source: "provider" };
  const store = rules.get(saleRuleKey.store());
  if (store != null) return { percent: store, source: "store" };
  return { percent: 0, source: "none" };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Precio de venta a partir del costo.
 *
 * - FINAL: venta final = costo final (neto + IVA + internos + percepciones) × (1 + m).
 *   La venta neta es la final sin IVA ni internos.
 * - NET: venta neta = neto × (1 + m); venta final = venta neta + IVA + internos
 *   sobre esa venta. Las percepciones son un costo del comercio: no se trasladan.
 *
 * `taxes` son las líneas unitarias del costo (mismas que muestra el carrito).
 */
export function computeSalePrice(input: {
  net: number | null;
  taxes: readonly TaxLine[];
  percent: number;
  base: SaleMarginBase;
}): { price: number; finalPrice: number } | null {
  const net = input.net;
  if (net == null || !Number.isFinite(net) || !(net > 0)) return null;
  const factor = 1 + input.percent / 100;
  const resale = input.taxes.filter((t) => t.kind !== "iibb");
  const rate = resale.reduce((s, t) => s + (t.percent != null ? t.percent : 0), 0) / 100;
  const fixed = resale.reduce((s, t) => s + (t.percent == null ? t.unitAmount : 0), 0);

  if (input.base === "NET") {
    const price = net * factor;
    return { price: round2(price), finalPrice: round2(price * (1 + rate) + fixed * factor) };
  }
  const costFinal = net + input.taxes.reduce((s, t) => s + t.unitAmount, 0);
  const finalPrice = costFinal * factor;
  const price = (finalPrice - fixed * factor) / (1 + rate);
  return { price: round2(price), finalPrice: round2(finalPrice) };
}

// ---------- Contrato de los endpoints (docs/PLAN_MODO_VENDEDOR.md §4) ----------

export interface SaleMarginCategoryRow {
  key: string;
  /** Como la nombra el distribuidor. */
  label: string;
  /** Nombre de NODO si la categoría está unificada. */
  nodoLabel: string | null;
  products: number;
  /** Margen propio de la categoría; `null` = hereda. */
  percent: number | null;
  /** Margen que se aplica de verdad (propio o heredado). */
  effective: number;
  source: SaleMarginSource;
  /** Un producto típico de la categoría para el ejemplo costo → venta. */
  sample: { name: string; cost: number | null; sale: number | null; currency: string } | null;
}

export interface ProviderSaleMargins {
  provider: string;
  base: SaleMarginBase;
  providerPercent: number | null;
  storePercent: number | null;
  categories: SaleMarginCategoryRow[];
}

export interface SaleMarginProductRow {
  externalId: string;
  name: string;
  sku: string | null;
  brand: string | null;
  imageUrl: string | null;
  category: string | null;
  categoryKey: string | null;
  currency: string;
  /** Costo final (con impuestos) y neto. */
  cost: { price: number | null; finalPrice: number | null };
  /** Margen propio del producto; `null` = hereda. */
  percent: number | null;
  effective: number;
  source: SaleMarginSource;
  sale: { price: number | null; finalPrice: number | null };
}

export interface SaleMarginProductsPage {
  items: SaleMarginProductRow[];
  nextCursor: string | null;
  total: number;
}

export interface SaleMarginHistoryEntry {
  id: string;
  ruleKey: string;
  scope: SaleMarginScope;
  provider: string | null;
  /** Etiqueta legible: "Comercio", "Distribuidor", la categoría o el producto. */
  label: string;
  before: number | null;
  after: number | null;
  userId: string | null;
  userName: string | null;
  createdAt: string;
}
