import { BadGatewayException, BadRequestException } from "@nestjs/common";
import axios, { type AxiosRequestConfig, type Method } from "axios";
import { asNumber, asRecord, asString, axiosErrorMessage, unwrapList } from "./json-value";

export const ELIT_WEB_API = "https://new.api.elit.com.ar/v1/web";
export const ELIT_SITE_LOGIN = "https://www.elit.com.ar/api/login";
export const ELIT_SITE = "https://www.elit.com.ar";

export interface ElitCredentials {
  userId?: string;
  token?: string;
  id?: string;
  password?: string;
  agent?: number;
}

export function parseElitCredentials(raw: Record<string, string>): ElitCredentials {
  const userId = (raw.user_id || raw.userId || "").trim();
  const token = (raw.token || raw.apiToken || "").trim();
  const id = (raw.id || raw.clientId || raw.nroCliente || userId).trim();
  const password = (raw.password || raw.pass || "").trim();
  const agentRaw = (raw.agent || "").trim();
  const agent = agentRaw ? Number(agentRaw) : undefined;
  return {
    userId: userId || undefined,
    token: token || undefined,
    id: id || undefined,
    password: password || undefined,
    agent: Number.isFinite(agent) ? agent : undefined,
  };
}

export function hasElitPortalLogin(creds: ElitCredentials): boolean {
  return Boolean(creds.id && creds.password);
}

/** Mismo armado que el form de www.elit.com.ar (nro cliente / email / nro-agente). */
export function elitLoginBody(id: string, password: string, agent?: number): Record<string, unknown> {
  const body: Record<string, unknown> = { id, password };
  if (!Number.isNaN(Number(id))) {
    body.agent = agent ?? 0;
    return body;
  }
  if (/^\S+@\S+\.\S+$/.test(id)) return body;
  const parts = id.split("-");
  body.id = parts[0] ?? id;
  body.agent = Number(parts[1]) || agent || 0;
  return body;
}

function cookieHeader(headers: { "set-cookie"?: string[] }): string | undefined {
  const parts = headers["set-cookie"]
    ?.map((c) => c.split(";")[0])
    .filter((c) => c.includes("=") && !c.endsWith("="));
  return parts?.length ? parts.join("; ") : undefined;
}

export interface ElitLoginSession {
  customerId: string;
  name?: string;
  apiTokenKey?: string;
  currentExchange?: number;
  shippingAddresses: ElitAddress[];
  raw: unknown;
}

export interface ElitAddress {
  code: string;
  addressLine: string;
  postalCode?: string;
  city?: string;
  isDefault: boolean;
}

function mapAddresses(raw: unknown): ElitAddress[] {
  return unwrapList(raw).map((row, i) => {
    const rec = asRecord(row) ?? {};
    const code = asString(rec.code) || asString(rec.id) || String(i);
    const street = asString(rec.address) || "";
    const city = asString(rec.city) || "";
    const state = asString(rec.state) || "";
    const postal = asString(rec.zipCode);
    return {
      code,
      addressLine: [street, city, state, postal].filter(Boolean).join(", "),
      postalCode: postal,
      city,
      isDefault: i === 0,
    };
  });
}

function parseLoginPayload(body: unknown): ElitLoginSession {
  const rec = asRecord(body) ?? {};
  const customer = asRecord(rec.customer) ?? {};
  const tokenObj = asRecord(customer.apiToken);
  const id = asString(customer.id) || "";
  return {
    customerId: id,
    name: asString(customer.name),
    apiTokenKey: asString(tokenObj?.key),
    currentExchange: asNumber(rec.currentExchange),
    shippingAddresses: mapAddresses(customer.shippingAddress),
    raw: body,
  };
}

/**
 * B2B Elit (new.api.elit.com.ar/v1/web), confirmado en vivo:
 * POST /auth/login { id, password, agent } → cookie __Secure-better-auth.session_token
 * GET /cart  GET /cart/summary
 * POST /cart/add { code, quantity }
 * POST /cart/update { code, quantity, warehouse }  (quantity 0 saca el ítem)
 * POST /cart/option { warehouse|shippingWarehouse, shippingMethod?, saleCondition?, shippingAddress? }
 * POST /cart/process { warehouse }  ← crea la nota de venta
 */
export class ElitWebClient {
  constructor(
    readonly apiCookie: string,
    readonly siteCookie: string,
    readonly session: ElitLoginSession
  ) {}

