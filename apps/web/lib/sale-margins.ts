/**
 * Modo vendedor (Pro y Custom): márgenes de venta por comercio, distribuidor,
 * categoría y producto. Espejo de los tipos del backend; ver
 * docs/PLAN_MODO_VENDEDOR.md. La web no depende de @nodo/shared.
 */

/** De dónde sale el margen que se aplica (gana el más específico). */
export type SaleMarginSource = "product" | "subcategory" | "category" | "provider" | "store" | "none";

/** Sobre qué costo se calcula el margen en este distribuidor. */
export type SaleMarginBase = "FINAL" | "NET";

/**
 * Precio de venta que el backend agrega a cada producto. Al vendedor le llega
 * sin margen, origen ni base (no tiene por qué saberlos): `null`.
 */
export interface ProductSale {
  /** Venta neta (sin IVA). */
  price: number | null;
  /** Venta final (con IVA e internos). */
  finalPrice: number | null;
  marginPercent: number | null;
  source: SaleMarginSource | null;
  base: SaleMarginBase | null;
}

export interface SaleMarginSample {
  name?: string | null;
  cost: number;
  sale: number;
}

export interface SaleMarginCategory {
  /** Categoría normalizada (clave de la regla). */
  key: string;
  /** Cómo la llama el distribuidor. */
  label: string;
  /** Nombre unificado de NODO, si la categoría está unificada. */
  nodoLabel?: string | null;
  products: number;
  /** Margen propio de la categoría. `null` = hereda. */
  percent: number | null;
  /** Margen que se aplica de verdad (propio o heredado). */
  effective: number;
  source: SaleMarginSource;
  sample?: SaleMarginSample | null;
  /**
   * Subcategorías del distribuidor dentro de esta categoría (key "cat>sub").
   * Gana sobre la categoría: producto > subcategoría > categoría > distribuidor > comercio.
   */
  subcategories?: SaleMarginCategory[];
}

export interface ProviderSaleMargins {
  base: SaleMarginBase;
  /** Margen general del distribuidor. `null` = hereda el del comercio. */
  providerPercent: number | null;
  /** Margen general del comercio. `null` = sin margen general. */
  storePercent: number | null;
  categories: SaleMarginCategory[];
}

export interface SaleMarginProduct {
  externalId: string;
  name: string;
  imageUrl?: string | null;
  brand?: string | null;
  sku?: string | null;
  /** Costo sobre el que se calcula (final o neto según la base). */
  cost: number | null;
  /** Margen propio del producto. `null` = hereda. */
  percent: number | null;
  effective: number;
  source: SaleMarginSource;
  sale: number | null;
}

export interface SaleMarginProductsPage {
  items: SaleMarginProduct[];
  nextCursor: string | null;
  total?: number | null;
}

export interface SaleMarginHistoryEntry {
  id: string;
  ruleKey: string;
  /** Texto legible de la regla, si el backend lo manda. */
  label?: string | null;
  userName?: string | null;
  before: number | null;
  after: number | null;
  createdAt: string;
}

export const SALE_MARGIN_SOURCE_LABELS: Record<SaleMarginSource, string> = {
  product: "Propio",
  subcategory: "Subcategoría",
  category: "Categoría",
  provider: "Distribuidor",
  store: "Comercio",
  none: "Sin margen",
};

export const SALE_MARGIN_BASE_LABELS: Record<SaleMarginBase, { title: string; hint: string }> = {
  FINAL: {
    title: "Sobre el costo final",
    hint: "El margen se aplica al costo con IVA, internos y percepciones: lo que te cuesta de verdad.",
  },
  NET: {
    title: "Sobre el costo neto",
    hint: "El margen se aplica al neto y el IVA se suma después sobre el precio de venta.",
  },
};

/** Rango que acepta el backend. */
export const SALE_MARGIN_MIN = -50;
export const SALE_MARGIN_MAX = 1000;
/** Por arriba de esto se pide confirmar (suele ser un error de tipeo). */
export const SALE_MARGIN_HIGH = 200;

/** Clave del aviso de novedad del modo vendedor. */
export const SELLER_MODE_ANNOUNCEMENT = "seller-mode-2026-10";
/** Apagado mientras el dueño prueba el modo vendedor; se prende cuando esté listo para todos. */
export const SELLER_MODE_ANNOUNCEMENT_ENABLED = false;

/** Lee un margen escrito por la persona ("12,5", "12.5 %"). `null` si no es un número válido. */
export function parseMarginInput(raw: string): number | null {
  const clean = raw.replace("%", "").replace(",", ".").trim();
  if (!clean) return null;
  const n = Number(clean);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1000) / 1000;
}

export type MarginCheck = { ok: true; warning: string | null } | { ok: false; error: string };

/** Valida un margen antes de guardarlo; devuelve un aviso para negativos o muy altos. */
export function checkMargin(value: number): MarginCheck {
  if (value < SALE_MARGIN_MIN || value > SALE_MARGIN_MAX) {
    return { ok: false, error: `El margen tiene que estar entre ${SALE_MARGIN_MIN} % y ${SALE_MARGIN_MAX} %.` };
  }
  if (value < 0) return { ok: true, warning: `Con ${formatMargin(value)} vendés por debajo del costo.` };
  if (value > SALE_MARGIN_HIGH) return { ok: true, warning: `${formatMargin(value)} es un margen muy alto. ¿Está bien?` };
  return { ok: true, warning: null };
}

export function formatMargin(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;
}

/**
 * Venta de un ejemplo al cambiar el margen, sin volver a pedirla: la venta es
 * proporcional a (1 + margen) en las dos bases (final y neto + IVA).
 */
export function rescaleSale(sale: number, fromPercent: number, toPercent: number): number {
  const from = 1 + fromPercent / 100;
  if (from <= 0) return sale;
  return Math.round((sale / from) * (1 + toPercent / 100) * 100) / 100;
}

/** "+22 %" / "−5 %" para mostrar junto a la venta. Vacío si no se conoce el margen. */
export function signedMargin(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return `${value >= 0 ? "+" : "−"}${formatMargin(Math.abs(value))}`;
}

/** Precio de venta para un costo y un margen. */
export function applyMargin(cost: number, percent: number): number {
  return Math.round(cost * (1 + percent / 100) * 100) / 100;
}
