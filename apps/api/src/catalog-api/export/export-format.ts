import type { OfferView, ProductView } from "../core/projection";

/** Columnas del export, en el orden en que se escriben. */
export const OFFER_COLUMNS = [
  "offer_id",
  "product_id",
  "provider_id",
  "provider_name",
  "external_id",
  "sku",
  "name",
  "brand",
  "category",
  "ean",
  "part_number",
  "stock",
  "stock_status",
  "currency",
  "cost_net",
  "cost_taxes",
  "cost_gross",
  "sale_net",
  "sale_gross",
  "markup_percent",
  "image_url",
  "synced_at",
  "stale",
  "updated_at",
] as const;

export const PRODUCT_COLUMNS = [
  "product_id",
  "name",
  "brand",
  "category",
  "subcategory",
  "ean",
  "part_number",
  "sku",
  "offers",
  "in_stock",
  "total_stock",
  "currency",
  "best_offer_id",
  "best_provider",
  "best_cost_gross",
  "best_sale_gross",
  "price_min",
  "price_max",
  "image_url",
  "images",
  "warranty",
  "weight",
  "weight_unit",
  "height",
  "width",
  "length",
  "dimensions_unit",
  "description",
  "updated_at",
] as const;

type Cell = string | number | boolean | null;

export function offerRecord(o: OfferView): Record<(typeof OFFER_COLUMNS)[number], Cell> {
  const taxes = o.price?.cost?.taxes?.reduce((s, t) => s + t.amount, 0) ?? null;
  return {
    offer_id: o.id,
    product_id: o.productId,
    provider_id: o.provider.id,
    provider_name: o.provider.name,
    external_id: o.externalId ?? null,
    sku: o.sku,
    name: o.product?.name ?? null,
    brand: o.product?.brand?.name ?? null,
    category: o.product?.category?.name ?? null,
    ean: o.product?.ean ?? null,
    part_number: o.product?.partNumber ?? null,
    stock: o.stock.quantity,
    stock_status: o.stock.status,
    currency: o.price?.currency ?? null,
    cost_net: o.price?.cost?.net ?? null,
    cost_taxes: taxes == null ? null : Math.round(taxes * 100) / 100,
    cost_gross: o.price?.cost?.gross ?? null,
    sale_net: o.price?.sale?.net ?? null,
    sale_gross: o.price?.sale?.gross ?? null,
    markup_percent: o.price?.sale?.markupPercent ?? null,
    image_url: o.product?.imageUrl ?? null,
    synced_at: o.freshness.syncedAt,
    stale: o.freshness.stale,
    updated_at: o.updatedAt,
  };
}

export function productRecord(p: ProductView): Record<(typeof PRODUCT_COLUMNS)[number], Cell> {
  const best = p.bestOffer;
  return {
    product_id: p.id,
    name: p.name,
    brand: p.brand?.name ?? null,
    category: p.category?.name ?? null,
    subcategory: p.subcategory?.name ?? null,
    ean: p.ean,
    part_number: p.partNumber,
    sku: p.sku,
    offers: p.availability.offers,
    in_stock: p.availability.inStock,
    total_stock: p.availability.totalStock,
    currency: best?.price?.currency ?? null,
    best_offer_id: best?.id ?? null,
    best_provider: best?.provider.name ?? null,
    best_cost_gross: best?.price?.cost?.gross ?? null,
    best_sale_gross: best?.price?.sale?.gross ?? null,
    price_min: p.priceRange?.min ?? null,
    price_max: p.priceRange?.max ?? null,
    image_url: p.images[0]?.url ?? null,
    images: p.images.map((i) => i.url).join(" | ") || null,
    warranty: p.specs.warranty,
    weight: p.specs.weight?.value ?? null,
    weight_unit: p.specs.weight?.unit ?? null,
    height: p.specs.dimensions?.height ?? null,
    width: p.specs.dimensions?.width ?? null,
    length: p.specs.dimensions?.length ?? null,
    dimensions_unit: p.specs.dimensions?.unit ?? null,
    description: p.description,
    updated_at: p.updatedAt,
  };
}

/** Celda CSV (RFC 4180). Una celda que empieza con =,+,-,@ se escapa para que Excel no la ejecute. */
export function csvCell(value: Cell, delimiter: string): string {
  if (value == null) return "";
  let text = typeof value === "boolean" ? (value ? "true" : "false") : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (text.includes('"') || text.includes(delimiter) || /[\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvLine(cells: Cell[], delimiter: string): string {
  return `${cells.map((c) => csvCell(c, delimiter)).join(delimiter)}\r\n`;
}
