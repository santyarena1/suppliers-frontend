import type { NormalizedProduct } from "./types";
import { asNumber, asRecord, asString, NB_SITE_BASE, unwrapNbList } from "./new-bytes-client";

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

export interface NbOrderItem {
  code?: string;
  name: string;
  qty?: number;
  price?: number;
  total?: number;
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
  notes?: string;
  payment?: string;
  delivery?: string;
  address?: string;
  items?: NbOrderItem[];
  subtotalUsd?: number;
  iva?: number;
  perceptions?: number;
  perceptionLabel?: string;
  totalUsd?: number;
  totalArs?: number;
  exchangeRate?: number;
  [key: string]: unknown;
}

const ITEM_LIST_KEYS = ["items", "details", "products", "articulos", "orderItems", "lineas", "lines", "cartItems"];

function looksLikeNbItem(raw: unknown): boolean {
  const rec = asRecord(raw);
  if (!rec) return false;
  return Boolean(
    rec.productId != null
    || rec.product
    || rec.amount != null
    || rec.qty != null
    || rec.quantity != null
    || rec.sku
    || rec.title
  );
}

function unwrapOrderRecord(body: unknown): Record<string, unknown> {
  const rec = asRecord(body) ?? {};
  const list = unwrapNbList(body);
  if (list.length === 1 && asRecord(list[0]) && !looksLikeNbItem(list[0])) {
    return asRecord(list[0]) ?? rec;
  }
  const nested = asRecord(rec.data);
  if (nested) return nested;
  return rec;
}

function pickNbLabel(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "string" || typeof raw === "number") return asString(raw);
  const rec = asRecord(raw);
  if (!rec) return undefined;
  return asString(rec.description)
    || asString(rec.nombre)
    || asString(rec.label)
    || asString(rec.name)
    || asString(rec.title);
}

export function formatNbAddressLine(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "string" || typeof raw === "number") return asString(raw);
  const rec = asRecord(raw);
  if (!rec) return undefined;
  const street = asString(rec.direccion) || asString(rec.address) || asString(rec.calle) || asString(rec.addressLine);
  const place = asString(rec.localidad) || asString(rec.placeString) || asString(rec.place);
  const province = asString(rec.provincia) || asString(rec.province);
  const postal = asString(rec.codigoPostal) || asString(rec.postalCode) || asString(rec.cp);
  const line = [street, place, province, postal].filter(Boolean).join(", ");
  return line || asString(rec.label) || asString(rec.identificador);
}

function parseNbItemPrice(rec: Record<string, unknown>, product: Record<string, unknown>): number | undefined {
  const priceObj = asRecord(product.price) ?? asRecord(rec.price);
  return asNumber(priceObj?.value)
    ?? asNumber(priceObj?.finalPrice)
    ?? asNumber(rec.priceUsd)
    ?? asNumber(rec.unitPrice)
    ?? asNumber(rec.price)
    ?? asNumber(product.price);
}

export function parseNbOrderItems(raw: unknown): NbOrderItem[] {
  const rec = asRecord(raw) ?? unwrapOrderRecord(raw);
  let rows: unknown[] = [];
  for (const key of ITEM_LIST_KEYS) {
    const value = rec[key];
    if (Array.isArray(value) && value.length > 0) {
      rows = value;
      break;
    }
  }
  if (rows.length === 0) {
    const nested = asRecord(rec.data);
    if (nested) {
      for (const key of ITEM_LIST_KEYS) {
        const value = nested[key];
        if (Array.isArray(value) && value.length > 0) {
          rows = value;
          break;
        }
      }
    }
  }
  if (rows.length === 0) {
    const list = unwrapNbList(raw);
    if (list.length > 0 && list.every(looksLikeNbItem)) rows = list;
  }
  return rows.map((row) => {
    const item = asRecord(row) ?? {};
    const product = asRecord(item.product) ?? item;
    const code = asString(item.productId)
      || asString(product.id)
      || asString(item.sku)
      || asString(product.sku)
      || asString(item.codigo)
      || asString(item.code);
    const name = asString(product.title)
      || asString(item.title)
      || asString(item.name)
      || asString(item.detalle)
      || asString(item.description)
      || code
      || "Ítem";
    const qty = asNumber(item.amount) ?? asNumber(item.qty) ?? asNumber(item.quantity) ?? asNumber(item.cantidad);
    const price = parseNbItemPrice(item, product);
    const total = asNumber(item.subtotal) ?? asNumber(item.total) ?? asNumber(item.lineTotal)
      ?? (price != null && qty != null ? price * qty : undefined);
    return { code, name, qty, price, total };
  }).filter((it) => it.name);
}

