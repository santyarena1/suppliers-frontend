import type { Prisma } from "@prisma/client";

/**
 * De dónde sale el margen de una línea:
 * - las reglas del comercio (`product`, `category`, … `none` = sin regla: al costo),
 * - `line`: margen puesto a mano en esa línea,
 * - `quote`: margen puesto para todo el presupuesto,
 * - `manual`: línea libre con precio a mano (armado, envío…).
 */
export type QuoteMarginSource =
  | "product"
  | "condition"
  | "subcategory"
  | "category"
  | "provider"
  | "store"
  | "none"
  | "line"
  | "quote"
  | "manual";

const MARGIN_SOURCES: readonly QuoteMarginSource[] = [
  "product", "condition", "subcategory", "category", "provider", "store", "none", "line", "quote", "manual",
];

/** Proveedor de las líneas libres (no son de ningún catálogo). */
export const CUSTOM_PROVIDER = "CUSTOM";

/**
 * Ítem de un presupuesto (docs/PLAN_MODO_VENDEDOR.md §8). El precio es el de
 * VENTA del momento en que se agregó (o se actualizó); nunca se guarda costo.
 */
export interface QuoteItem {
  /** `product` sale del catálogo; `custom` es una línea libre con precio a mano. */
  kind: "product" | "custom";
  provider: string;
  externalId: string;
  name: string;
  imageUrl: string | null;
  brand: string | null;
  sku: string | null;
  qty: number;
  /** Venta neta por unidad (sin impuestos). */
  unitPrice: number | null;
  /** Venta final por unidad (con impuestos): la que se cotiza. */
  unitFinalPrice: number | null;
  /** Moneda del precio (la del distribuidor; la web la pasa a la del usuario). */
  currency: string;
  pricedAt: string;
  /** Margen propio de esta línea (`null` = el del presupuesto o el de las reglas). */
  marginPercent: number | null;
  marginSource: QuoteMarginSource;
}

export const MAX_QUOTE_ITEMS = 200;
export const MAX_QTY = 9999;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Lee los ítems guardados; descarta lo que no tenga forma de ítem. */
export function readItems(json: Prisma.JsonValue | null | undefined): QuoteItem[] {
  if (!Array.isArray(json)) return [];
  const out: QuoteItem[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    const provider = str(r.provider);
    const externalId = str(r.externalId);
    if (!provider || !externalId) continue;
    const qty = Math.min(MAX_QTY, Math.max(1, Math.floor(num(r.qty) ?? 1)));
    const kind = r.kind === "custom" || provider === CUSTOM_PROVIDER ? "custom" : "product";
    const source = MARGIN_SOURCES.includes(r.marginSource as QuoteMarginSource)
      ? (r.marginSource as QuoteMarginSource)
      : kind === "custom"
        ? "manual"
        : // Presupuestos de antes de guardar el origen: no se sabe si tenía margen.
          "store";
    out.push({
      kind,
      provider,
      externalId,
      name: str(r.name) ?? externalId,
      imageUrl: str(r.imageUrl),
      brand: str(r.brand),
      sku: str(r.sku),
      qty,
      unitPrice: num(r.unitPrice),
      unitFinalPrice: num(r.unitFinalPrice),
      currency: str(r.currency) ?? "USD",
      pricedAt: str(r.pricedAt) ?? new Date(0).toISOString(),
      marginPercent: kind === "custom" ? null : num(r.marginPercent),
      marginSource: source,
    });
  }
  return out;
}

/** Lo que el precio del momento le cambia a un ítem. */
export type PricedLine = Pick<
  QuoteItem,
  "name" | "imageUrl" | "brand" | "sku" | "unitPrice" | "unitFinalPrice" | "currency" | "marginSource"
>;

/**
 * Suma un producto. Si ya estaba, suma la cantidad y conserva el precio
 * congelado de esa línea (para cambiarlo está «Actualizar precios»).
 */
