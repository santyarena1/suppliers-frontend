import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { type AxiosInstance } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import {
  HARDGAMERS_FALLBACK_SLUGS,
  mergeHardgamersSlugs,
  parseHardgamersStoreSlugs,
} from "./retail-hardgamers.stores";

/**
 * Segunda fuente de locales.
 *
 * HardGamers lista decenas de locales (la portada publica los slugs). Varios
 * (Full H4rd, XT-PC) contestan 403 a cualquier cliente que no sea un navegador.
 * Aunque no publica una API, cada página de tienda trae el listado completo
 * como JSON dentro de un `<span>` oculto: no hace falta parsear tarjetas HTML.
 *
 * El sitio limita a 12 pedidos por minuto (`x-ratelimit-limit: 12`, ventana
 * rodante de 60s). Este cliente se queda por debajo a propósito y además frena
 * si el propio servidor avisa que queda poco margen: preferimos tardar a que
 * nos corten.
 */

const DEFAULT_BASE = "https://www.hardgamers.com.ar";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** El servidor topea el tamaño de página en 54 aunque se pida más. */
export const HG_PAGE_SIZE = 54;

export interface HardgamersDoc {
  _id: string;
  name: string;
  image?: string | null;
  price?: number | null;
  availability?: boolean;
  link?: string | null;
  store?: { _id: string; name: string } | null;
  discount?: number;
}

export interface HardgamersPage {
  docs: HardgamersDoc[];
  total: number;
  page: number;
  pages: number;
  storeName: string | null;
}

