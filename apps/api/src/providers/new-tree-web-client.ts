import { BadGatewayException, BadRequestException } from "@nestjs/common";
import axios, { type AxiosInstance } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { axiosErrorMessage } from "./json-value";

export const NEW_TREE_SITE = "https://www.newtree.com.ar";
export const NEW_TREE_HOSTS = ["www.newtree.com.ar", "newtree.com.ar"];
const PAGE_METHODS_PATH = "/wfmWebSite2.aspx";
const TIMEOUT_MS = 30_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * Cloudflare, delante de newtree.com.ar, bloquea las IP de datacenter (Railway
 * responde 403 "Attention Required"). `NEW_TREE_PROXY_URL` (http://user:pass@host:puerto)
 * saca el tráfico de New Tree por otra IP; si no está, se va directo.
 */
function buildHttp(): AxiosInstance {
  const proxyUrl = (process.env.NEW_TREE_PROXY_URL || "").trim();
  const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
  return axios.create({
    timeout: TIMEOUT_MS,
    ...(agent ? { httpsAgent: agent, httpAgent: agent, proxy: false } : {}),
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "es-AR,es;q=0.9",
    },
  });
}

const http = buildHttp();

const CLOUDFLARE_BLOCK_MESSAGE =
  "Cloudflare bloquea la IP del servidor de Nodo en newtree.com.ar. Pedile a New Tree que la habilite o configurá NEW_TREE_PROXY_URL.";

function cloudflareBlocked(status: number, body: unknown): boolean {
  return status === 403 && typeof body === "string" && body.includes("Attention Required");
}

export interface NewTreeCredentials {
  username?: string;
  password?: string;
}

export function parseNewTreeCredentials(raw: Record<string, string>): NewTreeCredentials {
  const username = (raw.username || raw.user || raw.email || raw.usuario || "").trim();
  const password = (raw.password || raw.pass || "").trim();
  return { username: username || undefined, password: password || undefined };
}

export function hasNewTreePortalLogin(creds: NewTreeCredentials): boolean {
  return Boolean(creds.username && creds.password);
}

export interface NewTreeSession {
  /** hidWebSiteID: identificador fijo del sitio, va en cada PageMethod. */
  webSiteId: string;
  /** Vacío cuando la sesión es anónima (solo catálogo público). */
  customerId: string;
  salesTermsId: string;
  priceListId: string;
  storId: string;
}

type CookieJar = Map<string, string>;

function absorbCookies(jar: CookieJar, headers: { "set-cookie"?: string[] }) {
  for (const raw of headers["set-cookie"] ?? []) {
    const pair = raw.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

export function extractWebSiteId(html: string): string | null {
  const m =
    html.match(/id="hidWebSiteID"[^>]*value="([^"]+)"/i) ??
    html.match(/value="([^"]+)"[^>]*id="hidWebSiteID"/i);
  return m ? m[1] : null;
}

/**
 * Portal de New Tree (GlobalBluePoint, ASP.NET WebForms), confirmado en vivo:
 * - Cookie de sesión al hacer GET de cualquier página (ASP.NET_SessionId).
 * - Las acciones van como PageMethods: POST JSON a /wfmWebSite2.aspx/wsNRW_<método>
 *   con la cookie; la respuesta es {"d": "<string separado por , o ;>"}.
 * - wsNRW_setLogin(guidWS_Id, strWebNickName, strWebPassword)
 *   → "customerId,salesTermsId,priceListId,storId" (-1 si falla).
 * - Catálogo, cuenta corriente y pedidos son páginas HTML que cambian según la sesión.
 */
export class NewTreeWebClient {
  private constructor(
    private readonly jar: CookieJar,
    readonly session: NewTreeSession
  ) {}

  get isLoggedIn(): boolean {
    return Boolean(this.session.customerId && this.session.customerId !== "-1");
  }