  static async login(credentials: Record<string, string>): Promise<ElitWebClient> {
    const creds = parseElitCredentials(credentials);
    if (!hasElitPortalLogin(creds)) {
      throw new BadGatewayException(
        "Para pedidos y cuenta de Elit hace falta nro. de cliente y contraseña del portal (www.elit.com.ar)"
      );
    }
    const payload = elitLoginBody(creds.id!, creds.password!, creds.agent);
    let apiCookie: string | undefined;
    let siteCookie: string | undefined;
    let session: ElitLoginSession | undefined;
    try {
      const apiRes = await axios.post(`${ELIT_WEB_API}/auth/login`, payload, {
        timeout: 20_000,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        validateStatus: (s) => s < 500,
      });
      if (apiRes.status === 401 || apiRes.status === 403) {
        throw new BadRequestException("Usuario o clave de Elit incorrectos");
      }
      if (apiRes.status >= 400) {
        throw new BadGatewayException(`Elit login → ${apiRes.status}: ${String(JSON.stringify(apiRes.data)).slice(0, 240)}`);
      }
      apiCookie = cookieHeader(apiRes.headers);
      session = parseLoginPayload(apiRes.data);
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof BadGatewayException) throw err;
      throw new BadGatewayException(`No se pudo iniciar sesión en Elit: ${axiosErrorMessage(err, "error")}`);
    }
    try {
      const siteRes = await axios.post(ELIT_SITE_LOGIN, payload, {
        timeout: 20_000,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        validateStatus: (s) => s < 500,
      });
      siteCookie = cookieHeader(siteRes.headers);
    } catch {
      siteCookie = undefined;
    }
    if (!apiCookie) throw new BadGatewayException("Elit no devolvió cookie de sesión");
    return new ElitWebClient(apiCookie, siteCookie ?? apiCookie, session!);
  }

  async request<T = unknown>(method: Method, path: string, data?: unknown): Promise<{ status: number; data: T }> {
    const url = `${ELIT_WEB_API}/${path.replace(/^\//, "")}`;
    const config: AxiosRequestConfig = {
      method,
      url,
      data,
      timeout: 25_000,
      headers: {
        Accept: "application/json",
        Cookie: this.apiCookie,
        ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      validateStatus: (s) => s < 500,
    };
    try {
      const res = await axios.request<T>(config);
      return { status: res.status, data: res.data };
    } catch (err) {
      throw new BadGatewayException(`Elit ${method} ${path} falló: ${axiosErrorMessage(err, "error")}`);
    }
  }

  async getJson<T = unknown>(path: string): Promise<T> {
    const res = await this.request<T>("GET", path);
    if (res.status >= 400) {
      throw new BadGatewayException(`Elit GET ${path} → ${res.status}: ${String(JSON.stringify(res.data)).slice(0, 240)}`);
    }
    return res.data;
  }

  async postJson<T = unknown>(path: string, data?: unknown): Promise<T> {
    const res = await this.request<T>("POST", path, data);
    if (res.status >= 400) {
      const rec = asRecord(res.data);
      const msg = asString(rec?.message) || JSON.stringify(res.data);
      const errCls = res.status === 400 || res.status === 422 ? BadRequestException : BadGatewayException;
      throw new errCls(`Elit POST ${path} → ${res.status}: ${String(msg).slice(0, 400)}`);
    }
    return res.data;
  }

  async getRsc(path: string): Promise<string> {
    const url = `${ELIT_SITE}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await axios.get<string>(url, {
      headers: {
        Cookie: this.siteCookie,
        Accept: "text/x-component",
        RSC: "1",
      },
      timeout: 30_000,
      responseType: "text",
      validateStatus: (s) => s < 500,
    });
    if (res.status >= 400) {
      throw new BadGatewayException(`Elit ${path} → ${res.status}`);
    }
    return typeof res.data === "string" ? res.data : String(res.data ?? "");
  }
}

export function elitData<T = unknown>(body: unknown): T {
  const rec = asRecord(body);
  return (rec && "data" in rec ? rec.data : body) as T;
}

export function mapElitCartDetails(
  details: unknown,
  requested: { code: string; qty: number; name?: string }[]
): { code: string; qty: number; name: string; price: number; subtotal: number; warehouse?: number }[] {
  const list = unwrapList(details);
  if (list.length === 0) {
    return requested.map((it) => ({
      code: it.code,
      qty: it.qty,
      name: it.name || it.code,
      price: 0,
      subtotal: 0,
    }));
  }
  return list.map((row) => {
    const rec = asRecord(row) ?? {};
    const cartRows = unwrapList(rec.cart);
    const first = asRecord(cartRows[0]) ?? {};
    const qty = asNumber(first.quantity) ?? asNumber(rec.cartTotal) ?? 1;
    const price = asNumber(rec.price) ?? 0;
    const warehouse = asNumber(first.warehouse);
    const code = asString(rec.code) || "";
    return {
      code,
      qty,
      name: asString(rec.name) || code,
      price,
      subtotal: price * qty,
      warehouse,
    };
  });
}
