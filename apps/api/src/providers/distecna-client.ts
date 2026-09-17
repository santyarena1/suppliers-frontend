import { BadGatewayException, BadRequestException, Logger } from "@nestjs/common";
import axios, { AxiosInstance, type AxiosRequestConfig } from "axios";
import dns from "dns";
import https from "https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { asNumber, asRecord, asString, axiosErrorMessage } from "./json-value";
import type { NormalizedProduct } from "./types";

dns.setDefaultResultOrder("ipv4first");

const log = new Logger("DistecnaClient");

const DIRECT_AGENT = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  family: 4,
});

type DistecnaEgressMode = "direct" | "proxy" | "via";

function stripSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function firstPublicWebOrigin(): string {
  const hg = (process.env.RETAIL_HG_FETCH_VIA_URL || "").trim();
  if (hg) return stripSlash(hg.replace(/\/api\/retail-fetch\/?$/i, "/api/distecna-fetch"));
  const raw = (process.env.WEB_ORIGIN || process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "").trim();
  for (const part of raw.split(",")) {
    const origin = part.trim().replace(/\/$/, "");
    if (!origin.startsWith("https://") || origin.includes("*") || /localhost|127\.0\.0\.1/.test(origin)) continue;
    if (origin.includes("/api/")) return origin;
    return `${origin}/api/distecna-fetch`;
  }
  return "";
}

export function resolveDistecnaFetchVia(): string {
  const explicit = (process.env.DISTECNA_FETCH_VIA_URL || "").trim();
  if (explicit) {
    if (explicit.includes("/api/")) return stripSlash(explicit);
    return `${stripSlash(explicit)}/api/distecna-fetch`;
  }
  return firstPublicWebOrigin();
}

function distecnaProxyUrl(): string {
  return (process.env.DISTECNA_PROXY_URL || process.env.NEW_TREE_PROXY_URL || "").trim();
}

function fetchToken(): string {
  return (
    process.env.DISTECNA_FETCH_TOKEN ||
    process.env.RETAIL_HG_FETCH_TOKEN ||
    process.env.RETAIL_FETCH_TOKEN ||
    ""
  ).trim();
}

function isRailway(): boolean {
  return Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
}

export function resolveDistecnaEgress(): { mode: DistecnaEgressMode; via: string; proxyUrl: string } {
  let via = resolveDistecnaFetchVia();
  const proxyUrl = distecnaProxyUrl();
  if (isRailway() && !via) {
    via = "https://suppliers-frontend.vercel.app/api/distecna-fetch";
  }
  if (isRailway()) {
    if (via) return { mode: "via", via, proxyUrl };
    if (proxyUrl) return { mode: "proxy", via, proxyUrl };
  }
  return { mode: "direct", via, proxyUrl };
}

function isDistecnaAbsoluteUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === "api.distecna.com" ||
      u.hostname === "dsaapi.distecna.com" ||
      u.hostname === "qa-apipublica.distecna.com"
    );
  } catch {
    return false;
  }
}

export const DISTECNA_V1_PROD = "https://api.distecna.com:8096";
export const DISTECNA_AUTH_PROD = "https://dsaapi.distecna.com:8087";
export const DISTECNA_V2_PROD = "https://dsaapi.distecna.com:8088";
export const DISTECNA_AUTH_QA = "https://qa-apipublica.distecna.com:8086";
export const DISTECNA_V2_QA = "https://qa-apipublica.distecna.com:8088";

const QUERY_TIMEOUT_MS = 45_000;
const ORDER_TIMEOUT_MS = 30_000;
/** 429/503/504: hasta 3 intentos. Timeout/cancel no se reintenta (el front veía "canceled"). */
const MAX_RETRIES = 2;
const RETRY_STATUSES = new Set([429, 503, 504]);

export type DistecnaEnv = "prod" | "qa";

export interface DistecnaCredentials {
  apiKey: string;
  userName: string;
  password: string;
  environment: DistecnaEnv;
}

