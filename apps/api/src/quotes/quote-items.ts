import type { Prisma } from "@prisma/client";

/**
 * Ítem de un presupuesto (docs/PLAN_MODO_VENDEDOR.md §8). El precio es el de
 * VENTA del momento en que se agregó (o se actualizó); nunca se guarda costo.
 */
export interface QuoteItem {
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
}

export const MAX_QUOTE_ITEMS = 200;
export const MAX_QTY = 9999;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

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
    out.push({
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
    });
  }
  return out;
}

/** Lo que el precio del momento le cambia a un ítem. */
export type PricedLine = Pick<QuoteItem, "name" | "imageUrl" | "brand" | "sku" | "unitPrice" | "unitFinalPrice" | "currency">;

/**
 * Suma un producto. Si ya estaba, suma la cantidad y conserva el precio
 * congelado de esa línea (para cambiarlo está «Actualizar precios»).
 */
export function addItem(items: QuoteItem[], line: PricedLine & { provider: string; externalId: string }, qty: number, now: Date): QuoteItem[] {
  const idx = items.findIndex((it) => it.provider === line.provider && it.externalId === line.externalId);
  if (idx >= 0) {
    return items.map((it, i) => (i === idx ? { ...it, qty: Math.min(MAX_QTY, it.qty + qty) } : it));
  }
  return [...items, { ...line, qty: Math.min(MAX_QTY, qty), pricedAt: now.toISOString() }];
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
 * y se informa con `after: null`.
 */
export function repriceItems(
  items: QuoteItem[],
  current: (PricedLine | null)[],
  now: Date
): { items: QuoteItem[]; changes: PriceChange[] } {
  const changes: PriceChange[] = [];
  const next = items.map((it, index) => {
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
    out[it.currency] = Math.round(((out[it.currency] ?? 0) + it.unitFinalPrice * it.qty) * 100) / 100;
  }
  return out;
}

/** Iniciales del cliente para la ficha flotante ("Juan Pérez" → "JP"). */
export function initialsOf(name: string | null | undefined): string | null {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0];
  return letters.toUpperCase();
}
