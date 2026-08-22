import type { NormalizedProduct } from "./types";
import { asNumber, asRecord, asString, NB_SITE_BASE } from "./new-bytes-client";

export interface NbCsvRow {
  CODIGO?: string;
  "ID FABRICANTE"?: string;
  CATEGORIA?: string;
  DETALLE?: string;
  IMAGEN?: string;
  IVA?: string;
  STOCK?: string;
  GARANTIA?: string;
  MONEDA?: string;
  PRECIO?: string;
  "PRECIO FINAL"?: string;
  ATRIBUTOS?: string;
  CATEGORIA_USUARIO?: string;
  DETALLE_USUARIO?: string;
  PESO?: string;
  ALTO?: string;
  ANCHO?: string;
  LARGO?: string;
  MARCA?: string;
  [key: string]: string | undefined;
}

export interface NbJsonProduct {
  id?: number | string;
  sku?: string;
  title?: string;
  category?: string;
  categoryId?: number;
  categoryDescriptionUser?: string | null;
  brand?: string;
  brandId?: number;
  mainImage?: string;
  mainImageExp?: string;
  stock?: string | number | null;
  amountStock?: number | string | null;
  warranty?: string;
  cotizacion?: number;
  price?: {
    value?: number;
    iva?: number;
    finalPrice?: number;
    finalPriceWithUtility?: number;
    percepcion?: number | null;
  } | null;
  weightAverage?: number;
  widthAverage?: number;
  lengthAverage?: number;
  highAverage?: number;
  ean?: string | number;
  [key: string]: unknown;
}

export interface NbDescriptionItem {
  codigo?: number | string;
  description?: string;
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function nbProductUrl(id: string, title?: string): string {
  const slug = title ? slugify(title) : "";
  return slug ? `${NB_SITE_BASE}/${slug}_-_${id}` : `${NB_SITE_BASE}/_-_${id}`;
}

function stockFromTextOrNumber(stock: unknown, amountStock: unknown): { stock?: number; stockStatus?: string } {
  const amount = asNumber(amountStock);
  const text = asString(stock);
  const numericText = text && /^\d+([.,]\d+)?$/.test(text) ? asNumber(text) : undefined;
  const qty = amount ?? numericText;
  const status = text && numericText == null ? text : undefined;
  return { stock: qty, stockStatus: status };
}

/** Mapeo columna-a-columna del CSV de lista de precios. */
export function mapCsvProduct(r: NbCsvRow): NormalizedProduct {
  const ivaRaw = asString(r.IVA)?.replace("%", "").trim();
  const stockParsed = stockFromTextOrNumber(r.STOCK, r.STOCK);
  const name = asString(r.DETALLE_USUARIO) || asString(r.DETALLE) || "";
  const id = asString(r.CODIGO) || "";
  return {
    externalId: id,
    sku: asString(r["ID FABRICANTE"]),
    partNumber: asString(r["ID FABRICANTE"]),
    name,
    brand: asString(r.MARCA),
    category: asString(r.CATEGORIA_USUARIO) || asString(r.CATEGORIA),
    description: asString(r.DETALLE) && asString(r.DETALLE_USUARIO) && r.DETALLE !== r.DETALLE_USUARIO
      ? asString(r.DETALLE)
      : undefined,
    longDescription: asString(r.ATRIBUTOS),
    price: asNumber(r.PRECIO),
    finalPrice: asNumber(r["PRECIO FINAL"]),
    currency: asString(r.MONEDA)?.includes("U$") || asString(r.MONEDA)?.toUpperCase().includes("USD") ? "USD" : "ARS",
    ivaPercent: asNumber(ivaRaw),
    stock: stockParsed.stock,
    stockStatus: stockParsed.stockStatus,
    imageUrl: asString(r.IMAGEN),
    productUrl: id ? nbProductUrl(id, name) : undefined,
    warranty: asString(r.GARANTIA),
    weight: asNumber(r.PESO),
    height: asNumber(r.ALTO),
    width: asNumber(r.ANCHO),
    length: asNumber(r.LARGO),
    raw: r,
  };
}

/**
 * Mapeo del catálogo JSON autenticado (`GET /v1/`), el mismo que usa el
 * sitio y el plugin WooCommerce oficial. Unidades: weightAverage en gramos,
 * dimensiones *Average en milímetros — se convierten a kg/cm como hace el
 * conector oficial, y se deja la unidad explícita.
 */
export function mapJsonProduct(p: NbJsonProduct): NormalizedProduct | null {
  const id = asString(p.id);
  const name = asString(p.title);
  if (!id || !name) return null;
  const stockParsed = stockFromTextOrNumber(p.stock, p.amountStock);
  const price = p.price ?? undefined;
  return {
    externalId: id,
    sku: asString(p.sku),
    partNumber: asString(p.sku),
    ean: asString(p.ean),
    name,
    brand: asString(p.brand),
    category: asString(p.categoryDescriptionUser) || asString(p.category),
    price: asNumber(price?.value),
    finalPrice: asNumber(price?.finalPrice ?? price?.finalPriceWithUtility),
    currency: "USD",
    ivaPercent: asNumber(price?.iva),
    stock: stockParsed.stock,
    stockStatus: stockParsed.stockStatus,
    imageUrl: asString(p.mainImageExp) || asString(p.mainImage),
    productUrl: nbProductUrl(id, name),
    warranty: asString(p.warranty),
    weight: asNumber(p.weightAverage) != null ? asNumber(p.weightAverage)! / 1000 : undefined,
    weightUnit: asNumber(p.weightAverage) != null ? "kg" : undefined,
    width: asNumber(p.widthAverage) != null ? asNumber(p.widthAverage)! / 10 : undefined,
    length: asNumber(p.lengthAverage) != null ? asNumber(p.lengthAverage)! / 10 : undefined,
    height: asNumber(p.highAverage) != null ? asNumber(p.highAverage)! / 10 : undefined,
    dimensionsUnit: [p.widthAverage, p.lengthAverage, p.highAverage].some((v) => asNumber(v) != null) ? "cm" : undefined,
    raw: p,
  };
}

export function descriptionMap(items: NbDescriptionItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    const code = asString(item.codigo);
    const desc = asString(item.description);
    if (code && desc) map.set(code, desc);
  }
  return map;
}