export interface DistecnaListProduct {
  code: string;
  sku?: string | null;
  type?: string | null;
  stock?: number;
  currency?: string | null;
  price?: number;
  iva?: number;
  ii?: number;
}

export interface DistecnaListResponse {
  total: number;
  offset: number;
  products: DistecnaListProduct[];
}

export interface DistecnaAttribute {
  name?: string;
  nombre?: string;
  atributo?: string;
  value?: string | number;
  valor?: string | number;
}

export interface DistecnaDetail extends DistecnaListProduct {
  name?: string | null;
  brand?: string | null;
  subBrand?: string | null;
  category?: string | null;
  ean?: string | null;
  upc?: string | null;
  description?: string | null;
  fullDescription?: string | null;
  attributes?: DistecnaAttribute[] | string[];
  images?: string[];
}

export interface DistecnaPaymentTerm {
  id: string;
  code: string;
  name: string;
}

export interface DistecnaAddress {
  id: string;
  name: string;
  street?: string | null;
  number?: string | null;
  floor?: string | null;
  department?: string | null;
  postalCode?: string | null;
  jurisdiction?: string | null;
  country?: string | null;
}

export interface DistecnaOrderLine {
  productCode: string;
  productType: string;
  quantity: number;
}

export interface DistecnaOrderBody {
  products: DistecnaOrderLine[];
  paymentTermId?: string;
  deliveryAddressId?: string;
}

export interface DistecnaOrderResult {
  success: boolean;
  salesOrderId: string | null;
  message: string;
}

export function parseDistecnaCredentials(raw: Record<string, string>): DistecnaCredentials {
  const apiKey = (raw.api_key || raw.apiKey || raw.token || "").trim();
  const userName = (raw.user || raw.username || raw.userName || "").trim();
  const password = (raw.password || raw.pass || "").trim();
  const envRaw = (raw.environment || raw.env || "prod").trim().toLowerCase();
  return {
    apiKey,
    userName,
    password,
    environment: envRaw === "qa" ? "qa" : "prod",
  };
}

export function hasDistecnaCatalogAccess(creds: DistecnaCredentials): boolean {
  return Boolean(creds.apiKey) || hasDistecnaOrderAccess(creds);
}

export function hasDistecnaOrderAccess(creds: DistecnaCredentials): boolean {
  return Boolean(creds.userName && creds.password);
}

/** "U$S" (detalle / V1) y "USD" (listado V2) son la misma moneda. */
export function normalizeDistecnaCurrency(raw: string | null | undefined): string | undefined {
  const s = (raw ?? "").trim();
  if (!s) return undefined;
  const compact = s.replace(/\s+/g, "").toUpperCase();
  if (compact === "U$S" || compact === "US$" || compact === "USD" || compact === "U$D") return "USD";
  if (compact === "ARS" || compact === "$" || compact === "AR$") return "ARS";
  return s;
}

/**
 * Distecna manda IVA/II como tasa (0.21, 0.105). El catálogo de Nodo guarda
 * puntos (21, 10.5), igual que Elit/Air.
 */
export function distecnaTaxPoints(raw: number | null | undefined): number | undefined {
  if (raw == null || !Number.isFinite(raw) || raw < 0) return undefined;
  if (raw === 0) return 0;
  if (raw <= 1) return Math.round(raw * 10000) / 100;
  if (raw <= 100) return raw;
  return undefined;
}

export function cleanDistecnaCode(raw: string | null | undefined): string | undefined {
  const s = (raw ?? "").trim();
  if (!s || s === "." || s === "-" || s === "null") return undefined;
  return s;
}

export function productTypeFromRaw(raw: unknown): string | undefined {
  const rec = asRecord(raw);
  const type = cleanDistecnaCode(asString(rec?.type) || asString(rec?.productType));
  return type;
}

function attributeTag(row: DistecnaAttribute | string): string | undefined {
  if (typeof row === "string") return cleanDistecnaCode(row);
  const key = asString(row.name) || asString(row.nombre) || asString(row.atributo);
  const value = asString(row.value) ?? asString(row.valor);
  if (key && value) return `${key}: ${value}`;
  return value || key;
}