export function addItem(
  items: QuoteItem[],
  line: PricedLine & { provider: string; externalId: string },
  qty: number,
  now: Date
): QuoteItem[] {
  const idx = items.findIndex((it) => it.kind === "product" && it.provider === line.provider && it.externalId === line.externalId);
  if (idx >= 0) {
    return items.map((it, i) => (i === idx ? { ...it, qty: Math.min(MAX_QTY, it.qty + qty) } : it));
  }
  return [
    ...items,
    { ...line, kind: "product", qty: Math.min(MAX_QTY, qty), pricedAt: now.toISOString(), marginPercent: null },
  ];
}

/** Línea libre: armado, envío, un producto que no está en NODO. Precio final con IVA. */
export function customItem(
  input: { id: string; name: string; unitFinalPrice: number; currency: string; qty: number; ivaPercent: number },
  now: Date
): QuoteItem {
  const final = round2(input.unitFinalPrice);
  return {
    kind: "custom",
    provider: CUSTOM_PROVIDER,
    externalId: input.id,
    name: input.name,
    imageUrl: null,
    brand: null,
    sku: null,
    qty: Math.min(MAX_QTY, Math.max(1, Math.floor(input.qty))),
    unitPrice: round2(final / (1 + input.ivaPercent / 100)),
    unitFinalPrice: final,
    currency: input.currency,
    pricedAt: now.toISOString(),
    marginPercent: null,
    marginSource: "manual",
  };
}

export interface PriceChange {
  index: number;
  provider: string;
  externalId: string;
  name: string;
  currency: string;
  before: number | null;
  /** `null` = el producto ya no tiene precio de venta (queda el anterior). */
  after: number | null;
}

/**
 * Aplica los precios de hoy. Lo que dejó de tener precio conserva el anterior
 * y se informa con `after: null`. Las líneas libres no cambian.
 */
export function repriceItems(
  items: QuoteItem[],
  current: (PricedLine | null)[],
  now: Date
): { items: QuoteItem[]; changes: PriceChange[] } {
  const changes: PriceChange[] = [];
  const next = items.map((it, index) => {
    if (it.kind === "custom") return it;
    const line = current[index];
    if (!line || line.unitFinalPrice == null) {
      changes.push({ index, provider: it.provider, externalId: it.externalId, name: it.name, currency: it.currency, before: it.unitFinalPrice, after: null });
      return it;
    }
    if (line.unitFinalPrice !== it.unitFinalPrice || line.currency !== it.currency) {
      changes.push({
        index,
        provider: it.provider,
        externalId: it.externalId,
        name: line.name,
        currency: line.currency,
        before: it.unitFinalPrice,
        after: line.unitFinalPrice,
      });
    }
    return { ...it, ...line, pricedAt: now.toISOString() };
  });
  return { items: next, changes };
}

/** Total por moneda (un presupuesto puede mezclar distribuidores en USD y ARS). */
export function totalsByCurrency(items: QuoteItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    if (it.unitFinalPrice == null) continue;
    out[it.currency] = round2((out[it.currency] ?? 0) + it.unitFinalPrice * it.qty);
  }
  return out;
}

/** Subtotal, descuento y total por moneda. */
export function summarize(
  items: QuoteItem[],
  discountPercent: number | null
): { subtotals: Record<string, number>; discounts: Record<string, number>; totals: Record<string, number> } {
  const subtotals = totalsByCurrency(items);
  const rate = discountPercent && discountPercent > 0 ? Math.min(100, discountPercent) / 100 : 0;
  const discounts: Record<string, number> = {};
  const totals: Record<string, number> = {};
  for (const [currency, amount] of Object.entries(subtotals)) {
    const off = round2(amount * rate);
    if (off > 0) discounts[currency] = off;
    totals[currency] = round2(amount - off);
  }
  return { subtotals, discounts, totals };
}

/** Líneas de catálogo que van al costo: sin margen en las reglas ni puesto a mano. */
export function atCostLines(items: QuoteItem[]): number {
  return items.filter((it) => it.kind === "product" && it.marginSource === "none").length;
}

/** Iniciales del cliente para la ficha flotante ("Juan Pérez" → "JP"). */
export function initialsOf(name: string | null | undefined): string | null {
  // Solo letras y números, sin lo que va entre paréntesis: "Casa & Co. (local)" → "CC".
  const words = (name ?? "")
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return null;
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0];
  return letters.toUpperCase();
}
