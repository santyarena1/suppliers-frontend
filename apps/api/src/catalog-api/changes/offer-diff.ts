import { createHash } from "crypto";

/** Lo que el rastreador recuerda de cada oferta para saber qué cambió. */
export interface OfferStateLike {
  price: string | null;
  finalPrice: string | null;
  stock: number | null;
  active: boolean;
  productHash: string;
}

export type ChangedField = "price" | "stock" | "product" | "active";

export interface OfferChange {
  type: "offer.created" | "offer.updated" | "offer.removed";
  changed: ChangedField[];
  data: { before: { price: string | null; stock: number | null } | null; after: { price: string | null; stock: number | null } | null };
}

/** Hash de la ficha: si cambia, el producto cambió para el integrador (nombre, foto, datos). */
export function productHash(p: Record<string, unknown>): string {
  const fields = [
    "name",
    "brand",
    "category",
    "subcategory",
    "sku",
    "partNumber",
    "ean",
    "description",
    "longDescription",
    "imageUrl",
    "productUrl",
    "warranty",
    "weight",
    "weightUnit",
    "height",
    "width",
    "length",
    "dimensionsUnit",
    "volume",
    "tags",
  ];
  const text = fields.map((f) => (p[f] == null ? "" : String(p[f]))).join("\u0001");
  return createHash("sha1").update(text).digest("hex");
}

/** Decimal de Prisma (o número) a texto canónico, para comparar sin errores de coma flotante. */
export function decimalText(v: unknown): string | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(4) : null;
}

/**
 * Qué evento corresponde comparando la oferta de antes con la de ahora.
 * `null` si no cambió nada que le importe a un integrador.
 */
export function diffOffer(before: OfferStateLike | null, after: OfferStateLike | null): OfferChange | null {
  const snap = (s: OfferStateLike | null) => (s ? { price: s.price, stock: s.stock } : null);
  const visible = (s: OfferStateLike | null) => Boolean(s?.active);
  if (!visible(before) && !visible(after)) return null;
  if (!visible(before)) return { type: "offer.created", changed: [], data: { before: null, after: snap(after) } };
  if (!visible(after)) return { type: "offer.removed", changed: ["active"], data: { before: snap(before), after: null } };
  const changed: ChangedField[] = [];
  if (before!.price !== after!.price || before!.finalPrice !== after!.finalPrice) changed.push("price");
  if (before!.stock !== after!.stock) changed.push("stock");
  if (before!.productHash !== after!.productHash) changed.push("product");
  if (changed.length === 0) return null;
  return { type: "offer.updated", changed, data: { before: snap(before), after: snap(after) } };
}