/** Quita las barras finales para poder concatenar la query sin duplicarlas. */
function stripTrailingSlash(url: string): string {
  let out = url;
  while (out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** El payload viene escapado como entidades HTML dentro del span. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#34;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

@Injectable()
export class RetailHardgamersClient {
  private readonly logger = new Logger(RetailHardgamersClient.name);
  private readonly http: AxiosInstance;
  /** Pedidos por minuto que nos permitimos, por debajo del límite real (12). */
  private readonly maxPerMinute: number;
  private readonly stamps: number[] = [];
  private readonly viaProxy: boolean;
  /** Salida por Vercel: la fuente bloquea la IP de Railway pero no la de ahi. */
  private readonly fetchVia: string;
  private readonly fetchToken: string;
  /** Cortacircuito: si la fuente nos bloquea, dejamos de golpearla un rato. */
  private blockedUntil = 0;
  private consecutiveBlocks = 0;
  /** Cuantas veces seguidas nos bloquearon: cada una espera mas que la anterior. */
  private blockRounds = 0;
  private cachedSlugs: string[] | null = null;
  private cachedSlugsAt = 0;

  constructor(private readonly config: ConfigService) {
    const baseURL = (config.get<string>("RETAIL_HG_BASE_URL") || DEFAULT_BASE).replace(/\/$/, "");
    this.maxPerMinute = Math.max(
      1,
      Math.min(11, Number(config.get("RETAIL_HG_MAX_PER_MIN") ?? 8)),
    );

    // Mismo problema que New Tree: el sitio contesta 403 a la IP del datacenter.
    // Con un proxy configurado salimos por ahí; sin proxy, se intenta igual.
    const proxyUrl = (config.get<string>("RETAIL_HG_PROXY_URL") || "").trim();
    const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
    this.viaProxy = Boolean(proxyUrl);
    this.fetchVia = stripTrailingSlash((config.get<string>("RETAIL_HG_FETCH_VIA_URL") || "").trim());
    this.fetchToken = (config.get<string>("RETAIL_HG_FETCH_TOKEN") || "").trim();

    this.http = axios.create({
      baseURL,
      timeout: 45_000,
      ...(agent ? { httpsAgent: agent, httpAgent: agent, proxy: false as const } : {}),
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Referer: baseURL + "/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      // El 403 y el 429 los queremos ver, no que axios los tire como excepción opaca.
      validateStatus: (s) => s < 500,
    });
  }

  /** Extra de env: se suman a los descubiertos, no los reemplazan. */
  extraStoreSlugs(): string[] {
    const raw = (this.config.get<string>("RETAIL_HG_STORES") || "").trim();
    if (!raw) return [];
    return raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  }

  /**
   * Todos los locales que se van a traer: portada de HardGamers + respaldo +
   * `RETAIL_HG_STORES`. Antes solo se traían los que NO estaban en PrecioLíder;
   * ahora se traen todos (el ingest reusa el local existente si el nombre coincide).
   */
  async resolveStoreSlugs(): Promise<string[]> {
    const ttlMs = Math.max(60_000, Number(this.config.get("RETAIL_HG_SLUG_TTL_MS") ?? 6 * 60 * 60_000));
    if (this.cachedSlugs && Date.now() - this.cachedSlugsAt < ttlMs) {
      return mergeHardgamersSlugs(this.cachedSlugs, this.extraStoreSlugs());
    }
    const discovered = await this.discoverStoreSlugs();
    const merged = mergeHardgamersSlugs(discovered, HARDGAMERS_FALLBACK_SLUGS, this.extraStoreSlugs());
    this.cachedSlugs = merged;
    this.cachedSlugsAt = Date.now();
    this.logger.log("HardGamers: " + merged.length + " locales a sincronizar");
    return merged;
  }

  private async discoverStoreSlugs(): Promise<string[]> {
    try {
      const html = await this.fetchHtml("/");
      if (!html) return [];
      const slugs = parseHardgamersStoreSlugs(html);
      if (slugs.length === 0) {
        this.logger.warn("HardGamers: la portada no trajo slugs de /stores/");
      }
      return slugs;
    } catch (err) {
      this.logger.warn(
        "HardGamers: no se pudo leer la portada (" +
          (err instanceof Error ? err.message : String(err)) +
          "). Uso el listado de respaldo."
      );
      return [];
    }
  }

  /** true si la fuente nos está bloqueando y todavía estamos en penitencia. */
  isBlocked(): boolean {
    return Date.now() < this.blockedUntil;
  }

  blockedReason(): string {
    if (this.fetchVia) return "HardGamers bloquea también la salida de RETAIL_HG_FETCH_VIA_URL.";
    return this.viaProxy
      ? "HardGamers bloquea la salida configurada en RETAIL_HG_PROXY_URL."
      : "HardGamers bloquea la IP del servidor de Nodo. Configurá RETAIL_HG_FETCH_VIA_URL (la ruta /api/retail-fetch del front) o RETAIL_HG_PROXY_URL.";
  }

  /** Ventana rodante propia: nunca superamos maxPerMinute pedidos por minuto. */
  private async waitForSlot(): Promise<void> {
    for (;;) {
      const now = Date.now();
      while (this.stamps.length && now - this.stamps[0] > 60_000) this.stamps.shift();
      if (this.stamps.length < this.maxPerMinute) {
        this.stamps.push(now);
        return;
      }
      await sleep(Math.max(1_000, 60_000 - (now - this.stamps[0]) + 250));
    }
  }

  async fetchStorePage(slug: string, page: number): Promise<HardgamersPage | null> {
    const path = `/stores/${encodeURIComponent(slug)}?page=${page}&limit=${HG_PAGE_SIZE}`;
    const html = await this.fetchHtml(path);
    if (html == null) return null;
    return this.parsePage(html);
  }

  /** HTML de HardGamers, por proxy o por la salida de Vercel si está configurada. */
  private async fetchHtml(path: string): Promise<string | null> {
    if (this.isBlocked()) return null;
    await this.waitForSlot();

    const urlPath = path.startsWith("/") ? path : `/${path}`;
    const res = this.fetchVia
      ? await this.http.get<string>(
          `${this.fetchVia}?url=${encodeURIComponent(DEFAULT_BASE + urlPath)}`,
          {
            responseType: "text",
            baseURL: "",
            headers: this.fetchToken ? { "x-nodo-fetch-token": this.fetchToken } : {},
          }
        )
      : await this.http.get<string>(urlPath, { responseType: "text" });

    if (res.status === 429) {
      const retry = Number(res.headers["retry-after"] ?? 30);
      this.logger.warn(`HardGamers 429 en ${urlPath}: espero ${retry}s`);
      await sleep(Math.min(120_000, Math.max(5_000, retry * 1000)));
      return this.fetchHtml(path);
    }

    if (res.status === 403) {
      // Golpear una y otra vez una puerta cerrada solo ensucia el log y puede
      // endurecer el bloqueo: después de tres seguidos, media hora de pausa.
      this.consecutiveBlocks += 1;
      if (this.consecutiveBlocks >= 3) {
        // Retroceso creciente: 30 min, 2 h, 6 h, 12 h. Si nos bloquearon a
        // proposito, insistir cada media hora no lo va a destrabar y solo
        // ensucia el log; si fue algo pasajero, igual se recupera solo.
        const esperas = [30, 120, 360, 720];
        const minutos = esperas[Math.min(this.blockRounds, esperas.length - 1)];
        this.blockRounds += 1;
        this.blockedUntil = Date.now() + minutos * 60_000;
        this.consecutiveBlocks = 0;
        this.logger.warn(`${this.blockedReason()} Pauso la fuente ${minutos} minutos.`);
      }
      return null;
    }

    if (res.status !== 200 || typeof res.data !== "string") {
      this.logger.warn(`HardGamers ${res.status} en ${urlPath}`);
      return null;
    }

    this.consecutiveBlocks = 0;
    this.blockRounds = 0;

    const remaining = Number(res.headers["x-ratelimit-remaining"]);
    if (Number.isFinite(remaining) && remaining <= 1) await sleep(15_000);

    return res.data;
  }

  /**
   * El listado viaja como JSON en un `<span style="display: none;">`. Hay
   * varios spans ocultos; el bueno es el único que trae `docs`.
   */
  private parsePage(html: string): HardgamersPage | null {
    const spans = html.matchAll(/<span style="display: none;">([\s\S]*?)<\/span>/g);
    for (const m of spans) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(decodeEntities(m[1]).trim());
      } catch {
        continue;
      }
      const p = parsed as {
        docs?: HardgamersDoc[];
        total?: number;
        page?: number;
        pages?: number;
        stores?: { _id?: { _id?: string; name?: string } }[];
      };
      if (!Array.isArray(p.docs)) continue;
      return {
        docs: p.docs,
        total: Number(p.total) || p.docs.length,
        page: Number(p.page) || 1,
        pages: Number(p.pages) || 1,
        storeName: p.stores?.[0]?._id?.name ?? p.docs[0]?.store?.name ?? null,
      };
    }
    return null;
  }
}

/**
 * `RetailStore.externalId` y `RetailProduct.externalId` son enteros y vienen
 * del agregador principal, que siempre usa positivos. HardGamers identifica con
 * strings (`liontech:btk8r4`), así que se les da un espacio numérico propio en
 * NEGATIVOS: así conviven las dos fuentes en la misma tabla sin poder pisarse.
 */
export function hardgamersExternalId(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return -((h >>> 0) % 2_000_000_000) - 1;
}
