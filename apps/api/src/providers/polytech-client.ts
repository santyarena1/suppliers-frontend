import { BadGatewayException } from "@nestjs/common";
import { createHash } from "crypto";
import type { NormalizedProduct } from "./types";
import { asNumber, asRecord, asString } from "./json-value";

/** Portal de Gestión Resellers (Polytech). El mismo token Basic abre catálogo, cuenta y pedidos. */
export const POLYTECH_API = "https://beta.gestionresellers.com.ar/api";

/** El portal acepta 50 por página. 100 devuelve 502. La doc pública pide como máximo 1 request/s. */
export const POLYTECH_PAGE_SIZE = 50;
export const POLYTECH_MIN_INTERVAL_MS = 1100;

const TOKEN_TTL_MS = 30 * 60 * 1000;

export interface PolytechCredentials {
  apiKey?: string;
  username?: string;
  password?: string;
}

export interface PolytechMoney {
  amount: number;
  currency: string;
}

export interface PolytechAddress {
  id: string;
  address: string;
  phone: string | null;
}

export interface PolytechCourier {
  id: string;
  name: string;
}

export interface PolytechPerception {
  id: string;
  description: string;
  /** Puntos, p. ej. 3 para "3.00 %". */
  percent: number;
}

export interface PolytechAccount {
  legalName: string | null;
  userName: string | null;
  email: string | null;
  phone: string | null;
  showsVat: boolean;
  addresses: PolytechAddress[];
  perceptions: PolytechPerception[];
  exchangeRate: number | null;
  couriers: PolytechCourier[];
}

export interface PolytechHistoryOrder {
  id: string;
  bucket: "pending" | "in_process" | "shipped";
  createdAt: string | null;
  total: number | null;
  currency: string | null;
}

export interface PolytechDetailLine {
  sku: string;
  description: string;
  quantity: number | null;
  vat: string | null;
  total: number | null;
  currency: string | null;
}

export interface PolytechSearchPage {
  items: unknown[];
  currentPage: number;
  totalPages: number;
}

export interface PolytechCreatedOrder {
  orderId: string;
  mercadopagoUrl: string | null;
}

type TokenEntry = { apiKey: string; expiresAt: number };
const tokenCache = new Map<string, TokenEntry>();

export function parsePolytechCredentials(raw: Record<string, string>): PolytechCredentials {
  const apiKey = (raw.api_key ?? raw.apiKey ?? raw.token ?? raw.key ?? "").trim();
  const username = (raw.username ?? raw.user ?? raw.usuario ?? "").trim();
  const password = (raw.password ?? raw.pass ?? "").trim();
  return {
    apiKey: apiKey || undefined,
    username: username || undefined,
    password: password || undefined,
  };
}

export function hasPolytechAccess(creds: PolytechCredentials): boolean {
  if (creds.apiKey) return true;
  return Boolean(creds.username && creds.password);
}

