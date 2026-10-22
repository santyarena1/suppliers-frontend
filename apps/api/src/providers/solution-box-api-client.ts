import { BadGatewayException, BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import axios from "axios";
import { asNumber, asRecord, asString, axiosErrorMessage } from "./json-value";

/**
 * API oficial de Solution Box (lxc.solutionbox.com.ar), distinta del portal
 * www.solutionbox.com.ar. Llamadas tomadas del cliente de AcuStock
 * (SolutionBoxClient.php), que la usa en producción:
 * - POST /api/usuario/createToken (HTTP Basic usuario:contraseña de la API) →
 *   `{ token, expira_en }` (segundos; el token dura ~7 días). Máximo 2 cada 10 min.
 * - GET  /api/listas/articulos (Bearer) → `Articulo[]` con el catálogo entero.
 *   Máximo 2 por hora: una sync = un solo GET.
 * Son credenciales propias que entrega Solution Box, no el mail del sitio.
 */
export const SOLUTION_BOX_OFFICIAL_API = "https://lxc.solutionbox.com.ar";
const TIMEOUT_MS = 120_000;
/** Si `expira_en` no viene (o viene absurdo), el token vale 7 días. */
const DEFAULT_TOKEN_TTL_S = 7 * 24 * 60 * 60;
/** El token se renueva 5 min antes de vencer. */
const TOKEN_SKEW_MS = 5 * 60_000;

/** Claves en la credencial del comercio. Distintas de email/password (portal) y de los alias viejos api_user/api_password. */
export const SB_API_USER_KEY = "sb_api_user";
export const SB_API_PASSWORD_KEY = "sb_api_password";

export interface SolutionBoxApiCredentials {
  user: string;
  password: string;
}

export function parseSolutionBoxApiCredentials(raw: Record<string, string>): SolutionBoxApiCredentials | null {
  const user = (raw[SB_API_USER_KEY] ?? "").trim();
  const password = (raw[SB_API_PASSWORD_KEY] ?? "").trim();
  return user && password ? { user, password } : null;
}

/** ¿El comercio cargó usuario y contraseña de la API oficial? Sin eso, sigue el camino del portal. */
export function hasSolutionBoxOfficialApi(raw: Record<string, string> | null | undefined): boolean {
  return raw != null && parseSolutionBoxApiCredentials(raw) != null;
}

/**
 * La lista de artículos: AcuStock acepta el array pelado o envuelto en
 * `Articulos` / `articulos` / `items` / `data` / `lista`.
 */
export function extractSolutionBoxApiArticles(body: unknown, depth = 0): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.map((row) => asRecord(row)).filter((row): row is Record<string, unknown> => row != null);
  }
  const rec = asRecord(body);
  if (!rec || depth > 2) return [];
  for (const key of ["Articulos", "articulos", "items", "data", "lista"]) {
    if (rec[key] != null && typeof rec[key] === "object") return extractSolutionBoxApiArticles(rec[key], depth + 1);
  }
  return [];
}

export interface HttpResponseLike {
  status: number;
  data: unknown;
}

/** Lo mínimo de HTTP que usa el cliente; en los tests se reemplaza por respuestas armadas. */
export type SolutionBoxHttp = (req: {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
}) => Promise<HttpResponseLike>;

const axiosHttp: SolutionBoxHttp = async (req) => {
  const res = await axios.request({
    method: req.method,
    url: req.url,
    headers: req.headers,
    timeout: TIMEOUT_MS,
    validateStatus: () => true,
  });
  return { status: res.status, data: res.data };
};

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * Token por cuenta, en memoria del proceso. createToken admite 2 pedidos cada
 * 10 min y el token dura una semana: pedir uno por sync es tirar cupo. Si el
 * proceso se reinicia se pide uno nuevo, nada más.
 */
const tokenCache = new Map<string, CachedToken>();

function cacheKey(creds: SolutionBoxApiCredentials): string {
  return createHash("sha256").update(`${creds.user}\n${creds.password}`).digest("hex");
}

/** Para los tests: arrancar sin tokens guardados. */
export function clearSolutionBoxApiTokenCache(): void {
  tokenCache.clear();
}