function extraOrderFields(rec: Record<string, unknown>): Partial<NbOrderRow> {
  const items = parseNbOrderItems(rec);
  const subs = parseNbSubtotales(rec.subtotal != null ? rec.subtotal : rec);
  const quote = asNumber(asRecord(rec.subtotal)?.currencyQuote) ?? asNumber(rec.currencyQuote) ?? asNumber(rec.cotizacion);
  const notes = asString(rec.note) || asString(rec.notes) || asString(rec.observaciones) || asString(rec.comentario);
  const payment = pickNbLabel(rec.paymentDescription ?? rec.medioDePago ?? rec.payMethod ?? rec.payment);
  const delivery = pickNbLabel(rec.shippingDescription ?? rec.medioDeEnvio ?? rec.delivery ?? rec.envio ?? rec.shipping);
  const address = formatNbAddressLine(rec.shippingAddress ?? rec.address ?? rec.direccion ?? rec.destino);
  const drop = rec.dropShipping;
  return {
    notes,
    payment,
    delivery,
    address,
    ...(drop != null ? { dropShipping: drop === true || drop === "true" || drop === 1 } : {}),
    items: items.length > 0 ? items : undefined,
    subtotalUsd: subs.subtotalUsd,
    iva: subs.iva,
    perceptions: subs.perceptions,
    perceptionLabel: subs.perceptions != null ? subs.perceptionLabel : undefined,
    totalUsd: subs.totalUsd,
    exchangeRate: quote,
    totalArs: subs.totalUsd != null && quote != null ? subs.totalUsd * quote : undefined,
  };
}

export function normalizeOrderRow(raw: unknown): NbOrderRow {
  const rec = unwrapOrderRecord(raw);
  const orderNumber = asString(rec.orderNumber) || asString(rec.orderId) || asString(rec.id);
  const albNumber = asString(rec.albNumber);
  const branch = asString(rec.branch);
  const status = asString(rec.statusDescription) || asString(rec.status) || asString(rec.estado) || "";
  const date = asString(rec.date) || asString(rec.fecha) || asString(rec.createdAt) || "";
  const amount = rec.amount ?? rec.total ?? rec.importe;
  const extra = extraOrderFields(rec);
  return {
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
    ...extra,
  };
}