/** "3.00 %" → 3. Lo que no es un porcentaje se descarta. */
export function parsePolytechPercent(raw: unknown): number | null {
  const text = asString(raw);
  if (!text) return null;
  const n = Number(text.replace("%", "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

/** Cantidad pedible: stock real, o hasta 10 del reingreso cuando el stock es 0 (igual que el portal). */
export function polytechOrderableQty(stock: number | null, restocking: number): number {
  if (stock != null && stock > 0) return stock;
  if ((stock ?? 0) === 0 && restocking > 0) return Math.min(restocking, 10);
  return 0;
}

export function polytechMoney(raw: unknown): PolytechMoney | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const amount = asNumber(rec.amount);
  if (amount == null) return null;
  return { amount, currency: (asString(rec.currency) ?? "USD").toUpperCase() };
}

function bestImageUrl(image: Record<string, unknown>): string | undefined {
  const thumbs = Array.isArray(image.thumbnails) ? image.thumbnails : [];
  let bestUrl = asString(image.url);
  let bestWidth = asNumber(image.width) ?? 0;
  for (const thumb of thumbs) {
    const rec = asRecord(thumb);
    if (!rec) continue;
    const url = asString(rec.url);
    const width = asNumber(rec.width) ?? 0;
    if (url && width >= bestWidth) {
      bestUrl = url;
      bestWidth = width;
    }
  }
  return bestUrl;
}

function measure(raw: unknown): { value?: number; unit?: string } {
  const rec = asRecord(raw);
  if (!rec) return {};
  const value = asNumber(rec.value);
  return { value: value != null ? value : undefined, unit: asString(rec.unit) };
}

function slimRaw(item: Record<string, unknown>): Record<string, unknown> {
  const images = Array.isArray(item.images) ? item.images : null;
  if (!images) return item;
  return {
    ...item,
    images: images.map((image) => {
      const rec = asRecord(image);
      if (!rec) return image;
      const url = bestImageUrl(rec);
      const { thumbnails: _thumbs, ...rest } = rec;
      return url ? { ...rest, url } : rest;
    }),
  };
}

/**
 * Ítem de `POST /products/search` (el mismo objeto que documenta `/api/extranet/item/search`).
 * `price` es el neto (`price_without_vat`); `finalPrice` incluye IVA. Moneda USD.
 * `source_id` es el id que después pide `POST /orders/create`.
 */
export function mapPolytechProduct(raw: unknown): NormalizedProduct | null {
  const item = asRecord(raw);
  if (!item) return null;
  const externalId = asString(item.source_id);
  const name = asString(item.title);
  if (!externalId || !name) return null;

  const offer = asRecord(Array.isArray(item.offers) ? item.offers[0] : undefined);
  const net = polytechMoney(offer?.price_without_vat);
  const gross = polytechMoney(offer?.price);
  const vat = asNumber(item.vat);
  const stock = asNumber(offer?.stock);
  const restocking = asNumber(offer?.restocking_quantity) ?? 0;
  const categories = Array.isArray(item.category)
    ? item.category.map((c) => asString(asRecord(c)?.name)).filter((n): n is string => Boolean(n))
    : [];
  const ids = Array.isArray(item.ids) ? item.ids : [];
  const ean = ids
    .map((row) => asRecord(row))
    .find((row) => asNumber(row?.id_type) === 3);
  const skuRow = ids
    .map((row) => asRecord(row))
    .find((row) => asNumber(row?.id_type) === 5);
  const internalCode = asString(item.internal_code) ?? asString(skuRow?.id);
  const description = asString(item.description);
  const images = Array.isArray(item.images) ? item.images : [];
  const imageUrl = images.map((img) => asRecord(img)).map((img) => (img ? bestImageUrl(img) : undefined)).find(Boolean);
  const pack = asRecord(item.package_dimensions) ?? asRecord(item.unit_dimensions);
  const width = measure(pack?.width);
  const height = measure(pack?.height);
  const length = measure(pack?.length);
  const weight = measure(pack?.weight);
  const terms = Array.isArray(item.search_terms)
    ? item.search_terms.map((t) => asString(t)).filter((t): t is string => Boolean(t))
    : [];

  let stockStatus: string | undefined;
  if (stock != null && stock > 0) stockStatus = "in_stock";
  else if (restocking > 0) stockStatus = "restocking";
  else if (stock === 0) stockStatus = "out_of_stock";

  return {
    externalId,
    sku: internalCode,
    partNumber: internalCode,
    ean: asString(ean?.id),
    name,
    brand: asString(item.brand),
    category: categories[0],
    subcategory: categories.length > 1 ? categories[categories.length - 1] : undefined,
    description: description ? description.slice(0, 500) : undefined,
    longDescription: description && description.length > 500 ? description : undefined,
    price: net?.amount,
    finalPrice: gross?.amount,
    currency: net?.currency ?? gross?.currency,
    ivaPercent: vat,
    stock: stock != null ? Math.max(0, Math.trunc(stock)) : undefined,
    stockStatus,
    imageUrl,
    productUrl: asString(item.share_link),
    weight: weight.value,
    weightUnit: weight.unit,
    height: height.value,
    width: width.value,
    length: length.value,
    dimensionsUnit: width.unit ?? height.unit ?? length.unit,
    tags: terms.length ? terms.join(", ") : undefined,
    raw: slimRaw(item),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheKey(creds: PolytechCredentials): string {
  return createHash("sha256")
    .update(`${creds.username ?? ""}\n${creds.password ?? ""}\n${creds.apiKey ?? ""}`)
    .digest("hex");
}

function errorText(status: number, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return `Polytech respondió HTTP ${status}`;
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
    const message = asString(parsed.error) ?? asString(parsed.message);
    if (message) return message;
  } catch {
    /* HTML u otro texto */
  }
  return trimmed.slice(0, 300);
}

/**
 * Cliente del portal. Serializa las llamadas (1/s) y reintenta 502/503
 * salvo en el alta de pedido, que no es idempotente.
 */
export class PolytechClient {
  private lastCall = 0;
  private chain: Promise<void> = Promise.resolve();

  private constructor(private apiKey: string) {
    // El login acaba de pegarle al mismo host: la primera búsqueda espera el cupo de 1/s.
    this.lastCall = Date.now();
  }

  static async fromCredentials(raw: Record<string, string>): Promise<PolytechClient> {
    const creds = parsePolytechCredentials(raw);
    if (!hasPolytechAccess(creds)) {
      throw new BadGatewayException(
        "Credenciales de Polytech incompletas: hace falta usuario y contraseña del portal, o la API Key."
      );
    }
    const apiKey = await resolveApiKey(creds);
    return new PolytechClient(apiKey);
  }

  async searchProducts(input: { page: number; resultsPerPage?: number; keywords?: string }): Promise<PolytechSearchPage> {
    const body: Record<string, unknown> = {
      page: input.page,
      results_per_page: input.resultsPerPage ?? POLYTECH_PAGE_SIZE,
    };
    const keywords = input.keywords?.trim();
    if (keywords) body.keywords = keywords;
    const data = await this.post("/products/search", body);
    const rec = asRecord(data) ?? {};
    return {
      items: Array.isArray(rec.items) ? rec.items : [],
      currentPage: asNumber(rec.current_page) ?? input.page,
      totalPages: asNumber(rec.total_pages) ?? 0,
    };
  }

  async findBySourceId(sourceId: string, hint?: string): Promise<unknown | null> {
    const queries = [sourceId.trim(), hint?.trim()].filter((q): q is string => Boolean(q));
    const seen = new Set<string>();
    for (const keywords of queries) {
      if (seen.has(keywords)) continue;
      seen.add(keywords);
      const page = await this.searchProducts({ page: 1, resultsPerPage: 20, keywords });
      const hit = page.items.find((item) => asString(asRecord(item)?.source_id) === sourceId);
      if (hit) return hit;
    }
    return null;
  }

  async account(): Promise<PolytechAccount> {
    const [info, rate, couriers] = await Promise.all([
      this.post("/account/info", {}),
      this.post("/misc/dolar-exchange-rate", {}),
      this.post("/couriers/list", {}),
    ]);
    const infoRec = asRecord(info) ?? {};
    const addresses = (Array.isArray(infoRec.addresses) ? infoRec.addresses : [])
      .map((row) => {
        const rec = asRecord(row);
        const id = asString(rec?.id);
        const address = asString(rec?.address);
        if (!id || !address) return null;
        return { id, address, phone: asString(rec?.phone_number) ?? null };
      })
      .filter((row): row is PolytechAddress => row != null);
    const perceptions = (Array.isArray(infoRec.perceptions) ? infoRec.perceptions : [])
      .map((row) => {
        const rec = asRecord(row);
        const percent = parsePolytechPercent(rec?.percentage);
        const description = asString(rec?.description);
        const id = asString(rec?.id);
        if (!id || !description || percent == null) return null;
        return { id, description, percent };
      })
      .filter((row): row is PolytechPerception => row != null);
    const courierRows = asRecord(couriers);
    const courierList = (Array.isArray(courierRows?.couriers) ? courierRows.couriers : [])
      .map((row) => {
        const rec = asRecord(row);
        const id = asString(rec?.courierId);
        const person = asRecord(rec?.person);
        const name = asString(person?.legalName);
        if (!id || !name) return null;
        return { id, name };
      })
      .filter((row): row is PolytechCourier => row != null)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    return {
      legalName: asString(infoRec.legalName) ?? null,
      userName: asString(infoRec.userName) ?? null,
      email: asString(infoRec.email) ?? null,
      phone: asString(infoRec.phone) ?? null,
      showsVat: infoRec.showsVat === true,
      addresses,
      perceptions,
      exchangeRate: asNumber(asRecord(rate)?.exchangeRate) ?? null,
      couriers: courierList,
    };
  }

  async orderHistory(): Promise<PolytechHistoryOrder[]> {
    const data = asRecord(await this.post("/orders/history", {})) ?? {};
    const buckets: Array<["pending" | "in_process" | "shipped", string]> = [
      ["pending", "pendings"],
      ["in_process", "in_process"],
      ["shipped", "shippeds"],
    ];
    const out: PolytechHistoryOrder[] = [];
    for (const [bucket, key] of buckets) {
      const rows = Array.isArray(data[key]) ? data[key] : [];
      for (const row of rows) {
        const rec = asRecord(row);
        const id = asString(rec?.id);
        if (!id) continue;
        const total = polytechMoney(rec?.total);
        out.push({
          id,
          bucket,
          createdAt: asString(rec?.creation_time) ?? null,
          total: total?.amount ?? asNumber(rec?.total) ?? null,
          currency: total?.currency ?? null,
        });
      }
    }
    return out;
  }

  async orderDetail(input: { stateId?: string; salesOrderId?: string }): Promise<PolytechDetailLine[]> {
    const body: Record<string, string> = {};
    if (input.stateId) body.state_id = input.stateId;
    else if (input.salesOrderId) body.sales_order_id = input.salesOrderId;
    else throw new BadGatewayException("Falta el id del pedido de Polytech.");
    const data = asRecord(await this.post("/orders/detail", body)) ?? {};
    const lines: PolytechDetailLine[] = [];
    for (const key of ["state_details", "sales_order_details", "packing_list_details"]) {
      const block = asRecord(data[key]);
      const items = Array.isArray(block?.items) ? block.items : [];
      for (const row of items) {
        const rec = asRecord(row);
        if (!rec || rec.total == null) continue;
        const total = polytechMoney(rec.total);
        lines.push({
          sku: asString(rec.sku) ?? asString(rec.source_id) ?? asString(rec.id) ?? "",
          description: asString(rec.description) ?? "",
          quantity: asNumber(rec.quantity) ?? null,
          vat: asString(rec.vat) ?? null,
          total: total?.amount ?? null,
          currency: total?.currency ?? null,
        });
      }
    }
    return lines;
  }

  async createOrder(input: {
    items: { sourceId: string; quantity: number }[];
    shippingService: "delivery" | "pickup";
    addressId?: string;
    courierId?: string;
    notes?: string;
    paymentMethod?: "mercadopago";
  }): Promise<PolytechCreatedOrder> {
    const body: Record<string, unknown> = {
      items: input.items.map((it) => ({ source_id: it.sourceId, quantity: it.quantity })),
      shipping_service: input.shippingService,
      address_id: input.shippingService === "delivery" ? Number(input.addressId) : 0,
      notes: input.notes?.trim() || undefined,
    };
    if (input.shippingService === "delivery" && input.courierId) body.courier_id = Number(input.courierId);
    if (input.paymentMethod === "mercadopago") body.payment_method = "mercadopago";
    const data = asRecord(await this.post("/orders/create", body, { retry: false })) ?? {};
    const orderId = asString(data.order_id);
    if (!orderId) {
      const message = asString(data.error) ?? asString(data.message) ?? "Polytech no devolvió el número de pedido";
      throw new BadGatewayException(message);
    }
    return { orderId, mercadopagoUrl: asString(data.mercadopago_checkout_url) ?? null };
  }

  private post(path: string, body: unknown, opts?: { retry?: boolean }): Promise<unknown> {
    return this.paced(() => this.postOnce(path, body, opts?.retry !== false));
  }

  private paced<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const wait = this.lastCall + POLYTECH_MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        return await fn();
      } finally {
        this.lastCall = Date.now();
      }
    });
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async postOnce(path: string, body: unknown, retry: boolean): Promise<unknown> {
    const attempts = retry ? 3 : 1;
    let last = `Polytech no respondió en ${path}`;
    for (let i = 0; i < attempts; i++) {
      const res = await fetch(`${POLYTECH_API}${path}`, {
        method: "POST",
        headers: {
          Authorization: basic(this.apiKey),
          "Content-Type": "application/json; charset=utf-8",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      const text = await res.text();
      if (res.ok) {
        if (!text.trim()) return {};
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new BadGatewayException(`Polytech devolvió una respuesta que no es JSON en ${path}`);
        }
      }
      last = errorText(res.status, text);
      if (res.status !== 502 && res.status !== 503) break;
      await sleep(1500 * (i + 1));
    }
    throw new BadGatewayException(last);
  }
}

function basic(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

async function resolveApiKey(creds: PolytechCredentials): Promise<string> {
  if (creds.apiKey) return creds.apiKey;
  const key = cacheKey(creds);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.apiKey;
  const res = await fetch(`${POLYTECH_API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
    body: JSON.stringify({ username: creds.username, password: creds.password }),
    signal: AbortSignal.timeout(40_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new BadGatewayException(
      res.status === 401 || res.status === 403
        ? "Usuario o contraseña de Polytech incorrectos."
        : errorText(res.status, text)
    );
  }
  let apiKey = "";
  try {
    apiKey = asString(asRecord(JSON.parse(text))?.api_key) ?? "";
  } catch {
    apiKey = "";
  }
  if (!apiKey) throw new BadGatewayException("Polytech no devolvió la API Key al iniciar sesión.");
  tokenCache.set(key, { apiKey, expiresAt: Date.now() + TOKEN_TTL_MS });
  return apiKey;
}