export function applyDescription(product: NormalizedProduct, desc?: string): NormalizedProduct {
  if (!desc) return product;
  return { ...product, longDescription: product.longDescription || desc, description: product.description || desc.slice(0, 1000) };
}

/** Extrae un parche de ficha (`GET /item/:id` o `GET /?product_id=`) sin inventar campos. */
export function extractItemPatch(body: unknown): Partial<NormalizedProduct> {
  const list = Array.isArray(body) ? body : body ? [body] : [];
  const raw = (list[0] ?? null) as unknown;
  const rec = asRecord(raw);
  if (!rec) return {};
  const product = mapJsonProduct(rec as NbJsonProduct);
  if (!product) return {};
  const patch: Partial<NormalizedProduct> = {};
  const keys: (keyof NormalizedProduct)[] = [
    "sku", "partNumber", "ean", "brand", "category", "subcategory",
    "description", "longDescription", "imageUrl", "productUrl", "warranty",
    "stock", "stockStatus", "weight", "weightUnit", "height", "width", "length",
    "dimensionsUnit", "ivaPercent",
  ];
  for (const key of keys) {
    const value = product[key];
    if (value != null && value !== "") (patch as Record<string, unknown>)[key] = value;
  }
  const extraDesc = asString(rec.description) || asString(rec.longDescription) || asString(rec.ficha) || asString(rec.attributes);
  if (extraDesc) {
    patch.longDescription = extraDesc;
    if (!patch.description) patch.description = extraDesc.slice(0, 1000);
  }
  return patch;
}

export interface NbOrderRow {
  orderNumber?: string;
  webOrderNumber?: string;
  albNumber?: string;
  branch?: string | number;
  status?: string;
  statusDescription?: string;
  date?: string;
  amount?: string | number;
  clientName?: string;
  invoice?: string;
  trackingNumber?: string;
  dropShipping?: boolean;
  total?: number;
  [key: string]: unknown;
}

