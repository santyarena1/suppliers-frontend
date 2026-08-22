import { BadGatewayException, BadRequestException } from "@nestjs/common";
import axios, { type AxiosRequestConfig, type Method } from "axios";
import { asRecord, asString, axiosErrorMessage } from "./json-value";

export const GN_API_BASE = "https://api.gruponucleosa.com";

export interface GnCredentials {
  id: string;
  username: string;
  password: string;
}

export function parseGnCredentials(raw: Record<string, string>): GnCredentials {
  const id = (raw.id || raw.empresaId || "").trim();
  const username = (raw.username || raw.user || "").trim();
  const password = (raw.password || raw.pass || "").trim();
  if (!id || !username || !password) {
    throw new BadGatewayException("Credenciales de Grupo Núcleo incompletas (id, usuario y contraseña)");
  }
  return { id, username, password };
}

/**
 * Cliente HTTP contra api.gruponucleosa.com — auth y pedidos según
 * apimanual.gruponucleo.com.ar (JWT 15 min, Bearer).
 */
export class GrupoNucleoApiClient {
  constructor(private readonly jwt: string) {}

  static async login(credentials: Record<string, string>): Promise<GrupoNucleoApiClient> {
    const { id, username, password } = parseGnCredentials(credentials);
    let body: unknown;
    try {
      const res = await axios.post(
        `${GN_API_BASE}/Authentication/Login`,
        { id: Number(id), username, password },
        { timeout: 15_000, headers: { "Content-Type": "application/json", Accept: "*/*" } }
      );
      body = res.data;
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 401 || status === 403) {
        throw new BadRequestException("Usuario o clave de Grupo Núcleo incorrectos");
      }
      throw new BadGatewayException(`No se pudo iniciar sesión en Grupo Núcleo: ${axiosErrorMessage(err, "error")}`);
    }
    const token = typeof body === "string"
      ? body.trim().replace(/^"|"$/g, "")
      : asString(asRecord(body)?.token) || asString(asRecord(body)?.access_token);
    if (!token) throw new BadGatewayException("Grupo Núcleo no devolvió token");
    return new GrupoNucleoApiClient(token);
  }

  async request<T = unknown>(method: Method, path: string, data?: unknown): Promise<T> {
    const url = `${GN_API_BASE}/${path.replace(/^\//, "")}`;
    const config: AxiosRequestConfig = {
      method,
      url,
      data,
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${this.jwt}`,
        Accept: "*/*",
        ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      validateStatus: (s) => s < 500,
    };
    try {
      const res = await axios.request<T>(config);
      if (res.status >= 400) {
        const msg = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? res.statusText);
        const errCls = res.status === 400 || res.status === 422 ? BadRequestException : BadGatewayException;
        throw new errCls(`Grupo Núcleo ${method} ${path} → ${res.status}: ${String(msg).slice(0, 400)}`);
      }
      return res.data;
    } catch (err) {
      if (err instanceof BadGatewayException || err instanceof BadRequestException) throw err;
      throw new BadGatewayException(`Grupo Núcleo ${method} ${path} falló: ${axiosErrorMessage(err, "error")}`);
    }
  }

  get<T = unknown>(path: string) {
    return this.request<T>("GET", path);
  }

  post<T = unknown>(path: string, data?: unknown) {
    return this.request<T>("POST", path, data);
  }
}
