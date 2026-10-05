import { extractTaxLines, taxByKind, type ApiClientConfig, type CatalogApiRounding, type SaleMarginBase, type TaxLine } from "@nodo/shared";

/** Tipos de impuesto que expone la API (en inglés: es un contrato para integradores). */
export type ApiTaxType = "iva" | "internal" | "perception" | "other";

export interface ApiTax {
  type: ApiTaxType;
  label: string;
  /** Alícuota en puntos (21 = 21%). `null` si el distribuidor mandó un monto fijo. */
  percent: number | null;
  amount: number;
  /** El comercio no lo recibió del distribuidor: es su alícuota habitual. */
  estimated?: boolean;
}

export interface ApiPrice {
  currency: string;
  cost?: { net: number; taxes?: ApiTax[]; gross: number };
  sale?: { net: number; taxes?: ApiTax[]; gross: number; markupPercent: number };
  listSource: "api" | "list" | "base_list";
}

/** Percepciones del comercio para un distribuidor (Configuración del distribuidor). */
export interface PerceptionPolicy {
  /** % cargado a mano: manda sobre todo; 0 = no paga percepción a este distribuidor. */
  manualIibbPercent: number | null;
  /** Otras percepciones (%) cargadas a mano (proveedores por lista). */
  manualPerceptionsPercent: number | null;
  /** Última percepción (%) que le cotizó el portal. */
  learnedIibbPercent: number | null;
}

export const NO_PERCEPTIONS: PerceptionPolicy = {
  manualIibbPercent: null,
  manualPerceptionsPercent: null,
  learnedIibbPercent: null,
};

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Líneas fiscales unitarias del costo, con la misma lógica que el carrito de la
 * web (apps/web/lib/purchase-price.ts → resolveLineIibb): el % manual de IIBB
 * manda, después la percepción que trae el producto y por último la aprendida
 * del portal (marcada como estimada).
 */
export function costTaxLines(
  offer: { price: number | null; finalPrice: number | null; ivaPercent: number | null; raw: unknown },
  policy: PerceptionPolicy
): TaxLine[] {
  const net = offer.price ?? 0;
  const lines = extractTaxLines({ price: offer.price, finalPrice: offer.finalPrice, ivaPercent: offer.ivaPercent, raw: offer.raw });
  const withoutIibb = lines.filter((l) => l.kind !== "iibb");
  const iibb = resolveIibb(lines, net, policy);
  const out = iibb ? [...withoutIibb, iibb] : withoutIibb;
  const other = policy.manualPerceptionsPercent;
  if (other != null && other > 0 && net > 0) {
    out.push({ kind: "iibb", label: "Otras percepciones", percent: other, unitAmount: round4(net * (other / 100)) });
  }
  return out;
}

function resolveIibb(lines: TaxLine[], net: number, policy: PerceptionPolicy): TaxLine | null {
  const manual = policy.manualIibbPercent;
  if (manual != null) {
    if (manual <= 0 || net <= 0) return null;
    return { kind: "iibb", label: "IIBB", percent: manual, unitAmount: round4(net * (manual / 100)) };
  }
  const existing = taxByKind(lines, "iibb");
  if (existing && existing.unitAmount > 0.0001) return existing;
  const learned = policy.learnedIibbPercent;
  if (learned != null && learned > 0 && net > 0) {
    return { kind: "iibb", label: "Percepciones", percent: learned, unitAmount: round4(net * (learned / 100)), estimated: true };
  }
  return null;
}

const TYPE_BY_KIND: Record<TaxLine["kind"], ApiTaxType> = {
  iva: "iva",
  internos: "internal",
  iibb: "perception",
  other: "other",
};

/** Redondeo del precio de venta final (el que se publica). */
export function roundSalePrice(value: number, mode: CatalogApiRounding): number {
  switch (mode) {
    case "1":
      return Math.ceil(round2(value));
    case "10":
      return Math.ceil(round2(value) / 10) * 10;
    case "99": {
      const up = Math.ceil(round2(value));
      return round2(up - 0.01 >= value ? up - 0.01 : up + 0.99);
    }
    default:
      return round2(value);
  }
}

/** Convierte un importe de la moneda de la oferta a la de la key. `null` = falta cotización. */
export type Converter = (amount: number, fromCurrency: string) => number | null;