export function normalizeOrderRow(raw: unknown): NbOrderRow {
  const rec = asRecord(raw) ?? {};
  const orderNumber = asString(rec.orderNumber) || asString(rec.orderId) || asString(rec.id);
  const albNumber = asString(rec.albNumber);
  const branch = asString(rec.branch);
  const status = asString(rec.statusDescription) || asString(rec.status) || asString(rec.estado) || "";
  const date = asString(rec.date) || asString(rec.fecha) || asString(rec.createdAt) || "";
  const amount = rec.amount ?? rec.total ?? rec.importe;
  return {
    ...rec,
    orderNumber: orderNumber ?? albNumber,
    webOrderNumber: albNumber || (branch && orderNumber ? `${branch}-${orderNumber}` : orderNumber),
    albNumber,
    branch,
    status,
    statusDescription: status,
    date,
    amount: amount as string | number | undefined,
    clientName: asString(rec.clientName),
    trackingNumber: asString(rec.trackingNumber),
    invoice: asString(rec.invoice),
  };
}

export interface NbComprobanteRow {
  voucherId?: string | number;
  invoiceDate?: string;
  invoiceType?: string;
  invoiceNumber?: string;
  invoiceLabel?: string;
  branch?: string | number;
  currency?: string;
  subtotalUsd?: number;
  totalUsd?: number;
  subtotalArs?: number;
  totalArs?: number;
  perceptions?: number;
  voucherUrl?: string;
  [key: string]: unknown;
}

export function normalizeComprobante(raw: unknown): NbComprobanteRow {
  const rec = asRecord(raw) ?? {};
  const sub = asRecord(rec.subtotal) ?? {};
  const subTotal = asNumber(sub.subTotal);
  const subTotalFinal = asNumber(sub.subTotalFinal);
  const quote = asNumber(sub.currencyQuote) ?? 1;
  const perceptions = asNumber(sub.perceptionsIIBB) ?? asNumber(sub.perceptions);
  return {
    ...rec,
    voucherId: asString(rec.voucherId) || asString(rec.id),
    invoiceDate: asString(rec.invoiceDate) || asString(rec.date) || asString(rec.fecha),
    invoiceType: asString(rec.invoiceType) || asString(rec.tipo) || asString(rec.docType),
    invoiceNumber: asString(rec.invoiceNumber) || asString(rec.numero) || asString(rec.docNumber),
    invoiceLabel: asString(rec.invoiceLabel) || asString(rec.descripcion) || asString(rec.label),
    branch: asString(rec.branch) || asString(rec.sucursal),
    currency: asString(rec.currency),
    subtotalUsd: subTotal,
    totalUsd: subTotalFinal,
    subtotalArs: subTotal != null ? subTotal * quote : undefined,
    totalArs: subTotalFinal != null ? subTotalFinal * quote : undefined,
    perceptions,
    voucherUrl: asString(rec.voucherUrl),
  };
}

export function pickBalanceFromClient(client: unknown): number | null {
  const rec = asRecord(client);
  if (!rec) return null;
  for (const key of ["saldo", "balance", "accountBalance", "ctaCte", "cuentaCorriente", "currentBalance", "creditBalance"]) {
    const n = asNumber(rec[key]);
    if (n != null) return n;
    const nested = asRecord(rec[key]);
    if (nested) {
      const inner = asNumber(nested.saldo ?? nested.balance ?? nested.total);
      if (inner != null) return inner;
    }
  }
  return null;
}

export const NB_REDIRECT_PAYMENT_IDS = new Set([11, 15]);

export function isPickupPayment(payMethodId: number, description: string): boolean {
  if (payMethodId === 5) return true;
  return /caja|efectivo|retiro|sucursal/i.test(description);
}

export interface NbPaymentOption {
  value: string;
  label: string;
  interest: number;
  pickupOnly: boolean;
}

export function mapPaymentOption(raw: unknown): NbPaymentOption | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const id = asNumber(rec.payMethodId ?? rec.id ?? rec.medioDePagoId);
  if (id == null || NB_REDIRECT_PAYMENT_IDS.has(id)) return null;
  const label = asString(rec.description) || asString(rec.nombre) || `Medio ${id}`;
  return {
    value: String(id),
    label,
    interest: asNumber(rec.interest) ?? 0,
    pickupOnly: isPickupPayment(id, label),
  };
}

export function extractProcessResult(body: unknown): { orderId?: string; branch?: string; raw: unknown } {
  const rec = asRecord(body) ?? {};
  const nested = asRecord(rec.data) ?? rec;
  return {
    orderId: asString(nested.orderId) || asString(nested.orderNumber) || asString(nested.id) || asString(rec.orderId),
    branch: asString(nested.branch) || asString(rec.branch),
    raw: body,
  };
}