  /** Sesión anónima: alcanza para el catálogo público (precios de lista). */
  static async connect(): Promise<NewTreeWebClient> {
    const jar: CookieJar = new Map();
    let html: string;
    try {
      const res = await http.get<string>(`${NEW_TREE_SITE}/HOME/newtree.aspx`, {
        responseType: "text",
        validateStatus: (s) => s < 500,
      });
      if (cloudflareBlocked(res.status, res.data)) throw new BadGatewayException(CLOUDFLARE_BLOCK_MESSAGE);
      if (res.status >= 400) throw new BadGatewayException(`New Tree HOME → HTTP ${res.status}`);
      absorbCookies(jar, res.headers as { "set-cookie"?: string[] });
      html = res.data;
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException(`No se pudo abrir el portal de New Tree: ${axiosErrorMessage(err, "error")}`);
    }
    const webSiteId = extractWebSiteId(html);
    if (!webSiteId) throw new BadGatewayException("New Tree no devolvió el identificador del sitio (hidWebSiteID)");
    return new NewTreeWebClient(jar, { webSiteId, customerId: "", salesTermsId: "", priceListId: "", storId: "" });
  }

  /** Sesión de cliente: precios propios, carrito, cuenta corriente y pedidos. */
  static async login(credentials: Record<string, string>): Promise<NewTreeWebClient> {
    const creds = parseNewTreeCredentials(credentials);
    if (!hasNewTreePortalLogin(creds)) {
      throw new BadGatewayException("Para New Tree hacen falta usuario y contraseña del portal (www.newtree.com.ar)");
    }
    const client = await NewTreeWebClient.connect();
    const answer = await client.pageMethod("wsNRW_setLogin", {
      guidWS_Id: client.session.webSiteId,
      strWebNickName: creds.username,
      strWebPassword: creds.password,
    });
    const [customerId, salesTermsId, priceListId, storId] = answer.split(",").map((s) => s.trim());
    if (!customerId || customerId === "-1" || customerId === "0") {
      throw new BadRequestException("Usuario o contraseña de New Tree incorrectos");
    }
    return new NewTreeWebClient(client.jar, {
      webSiteId: client.session.webSiteId,
      customerId,
      salesTermsId: salesTermsId ?? "",
      priceListId: priceListId ?? "",
      storId: storId ?? "",
    });
  }

  /** Llama un PageMethod y devuelve el string crudo de `d`. */
  async pageMethod(name: string, args: Record<string, unknown>): Promise<string> {
    try {
      const res = await http.post<{ d?: unknown } | string>(`${NEW_TREE_SITE}${PAGE_METHODS_PATH}/${name}`, args, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Cookie: cookieHeader(this.jar),
        },
        validateStatus: (s) => s < 500,
      });
      absorbCookies(this.jar, res.headers as { "set-cookie"?: string[] });
      if (cloudflareBlocked(res.status, res.data)) throw new BadGatewayException(CLOUDFLARE_BLOCK_MESSAGE);
      if (res.status >= 400) throw new BadGatewayException(`New Tree ${name} → HTTP ${res.status}`);
      const d = typeof res.data === "object" && res.data ? res.data.d : undefined;
      return d == null ? "" : String(d);
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException(`New Tree ${name} falló: ${axiosErrorMessage(err, "error")}`);
    }
  }

  async getHtml(path: string): Promise<string> {
    const url = path.startsWith("http") ? path : `${NEW_TREE_SITE}${path.startsWith("/") ? "" : "/"}${path}`;
    try {
      const res = await http.get<string>(url, {
        responseType: "text",
        headers: { Cookie: cookieHeader(this.jar) },
        maxRedirects: 3,
        validateStatus: (s) => s < 500,
      });
      if (cloudflareBlocked(res.status, res.data)) throw new BadGatewayException(CLOUDFLARE_BLOCK_MESSAGE);
      if (res.status >= 400) throw new BadGatewayException(`New Tree ${path} → HTTP ${res.status}`);
      absorbCookies(this.jar, res.headers as { "set-cookie"?: string[] });
      return res.data;
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException(`New Tree ${path} falló: ${axiosErrorMessage(err, "error")}`);
    }
  }

  async getBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    try {
      const res = await http.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        headers: { Cookie: cookieHeader(this.jar) },
        maxRedirects: 3,
      });
      return {
        buffer: Buffer.from(res.data),
        contentType: String(res.headers["content-type"] ?? "application/octet-stream"),
      };
    } catch (err) {
      throw new BadGatewayException(`No se pudo descargar el documento de New Tree: ${axiosErrorMessage(err, "error")}`);
    }
  }

  /** Variables de sesión del portal (cantidad por página, orden). */
  async setSessionVariable(name: string, value: string): Promise<void> {
    await this.pageMethod("wsNRW_SessionWrite", {
      guidWS_Id: this.session.webSiteId,
      strSessionName: name,
      strSessionValue: value,
    });
  }
}