export function makeConverter(target: "USD" | "ARS", arsPerUsd: number | null): Converter {
  return (amount, from) => {
    const source = (from || "USD").toUpperCase() === "ARS" ? "ARS" : "USD";
    if (source === target) return amount;
    if (!arsPerUsd || arsPerUsd <= 0) return null;
    return target === "ARS" ? amount * arsPerUsd : amount / arsPerUsd;
  };
}

export interface PricedOfferInput {
  currency: string | null;
  costNet: number | null;
  costTaxes: TaxLine[];
  /** Margen de venta del comercio para esta oferta (reglas del modo vendedor). */
  providerMarginPercent: number;
  /** Base de ese margen según el distribuidor. Con margen fijo de la key, siempre NET. */
  marginBase: SaleMarginBase;
  source: string;
}

/**
 * Precio de una oferta según la config de la key.
 *
 * - Costo: lo que el comercio le paga al distribuidor (neto + impuestos + percepciones).
 * - Venta con el margen de la key (`fixed`, sobre el neto) o el del comercio
 *   (`provider`: reglas del modo vendedor y su base por distribuidor).
 *   NET: neto con margen, más IVA e internos sobre ese neto. FINAL: el costo
 *   final (con percepciones) por el margen; el neto se despeja sin IVA ni
 *   internos. Las percepciones nunca se trasladan como impuesto de la venta.
 * - El redondeo se aplica al precio de venta final (`sale.gross`).
 */
export function priceOffer(
  input: PricedOfferInput,
  config: ApiClientConfig["price"],
  convert: Converter
): ApiPrice | null {
  if (input.costNet == null || !(input.costNet > 0)) return null;
  const from = input.currency ?? "USD";
  const net = convert(input.costNet, from);
  if (net == null) return null;
  const taxes: ApiTax[] = [];
  for (const line of input.costTaxes) {
    const amount = convert(line.unitAmount, from);
    if (amount == null) return null;
    taxes.push({
      type: TYPE_BY_KIND[line.kind],
      label: line.label,
      percent: line.percent,
      amount: round2(amount),
      ...(line.estimated ? { estimated: true } : {}),
    });
  }
  const gross = round2(net + taxes.reduce((s, t) => s + t.amount, 0));

  const fixedMarkup = config.markup.mode === "fixed";
  const markupPercent = fixedMarkup ? Number(config.markup.percent ?? 0) || 0 : input.providerMarginPercent;
  const base: SaleMarginBase = fixedMarkup ? "NET" : input.marginBase;
  const factor = 1 + markupPercent / 100;
  const resale = taxes.filter((t) => t.type !== "perception");
  const rate = resale.reduce((s, t) => s + (t.percent ?? 0), 0) / 100;
  const fixedAmounts = resale.reduce((s, t) => s + (t.percent == null ? t.amount : 0), 0);
  const saleNet = base === "FINAL" ? (gross * factor - fixedAmounts * factor) / (1 + rate) : net * factor;
  const saleTaxes = resale.map((t) => ({
    ...t,
    amount: round2(t.percent != null ? saleNet * (t.percent / 100) : t.amount * factor),
  }));
  const saleGross = roundSalePrice(saleNet + saleTaxes.reduce((s, t) => s + t.amount, 0), config.rounding);

  const price: ApiPrice = { currency: config.currency, listSource: listSource(input.source) };
  if (config.includeCost) {
    price.cost = { net: round2(net), ...(config.includeTaxes ? { taxes } : {}), gross: config.includeTaxes ? gross : round2(net) };
  }
  if (config.includeSalePrice) {
    price.sale = {
      net: round2(saleNet),
      ...(config.includeTaxes ? { taxes: saleTaxes } : {}),
      gross: config.includeTaxes ? saleGross : roundSalePrice(saleNet, config.rounding),
      markupPercent: round2(markupPercent),
    };
  }
  return price;
}

function listSource(source: string): ApiPrice["listSource"] {
  if (source === "OWN_LIST") return "list";
  if (source === "BASE_LIST") return "base_list";
  return "api";
}

/** El número con el que se ordena y filtra por precio: venta final si se expone, si no costo final. */
export function comparablePrice(price: ApiPrice | null): number | null {
  if (!price) return null;
  return price.sale?.gross ?? price.cost?.gross ?? null;
}