export function normalizeOrderDetail(raw: unknown): NbOrderRow {
  return normalizeOrderRow(raw);
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

export type NbDeliveryMode = "pickup" | "shipping";

/** Sucursal fija de retiro según developers.nb.com.ar. */
export const NB_PICKUP_BRANCH = {
  value: "pickup" as const,
  label: "Retiro en New Bytes",
  addressLine: "Av. Jujuy 1039, CABA",
  postalCode: "C1229ABF",
};

export interface NbShippingQuote {
  id: string;
  label: string;
  plazo?: string;
  total?: number;
}

export interface NbDatosBultos {
  weightKg: number;
  sizeCm: string;
  amount: number;
}

export interface NbSubtotales {
  subtotalUsd?: number;
  totalUsd?: number;
  iva?: number;
  perceptions?: number;
  perceptionLabel: string;
  raw: Record<string, unknown> | null;
}

export interface NbAvailabilityIssue {
  code?: string;
  message: string;
}

export interface NbAvailability {
  ok: boolean;
  issues: NbAvailabilityIssue[];
  raw: unknown;
}

export function filterPaymentsForDelivery(
  payments: NbPaymentOption[],
  delivery: NbDeliveryMode
): NbPaymentOption[] {
  if (delivery === "shipping") return payments.filter((p) => !p.pickupOnly);
  return payments;
}

export function parseDatosBultos(raw: unknown): NbDatosBultos | undefined {
  const rec = asRecord(raw);
  if (!rec) return undefined;
  const weightKg = asNumber(rec.weightKg) ?? 0;
  const sizeCm = asString(rec.sizeCm) || "0x0x0";
  const amount = asNumber(rec.amount) ?? 1;
  return { weightKg, sizeCm, amount };
}

export function parseShippingQuote(body: unknown): { quotes: NbShippingQuote[]; datosBultos?: NbDatosBultos } {
  const rec = asRecord(body) ?? {};
  const quotes: NbShippingQuote[] = [];
  for (const row of unwrapNbList(rec.cotizacion ?? rec)) {
    const item = asRecord(row) ?? {};
    const id = asString(item.id);
    if (!id) continue;
    quotes.push({
      id,
      label: asString(item.description) || asString(item.descripcion) || `Envío ${id}`,
      plazo: asString(item.plazoEntrega),
      total: asNumber(item.total),
    });
  }
  return { quotes, datosBultos: parseDatosBultos(rec.datosBulto ?? rec.datosBultos) };
}

export function parseNbSubtotales(body: unknown): NbSubtotales {
  const rec = asRecord(body);
  if (!rec) return { raw: null, perceptionLabel: "Percepciones" };
  const nested = asRecord(rec.subtotal) ?? rec;
  const iibb = asNumber(nested.perceptionsIIBB);
  const generic = asNumber(nested.perceptions);
  return {
    subtotalUsd: asNumber(nested.subTotalDollar) ?? asNumber(nested.subTotal),
    totalUsd: asNumber(nested.subTotalDollarFinal) ?? asNumber(nested.subTotalFinal) ?? asNumber(nested.subTotalDollar),
    iva: asNumber(nested.iva) ?? asNumber(nested.IVA),
    perceptions: iibb ?? generic,
    perceptionLabel: iibb != null ? "IIBB" : "Percepciones",
    raw: rec,
  };
}

export function parseNbAvailability(body: unknown): NbAvailability {
  const issues: NbAvailabilityIssue[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 4 || node == null) return;
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1));
      return;
    }
    const rec = asRecord(node);
    if (!rec) return;
    const available = rec.available ?? rec.isAvailable ?? rec.ok;
    const message = asString(rec.message) || asString(rec.motivo) || asString(rec.reason) || asString(rec.status);
    const code = asString(rec.productId) || asString(rec.id) || asString(rec.sku);
    if (available === false || available === "false") {
      issues.push({ code, message: message || `Sin disponibilidad${code ? ` (${code})` : ""}` });
    } else if (message && /sin stock|no disponible|faltante|unavailable/i.test(message)) {
      issues.push({ code, message });
    }
    for (const value of Object.values(rec)) {
      if (value && typeof value === "object") visit(value, depth + 1);
    }
  };
  visit(body, 0);
  return { ok: issues.length === 0, issues, raw: body };
}

export function buildNbProcessBody(input: {
  delivery: NbDeliveryMode;
  medioDePagoId: number;
  notes?: string;
  postalCode?: string;
  medioDeEnvioId?: number;
  addressId?: string;
  datosBultos?: NbDatosBultos;
  dropShipping?: boolean;
  dropShippingClientName?: string;
  dropShippingClientEmail?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    note: input.notes ?? "",
    medioDePagoId: input.medioDePagoId,
  };
  if (input.delivery === "pickup") return body;

  body.codigoPostalFavorito = input.postalCode;
  body.mediodeEnvioId = input.medioDeEnvioId;
  body.idDirCli = input.addressId;
  if (input.datosBultos) body.datosBultos = input.datosBultos;
  if (input.dropShipping) {
    body.dropShipping = true;
    if (input.dropShippingClientName || input.dropShippingClientEmail) {
      body.dpPayload = {
        clientName: input.dropShippingClientName,
        clientEmail: input.dropShippingClientEmail,
      };
    }
  }
  return body;
}
