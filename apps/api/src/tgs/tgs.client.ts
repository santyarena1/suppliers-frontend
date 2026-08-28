import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { type AxiosInstance, type Method } from "axios";
import { throwAcuStockError, unwrapAcuStock } from "./tgs.errors";

export const DEFAULT_ACUSTOCK_BASE = "https://thegamershop.acustock.app/api/v1/sistema";

export interface AcuStockResult<T> {
  data: T;
  meta?: Record<string, unknown>;
  requestId?: string;
}

@Injectable()
export class TgsClient {
  private readonly logger = new Logger(TgsClient.name);
  private readonly http: AxiosInstance;
  private readonly configured: boolean;

  constructor(config: ConfigService) {
    const baseURL = (config.get<string>("ACUSTOCK_BASE_URL") || DEFAULT_ACUSTOCK_BASE).replace(/\/$/, "");
    const key = (config.get<string>("ACUSTOCK_API_KEY") || "").trim();
    const secret = (config.get<string>("ACUSTOCK_API_SECRET") || "").trim();
    this.configured = Boolean(key && secret);
    if (!this.configured) {
      this.logger.warn(
        "ACUSTOCK_API_KEY / ACUSTOCK_API_SECRET no están definidas; SISTEMA TGS no puede hablar con AcuStock."
      );
    }
    this.http = axios.create({
      baseURL,
      timeout: 30_000,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(key ? { "X-AcuStock-Key": key } : {}),
        ...(secret ? { "X-AcuStock-Secret": secret } : {}),
      },
      validateStatus: (status) => status >= 200 && status < 300,
    });
  }

  async request<T>(method: Method, path: string, opts?: { params?: Record<string, unknown>; body?: unknown }): Promise<AcuStockResult<T>> {
    if (!this.configured) {
      throw new BadGatewayException("Faltan ACUSTOCK_API_KEY y ACUSTOCK_API_SECRET en el servidor.");
    }
    const params = cleanParams(opts?.params);
    try {
      const res = await this.http.request({
        method,
        url: path.startsWith("/") ? path : `/${path}`,
        params,
        data: opts?.body,
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
