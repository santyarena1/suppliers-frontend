import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import axios, { type AxiosInstance, type Method } from "axios";
import { throwAcuStockError, unwrapAcuStock } from "./tgs.errors";
import { TgsKeysService } from "./tgs.keys";

export { DEFAULT_ACUSTOCK_BASE } from "./tgs.constants";

export interface AcuStockResult<T> {
  data: T;
  meta?: Record<string, unknown>;
  requestId?: string;
}

@Injectable()
export class TgsClient {
  private readonly logger = new Logger(TgsClient.name);
  private readonly http: AxiosInstance;

  constructor(private readonly keys: TgsKeysService) {
    this.http = axios.create({
      timeout: 30_000,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      validateStatus: (status) => status >= 200 && status < 300,
    });
  }

  async request<T>(method: Method, path: string, opts?: { params?: Record<string, unknown>; body?: unknown }): Promise<AcuStockResult<T>> {
    const creds = await this.keys.resolve();
    if (!creds) {
      throw new BadGatewayException("Faltan las claves de AcuStock. Cargalas en SISTEMA TGS → Claves.");
    }
    const params = cleanParams(opts?.params);
    try {
      const res = await this.http.request({
        method,
        baseURL: creds.baseUrl,
        url: path.startsWith("/") ? path : `/${path}`,
        params,
        data: opts?.body,
        headers: {
          "X-AcuStock-Key": creds.key,
          "X-AcuStock-Secret": creds.secret,
        },
      });
      const unwrapped = unwrapAcuStock<T>(res.data);
      return {
        data: unwrapped.data,
        meta: unwrapped.meta,
        requestId: header(res.headers, "x-request-id"),
      };
    } catch (err) {
      if (axios.isAxiosError(err) && !err.response) {
        this.logger.warn(`AcuStock sin respuesta: ${method} ${path} (${err.message})`);
      }
      throwAcuStockError(err);
    }
  }

  get<T>(path: string, params?: Record<string, unknown>) {
    return this.request<T>("GET", path, { params });
  }

  patch<T>(path: string, body: unknown) {
    return this.request<T>("PATCH", path, { body });
  }

  post<T>(path: string, body: unknown) {
    return this.request<T>("POST", path, { body });
  }

  put<T>(path: string, body: unknown) {
    return this.request<T>("PUT", path, { body });
  }

  delete<T>(path: string) {
    return this.request<T>("DELETE", path);
  }
}

function header(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const raw = headers[name] ?? headers[name.toLowerCase()];
  return typeof raw === "string" ? raw : undefined;
}

function cleanParams(params?: Record<string, unknown>): Record<string, string | number> | undefined {
  if (!params) return undefined;
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else out[key] = String(value);
  }
  return Object.keys(out).length ? out : undefined;
}
