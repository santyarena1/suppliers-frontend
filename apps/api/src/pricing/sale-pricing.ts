import { computeSalePrice, resolveSaleMargin, type SalePriceView } from "@nodo/shared";
import { costTaxLines } from "../catalog-api/core/pricing";
import { baseFor, policyFor, type TenantSaleRules } from "./sale-margin-rules.service";

/**
 * Precio de venta en las respuestas del catálogo (docs/PLAN_MODO_VENDEDOR.md §3).
 *
 * Toma cualquier respuesta (lista, página, objeto) y a cada producto con
 * oferta le suma `sale`. Para quien no ve costos, además reemplaza el costo por
 * la venta y saca todo lo que permitiría reconstruirlo.
 */

type Json = unknown;
type ProductLike = Record<string, unknown> & { provider: string; externalId: string };

export interface SalePricingOptions {
  rules: TenantSaleRules;
  /** El que mira solo ve precios de venta. */
  hideCost: boolean;
}

/** Campos que revelan el costo y no viajan a quien solo ve venta. */
const COST_ONLY_FIELDS = ["raw", "costTaxes", "taxes", "listDiscountPercent", "baseListDiscountPercent"] as const;
const MAX_DEPTH = 6;

function isProductLike(value: unknown): value is ProductLike {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.provider === "string" && typeof v.externalId === "string" && ("price" in v || "finalPrice" in v);
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Venta de un producto con oferta. `null` si no tiene costo (ficha sin precio). */
export function saleOf(item: ProductLike, rules: TenantSaleRules): (SalePriceView & { costFinal: number | null }) | null {
  const net = num(item.price);
  if (net == null || !(net > 0)) return null;
  const { percent, source } = resolveSaleMargin(rules.rules, {
    provider: item.provider,
    externalId: item.externalId,
    category: typeof item.category === "string" ? item.category : null,
    subcategory: typeof item.subcategory === "string" ? item.subcategory : null,
  });
  const base = baseFor(rules, item.provider);
  const taxes = costTaxLines(
    { price: net, finalPrice: num(item.finalPrice), ivaPercent: num(item.ivaPercent), raw: item.raw },
    policyFor(rules, item.provider)
  );
  const sale = computeSalePrice({ net, taxes, percent, base });
  if (!sale) return null;
  const costFinal = round2(net + taxes.reduce((s, t) => s + t.unitAmount, 0));
  return { price: sale.price, finalPrice: sale.finalPrice, marginPercent: percent, source, base, costFinal };
}

function priceProduct(item: ProductLike, opts: SalePricingOptions): ProductLike {
  const sale = saleOf(item, opts.rules);
  if (!opts.hideCost) {
    if (!sale) return item;
    const { costFinal: _costFinal, ...view } = sale;
    return { ...item, sale: view };
  }

  const out: Record<string, unknown> = { ...item };
  for (const field of COST_ONLY_FIELDS) delete out[field];
  out.viewerMode = "seller";
  if (!sale) {
    // Sin costo no hay venta: nada que mostrar ni que filtrar.
    out.price = null;
    out.finalPrice = null;
    out.sale = null;
    out.previousPrice = null;
    out.previousFinalPrice = null;
    return out as ProductLike;
  }
  const net = num(item.price) as number;
  const netRatio = sale.price != null ? sale.price / net : 1;
  const finalRatio = sale.costFinal && sale.finalPrice != null ? sale.finalPrice / sale.costFinal : netRatio;
  out.price = sale.price;
  out.finalPrice = sale.finalPrice;
  // El precio anterior (bajas de precio) se pasa a venta con el mismo margen:
  // el % de baja se conserva y el costo no se deduce.
  if ("previousPrice" in item) out.previousPrice = scale(item.previousPrice, netRatio);
  if ("previousFinalPrice" in item) out.previousFinalPrice = scale(item.previousFinalPrice, finalRatio);
  out.sale = { price: sale.price, finalPrice: sale.finalPrice, marginPercent: null, source: null, base: null };
  return out as ProductLike;
}

function scale(value: unknown, ratio: number): number | null {
  const n = num(value);
  return n == null ? null : round2(n * ratio);
}

/** Recorre la respuesta y le pone precio de venta a cada producto que encuentra. */
export function applySalePricing<T extends Json>(value: T, opts: SalePricingOptions, depth = 0): T {
  if (depth > MAX_DEPTH || value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => applySalePricing(v, opts, depth + 1)) as T;
  // Solo objetos planos: Date, Decimal de Prisma y similares se serializan solos.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  if (isProductLike(value)) return priceProduct(value, opts) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = applySalePricing(v, opts, depth + 1);
  return out as T;
}

/** Punto del historial de precios: costo → venta con el margen de hoy del producto. */
export function saleHistory<P extends { price: unknown; finalPrice: unknown }>(
  points: P[],
  product: { provider: string; externalId: string; category: string | null; ivaPercent: unknown; raw: unknown },
  rules: TenantSaleRules
): P[] {
  return points.map((point) => {
    const priced = priceProduct(
      { ...product, price: point.price, finalPrice: point.finalPrice } as ProductLike,
      { rules, hideCost: true }
    );
    return { ...point, price: priced.price ?? null, finalPrice: priced.finalPrice ?? null };
  });
}