function apiMessage(data: unknown): string {
  const rec = asRecord(data);
  return (asString(rec?.mensaje) ?? asString(rec?.message) ?? asString(rec?.error) ?? "").slice(0, 200);
}

export class SolutionBoxApiClient {
  private token: string | null = null;

  constructor(
    private readonly creds: SolutionBoxApiCredentials,
    private readonly http: SolutionBoxHttp = axiosHttp,
    private readonly now: () => number = Date.now
  ) {}

  static fromCredentials(raw: Record<string, string>, http?: SolutionBoxHttp, now?: () => number): SolutionBoxApiClient {
    const creds = parseSolutionBoxApiCredentials(raw);
    if (!creds) throw new BadRequestException("Faltan usuario y contraseña de la API de Solution Box");
    return new SolutionBoxApiClient(creds, http, now);
  }

  /** Catálogo entero en un GET. Un 401 renueva el token una sola vez; un 429 corta sin reintentar. */
  async listArticles(): Promise<Record<string, unknown>[]> {
    let res = await this.getArticles(await this.ensureToken(false));
    if (res.status === 401) {
      tokenCache.delete(cacheKey(this.creds));
      res = await this.getArticles(await this.ensureToken(true));
    }
    if (res.status === 429) {
      throw new BadGatewayException(
        "Solution Box limitó el listado de la API (429, máximo 2 por hora): se reintenta en la próxima sincronización"
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new BadGatewayException(`La API de Solution Box rechazó el token (HTTP ${res.status})`);
    }
    if (res.status < 200 || res.status >= 300) {
      const msg = apiMessage(res.data);
      throw new BadGatewayException(`La API de Solution Box devolvió HTTP ${res.status} en el listado${msg ? `: ${msg}` : ""}`);
    }
    return extractSolutionBoxApiArticles(res.data);
  }

  private async getArticles(token: string): Promise<HttpResponseLike> {
    try {
      return await this.http({
        method: "GET",
        url: `${SOLUTION_BOX_OFFICIAL_API}/api/listas/articulos`,
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      throw new BadGatewayException(`No se pudo leer el listado de la API de Solution Box: ${axiosErrorMessage(err, "error")}`);
    }
  }

  private async ensureToken(force: boolean): Promise<string> {
    const key = cacheKey(this.creds);
    const cached = tokenCache.get(key);
    if (!force && this.token) return this.token;
    if (!force && cached && cached.expiresAt - TOKEN_SKEW_MS > this.now()) {
      this.token = cached.token;
      return cached.token;
    }
    let res: HttpResponseLike;
    try {
      res = await this.http({
        method: "POST",
        url: `${SOLUTION_BOX_OFFICIAL_API}/api/usuario/createToken`,
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${this.creds.user}:${this.creds.password}`).toString("base64")}`,
        },
      });
    } catch (err) {
      throw new BadGatewayException(`No se pudo conectar con la API de Solution Box: ${axiosErrorMessage(err, "error")}`);
    }
    const rec = asRecord(res.data);
    const token = asString(rec?.token);
    if ((res.status === 200 || res.status === 201) && token) {
      const ttl = asNumber(rec?.expira_en);
      const seconds = ttl != null && ttl >= 60 ? ttl : DEFAULT_TOKEN_TTL_S;
      tokenCache.set(key, { token, expiresAt: this.now() + seconds * 1000 });
      this.token = token;
      return token;
    }
    if (res.status === 429) {
      // Como AcuStock: si el token guardado todavía no venció (aunque esté en el margen), se usa.
      if (cached && cached.expiresAt > this.now()) {
        this.token = cached.token;
        return cached.token;
      }
      throw new BadGatewayException(
        "Solution Box limitó los pedidos de token de la API (429, máximo 2 cada 10 minutos): se reintenta en la próxima sincronización"
      );
    }
    if (res.status === 401 || res.status === 403) {
      const msg = apiMessage(res.data);
      throw new BadRequestException(`Usuario o contraseña de la API de Solution Box incorrectos${msg ? ` (${msg})` : ""}`);
    }
    const msg = apiMessage(res.data);
    throw new BadGatewayException(`La API de Solution Box no dio token (HTTP ${res.status})${msg ? `: ${msg}` : ""}`);
  }
}
