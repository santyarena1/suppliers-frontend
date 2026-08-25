import { BadGatewayException, BadRequestException } from "@nestjs/common";
import axios, { type AxiosRequestConfig, type Method } from "axios";

export const NB_API_BASE = "https://api.nb.com.ar/v1";
export const NB_SITE_BASE = "https://www.nb.com.ar";

const AXIOS_TIMEOUT = 30_000;

export interface NbCredentials {
  token?: string;
  user?: string;
  password?: string;
}

export function parseNbCredentials(raw: Record<string, string>): NbCredentials {
  const user = (raw.user || raw.username || raw.usuario || "").trim();
  const password = (raw.password || raw.pass || raw.passwd || "").trim();
  const token = (raw.token || raw.readToken || "").trim();
  return {
    user: user || undefined,
    password: password || undefined,
    token: token || undefined,
  };
}

export function hasNbPortalLogin(creds: NbCredentials): boolean {
  return Boolean(creds.user && creds.password);
}

export function hasNbPriceListToken(creds: NbCredentials): boolean {
  return Boolean(creds.token);
}

export function extractNbToken(body: unknown): string | undefined {
  if (typeof body === "string") {
    const trimmed = body.trim().replace(/^"|"$/g, "");
    return trimmed.length > 20 ? trimmed : undefined;
  }
  if (!body || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  for (const key of ["token", "access_token", "accessToken", "jwt"]) {
    const value = rec[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const data = rec.data;
  if (data && typeof data === "object") {
    const nested = (data as Record<string, unknown>).token;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return undefined;
}

export function unwrapNbList<T = unknown>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (!body || typeof body !== "object") return [];
  const rec = body as Record<string, unknown>;
  for (const key of ["data", "items", "results", "resultado", "rows"]) {
    const value = rec[key];
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s.length > 0 ? s : undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Cliente HTTP autenticado contra api.nb.com.ar/v1 — el mismo backend que usa
 * el sitio www.nb.com.ar (Nuxt) y la documentación de developers.nb.com.ar.
 */
export class NewBytesApiClient {
  constructor(private readonly jwt: string) {}

  static async login(user: string, password: string): Promise<NewBytesApiClient> {
    let body: unknown;
    try {
      const res = await axios.post(
        `${NB_API_BASE}/auth/login`,
        { user, password, mode: "api" },
        { timeout: 20_000, headers: { "Content-Type": "application/json" } }
      );
      body = res.data;
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const msg = axios.isAxiosError(err)
        ? String(err.response?.data ?? err.message)
        : String(err);
      if (status === 401 || status === 403) {
        throw new BadRequestException("Usuario o clave de NewBytes incorrectos");
      }
      throw new BadGatewayException(`No se pudo iniciar sesión en NewBytes: ${msg.slice(0, 300)}`);
    }
    const jwt = extractNbToken(body);
    if (!jwt) throw new BadGatewayException("NewBytes no devolvió un token de sesión");
    return new NewBytesApiClient(jwt);
  }

  async request<T = unknown>(
    method: Method,
    path: string,
    opts: { params?: Record<string, unknown>; data?: unknown; timeout?: number } = {}
  ): Promise<T> {
    const url = path.startsWith("http") ? path : `${NB_API_BASE}/${path.replace(/^\//, "")}`;
    const config: AxiosRequestConfig = {
      method,
      url,
      params: opts.params,
      data: opts.data,
      timeout: opts.timeout ?? AXIOS_TIMEOUT,
      headers: {
        Authorization: `Bearer ${this.jwt}`,
        Accept: "application/json",
        ...(opts.data ? { "Content-Type": "application/json" } : {}),
      },
      validateStatus: (s) => s < 500,
    };
    try {
      const res = await axios.request<T>(config);
      if (res.status >= 400) {
        const msg = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? res.statusText);
        const errCls = res.status === 400 || res.status === 422 ? BadRequestException : BadGatewayException;
        throw new errCls(`NewBytes ${method} ${path} → ${res.status}: ${String(msg).slice(0, 400)}`);
      }
      return res.data;
    } catch (err) {
      if (err instanceof BadGatewayException || err instanceof BadRequestException) throw err;
      const msg = axios.isAxiosError(err) ? String(err.response?.data ?? err.message) : String(err);
      throw new BadGatewayException(`NewBytes ${method} ${path} falló: ${msg.slice(0, 300)}`);
    }
  }

  get<T = unknown>(path: string, params?: Record<string, unknown>) {
    return this.request<T>("GET", path, { params });
  }

  async getBuffer(path: string): Promise<{ buffer: Buffer; contentType: string }> {
    const url = path.startsWith("http") ? path : `${NB_API_BASE}/${path.replace(/^\//, "")}`;
    try {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        timeout: AXIOS_TIMEOUT,
        headers: { Authorization: `Bearer ${this.jwt}`, Accept: "*/*" },
        validateStatus: (s) => s < 500,
      });
      const buffer = Buffer.from(res.data);
      if (res.status >= 400) {
        throw new BadGatewayException(`NewBytes GET ${path} → ${res.status}`);
      }
      const contentType = String(res.headers["content-type"] || "application/octet-stream").split(";")[0];
      return { buffer, contentType };
    } catch (err) {
      if (err instanceof BadGatewayException || err instanceof BadRequestException) throw err;
      const msg = axios.isAxiosError(err) ? String(err.response?.data ?? err.message) : String(err);
      throw new BadGatewayException(`NewBytes GET ${path} falló: ${msg.slice(0, 300)}`);
    }
  }

  post<T = unknown>(path: string, data?: unknown) {
    return this.request<T>("POST", path, { data });
  }

  patch<T = unknown>(path: string, data?: unknown) {
    return this.request<T>("PATCH", path, { data });
  }

  /**
   * Recorre páginas limit/offset como el sitio (Mis pedidos / comprobantes /
   * órdenes). Corta cuando la página viene corta o se llega al tope de offset.
   * Default maxOffset 60 (~80 filas) cubre el mes reciente sin 10+ roundtrips.
   */
  async paginate<T = unknown>(path: string, limit = 20, maxOffset = 60): Promise<T[]> {
    const all: T[] = [];
    for (let offset = 0; offset <= maxOffset; offset += limit) {
      const page = unwrapNbList<T>(await this.get(path, { limit, offset }));
      if (offset === 0 && page.length !== limit) {
        // Página corta, o el endpoint ignoró el paginado y mandó todo de una.
        return page;
      }
      all.push(...page);
      if (page.length < limit) break;
    }
    return all;
  }
}