export function mapDistecnaListProduct(p: DistecnaListProduct): NormalizedProduct {
  const code = (p.code || "").trim();
  const sku = cleanDistecnaCode(p.sku) || undefined;
  const price = asNumber(p.price);
  const stock = asNumber(p.stock);
  return {
    externalId: code,
    sku,
    name: sku || code || "Producto Distecna",
    price,
    currency: normalizeDistecnaCurrency(p.currency),
    ivaPercent: distecnaTaxPoints(asNumber(p.iva)),
    stock,
    raw: p,
  };
}

export function detailPatchFromDistecna(detail: DistecnaDetail): Partial<NormalizedProduct> {
  const name = cleanDistecnaCode(detail.name);
  const brand = cleanDistecnaCode(detail.brand);
  const subBrand = cleanDistecnaCode(detail.subBrand);
  const category = cleanDistecnaCode(detail.category);
  const description = cleanDistecnaCode(detail.description);
  const longDescription = cleanDistecnaCode(detail.fullDescription);
  const ean = cleanDistecnaCode(detail.ean) || cleanDistecnaCode(detail.upc);
  const imageUrl = (detail.images ?? []).map((u) => u?.trim()).find(Boolean);
  const attrs = (detail.attributes ?? []).map(attributeTag).filter(Boolean) as string[];
  const tags = [
    subBrand && brand && subBrand !== brand ? `Línea: ${subBrand}` : null,
    ...attrs,
  ].filter(Boolean).join(" · ") || undefined;

  const patch: Partial<NormalizedProduct> = {
    raw: detail,
  };
  if (name) patch.name = name;
  if (brand) patch.brand = brand;
  if (category) patch.category = category;
  if (description) patch.description = description;
  if (longDescription) patch.longDescription = longDescription;
  if (ean) patch.ean = ean;
  if (imageUrl) patch.imageUrl = imageUrl;
  if (tags) patch.tags = tags;
  const sku = cleanDistecnaCode(detail.sku);
  if (sku) patch.sku = sku;
  const price = asNumber(detail.price);
  if (price != null) patch.price = price;
  const stock = asNumber(detail.stock);
  if (stock != null) patch.stock = stock;
  const iva = distecnaTaxPoints(asNumber(detail.iva));
  if (iva != null) patch.ivaPercent = iva;
  const currency = normalizeDistecnaCurrency(detail.currency);
  if (currency) patch.currency = currency;
  return patch;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusOf(err: unknown): number | undefined {
  if (err && typeof err === "object" && "response" in err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

/** Reintenta 429/503/504. Timeout, abort y "canceled" fallan al toque. */
export function isDistecnaTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const rec = err as { code?: string; name?: string; message?: string };
  const code = (rec.code || "").toUpperCase();
  const msg = (rec.message || "").toLowerCase();
  const name = (rec.name || "").toLowerCase();
  return (
    code === "ERR_CANCELED" ||
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    name.includes("abort") ||
    name.includes("cancel") ||
    msg.includes("canceled") ||
    msg.includes("cancelled") ||
    msg.includes("timeout") ||
    msg.includes("aborted")
  );
}

export function shouldRetryDistecna(err: unknown, attempt: number, maxRetries = MAX_RETRIES): boolean {
  if (attempt >= maxRetries) return false;
  const status = statusOf(err);
  if (status != null) return RETRY_STATUSES.has(status);
  if (isDistecnaTimeoutError(err)) return false;
  return attempt === 0;
}

export function distecnaErrorMessage(err: unknown, fallback: string): string {
  if (isDistecnaTimeoutError(err)) {
    return "Distecna no contestó a tiempo (api.distecna.com:8096). Railway no llega a ese puerto: el sync tiene que salir por el front (`DISTECNA_FETCH_VIA_URL`) o por `DISTECNA_PROXY_URL` / `NEW_TREE_PROXY_URL`.";
  }
  const rec = asRecord(
    err && typeof err === "object" && "response" in err
      ? (err as { response?: { data?: unknown } }).response?.data
      : null
  );
  const body = asString(rec?.error) || asString(rec?.detail) || asString(rec?.message);
  const trace = asString(rec?.traceId);
  if (body && trace) return `${body} (trace ${trace})`.slice(0, 400);
  if (body) return body.slice(0, 400);
  return axiosErrorMessage(err, fallback);
}

function jwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export class DistecnaClient {
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private http: AxiosInstance;
  private mode: DistecnaEgressMode;
  private readonly via: string;
  private readonly proxyUrl: string;
  private readonly failed = new Set<DistecnaEgressMode>();

  constructor(private readonly creds: DistecnaCredentials) {
    const egress = resolveDistecnaEgress();
    this.via = egress.via;
    this.proxyUrl = egress.proxyUrl;
    this.mode = egress.mode;
    this.http = this.buildHttp(this.mode);
    log.log(`Distecna HTTP modo=${this.mode}${this.via ? ` via=${this.via}` : ""}${this.proxyUrl ? " proxy=sí" : ""}`);
  }

  private buildHttp(mode: DistecnaEgressMode): AxiosInstance {
    const headers = { Accept: "application/json", "User-Agent": "nodo-distecna" };
    const timeout = mode === "direct" ? 12_000 : QUERY_TIMEOUT_MS;
    if (mode === "proxy" && this.proxyUrl) {
      const agent = new HttpsProxyAgent(this.proxyUrl, { rejectUnauthorized: false });
      return axios.create({
        httpsAgent: agent,
        httpAgent: agent,
        proxy: false,
        timeout,
        headers,
        validateStatus: (s) => s >= 200 && s < 300,
      });
    }
    const http = axios.create({
      ...(mode === "direct" ? { httpsAgent: DIRECT_AGENT, proxy: false as const } : { proxy: false as const }),
      timeout,
      headers,
      validateStatus: (s) => s >= 200 && s < 300,
    });
    if (mode === "via" && this.via) {
      const via = this.via;
      const token = fetchToken();
      http.interceptors.request.use((config) => {
        const abs = axios.getUri(config);
        if (!isDistecnaAbsoluteUrl(abs)) return config;
        config.baseURL = undefined;
        config.params = undefined;
        config.url = `${via}?url=${encodeURIComponent(abs)}`;
        if (token) {
          config.headers = config.headers ?? {};
          config.headers["x-nodo-fetch-token"] = token;
        }
        return config;
      });
    }
    return http;
  }

  private shouldFailover(err: unknown): boolean {
    if (isDistecnaTimeoutError(err)) return true;
    if (this.mode !== "via") return false;
    const status = statusOf(err);
    return status === 401 || status === 403 || status === 404 || status === 502;
  }

  private failover(): boolean {
    this.failed.add(this.mode);
    const next: DistecnaEgressMode[] = [];
    if (this.via) next.push("via");
    if (this.proxyUrl) next.push("proxy");
    next.push("direct");
    const pick = next.find((m) => !this.failed.has(m));
    if (!pick) return false;
    this.mode = pick;
    this.http = this.buildHttp(pick);
    log.warn(`Distecna HTTP failover → ${pick}`);
    return true;
  }

  static fromCredentials(raw: Record<string, string>): DistecnaClient {
    const creds = parseDistecnaCredentials(raw);
    if (!hasDistecnaCatalogAccess(creds)) {
      throw new BadRequestException(
        "Falta la API Key de Distecna o el usuario y la contraseña de pedidos (Camino B)."
      );
    }
    return new DistecnaClient(creds);
  }

  get environment(): DistecnaEnv {
    return this.creds.environment;
  }

  get canOrder(): boolean {
    return hasDistecnaOrderAccess(this.creds);
  }

  /** Catálogo V2 solo si no hay API Key: el JWT de pedidos no tiene que bloquear el sync. */
  get usesV2Catalog(): boolean {
    return hasDistecnaOrderAccess(this.creds) && !this.creds.apiKey;
  }

  private get v1Base(): string {
    return DISTECNA_V1_PROD;
  }

  private get authBase(): string {
    return this.creds.environment === "qa" ? DISTECNA_AUTH_QA : DISTECNA_AUTH_PROD;
  }

  private get v2Base(): string {
    return this.creds.environment === "qa" ? DISTECNA_V2_QA : DISTECNA_V2_PROD;
  }

  private async withBackoff<T>(label: string, fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        last = err;
        if (this.shouldFailover(err) && this.failover()) {
          attempt = Math.max(0, attempt - 1);
          continue;
        }
        if (!shouldRetryDistecna(err, attempt, retries)) {
          throw new BadGatewayException(distecnaErrorMessage(err, `Distecna falló en ${label}`));
        }
        await sleep(1000 * 2 ** attempt);
      }
    }
    throw new BadGatewayException(distecnaErrorMessage(last, `Distecna no respondió en ${label}`));
  }

  private async login(force = false): Promise<string> {
    if (!hasDistecnaOrderAccess(this.creds)) {
      throw new BadRequestException(
        "Para pedidos de Distecna hace falta usuario y contraseña de la API (Camino B / JWT)."
      );
    }
    const stillValid = this.token && Date.now() < this.tokenExpiresAt - 5 * 60_000;
    if (!force && stillValid) return this.token as string;
    const res = await this.withBackoff("login", () =>
      this.http.post<unknown>(`${this.authBase}/Auth/API/login`, {
        userName: this.creds.userName,
        password: this.creds.password,
      })
    );
    const token = typeof res.data === "string" ? res.data.replace(/^"+|"+$/g, "").trim() : asString(res.data);
    if (!token) throw new BadGatewayException("Distecna no devolvió un token JWT");
    this.token = token;
    this.tokenExpiresAt = jwtExpiryMs(token) ?? Date.now() + 55 * 60_000;
    return token;
  }

  private v1Headers(): Record<string, string> {
    if (!this.creds.apiKey) {
      throw new BadRequestException("Falta la API Key de Distecna (header x-apikey) para el catálogo V1.");
    }
    return { "x-apikey": this.creds.apiKey };
  }

  private async v2Headers(): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.login()}` };
  }

  private async v2Request<T>(config: AxiosRequestConfig, retried = false): Promise<T> {
    try {
      const res = await this.http.request<T>({
        ...config,
        headers: { ...(config.headers ?? {}), ...(await this.v2Headers()) },
      });
      return res.data;
    } catch (err) {
      if (!retried && statusOf(err) === 401) {
        this.token = null;
        await this.login(true);
        return this.v2Request<T>(config, true);
      }
      throw err;
    }
  }

  async listProducts(opts: { limit: number; offset: number; search?: string }): Promise<DistecnaListResponse> {
    const params: Record<string, string | number> = { limit: opts.limit, offset: opts.offset };
    if (opts.search) params.search = opts.search;
    if (this.creds.apiKey) {
      const data = await this.withBackoff("GET /Product", async () => {
        const res = await this.http.get<DistecnaListResponse>(`${this.v1Base}/Product`, {
          params,
          headers: this.v1Headers(),
        });
        return res.data;
      });
      return {
        total: asNumber(data?.total) ?? 0,
        offset: asNumber(data?.offset) ?? opts.offset,
        products: Array.isArray(data?.products) ? data.products : [],
      };
    }
    return this.listProductsV2(opts);
  }

  private async listProductsV2(opts: { limit: number; offset: number; search?: string }): Promise<DistecnaListResponse> {
    const params: Record<string, string | number> = { limit: opts.limit, offset: opts.offset };
    if (opts.search) params.search = opts.search;
    const data = await this.withBackoff("GET /v2/Product", () =>
      this.v2Request<DistecnaListResponse>({
        method: "GET",
        url: `${this.v2Base}/v2/Product`,
        params,
      })
    );
    return {
      total: asNumber(data?.total) ?? 0,
      offset: asNumber(data?.offset) ?? opts.offset,
      products: Array.isArray(data?.products) ? data.products : [],
    };
  }

  async getDetail(code: string, type?: string | null): Promise<DistecnaDetail> {
    const encoded = encodeURIComponent(code);
    if (this.creds.apiKey) {
      return this.withBackoff(`GET /Product/${code}`, async () => {
        const res = await this.http.get<DistecnaDetail>(`${this.v1Base}/Product/${encoded}`, {
          headers: this.v1Headers(),
        });
        return res.data;
      });
    }
    if (this.usesV2Catalog && type) {
      const encodedType = encodeURIComponent(type);
      return this.withBackoff(`GET /v2/Product/${code}`, () =>
        this.v2Request<DistecnaDetail>({
          method: "GET",
          url: `${this.v2Base}/v2/Product/${encoded}/${encodedType}`,
        })
      );
    }
    const resolved = type || (await this.findProductType(code));
    if (!resolved) {
      throw new BadGatewayException(`Distecna no informó el type del producto ${code}`);
    }
    return this.getDetail(code, resolved);
  }

  /** El Camino B necesita `type` para armar el pedido; el listado V1 no lo trae. */
  async findProductType(code: string): Promise<string | undefined> {
    if (!hasDistecnaOrderAccess(this.creds)) return undefined;
    const page = await this.listProductsV2({ limit: 10, offset: 0, search: code });
    const match = page.products.find((p) => (p.code || "").trim() === code);
    return cleanDistecnaCode(match?.type ?? undefined);
  }

  async paymentTerm(): Promise<DistecnaPaymentTerm | null> {
    try {
      const data = await this.withBackoff("GET /v2/PaymentTerms", () =>
        this.v2Request<DistecnaPaymentTerm | DistecnaPaymentTerm[]>({
          method: "GET",
          url: `${this.v2Base}/v2/PaymentTerms`,
        })
      );
      if (Array.isArray(data)) return data[0] ?? null;
      const rec = asRecord(data);
      const id = asString(rec?.id);
      if (!id) return null;
      return {
        id,
        code: asString(rec?.code) || "",
        name: asString(rec?.name) || asString(rec?.code) || id,
      };
    } catch (err) {
      if (statusOf(err) === 404) return null;
      throw err;
    }
  }

  async deliveryAddresses(): Promise<DistecnaAddress[]> {
    const data = await this.withBackoff("GET /v2/DeliveryAddresses", () =>
      this.v2Request<DistecnaAddress[]>({
        method: "GET",
        url: `${this.v2Base}/v2/DeliveryAddresses`,
      })
    );
    const rows = Array.isArray(data) ? data : [];
    const out: DistecnaAddress[] = [];
    for (const row of rows) {
      const rec = asRecord(row) ?? {};
      const id = asString(rec.id);
      if (!id) continue;
      out.push({
        id,
        name: asString(rec.name) || id,
        street: asString(rec.street) ?? null,
        number: asString(rec.number) ?? null,
        floor: asString(rec.floor) ?? null,
        department: asString(rec.department) ?? null,
        postalCode: asString(rec.postalCode) ?? null,
        jurisdiction: asString(rec.jurisdiction) ?? null,
        country: asString(rec.country) ?? null,
      });
    }
    return out;
  }

  /** No reintenta: un POST duplicado crearía dos pedidos reales. */
  async createOrder(body: DistecnaOrderBody): Promise<DistecnaOrderResult> {
    try {
      const data = await this.v2Request<Record<string, unknown>>({
        method: "POST",
        url: `${this.v2Base}/v2/Order`,
        data: body,
        timeout: ORDER_TIMEOUT_MS,
        headers: { "Content-Type": "application/json" },
      });
      const rec = asRecord(data) ?? {};
      return {
        success: rec.success !== false,
        salesOrderId: asString(rec.salesOrderId) ?? null,
        message: asString(rec.message) || "Pedido creado correctamente",
      };
    } catch (err) {
      throw new BadGatewayException(distecnaErrorMessage(err, "Distecna no pudo crear el pedido"));
    }
  }
}
