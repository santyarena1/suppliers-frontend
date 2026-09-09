import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { type AxiosInstance } from "axios";

/**
 * Segunda fuente de locales.
 *
 * Los trece locales que faltaban no están en el agregador principal, y varios
 * (Full H4rd, XT-PC) contestan 403 a cualquier cliente que no sea un navegador.
 * HardGamers los lista a todos y, aunque no publica una API, cada página de
 * tienda trae el listado completo como JSON dentro de un `<span>` oculto: no
 * hace falta parsear tarjetas HTML, se lee el payload tal cual.
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

  constructor(private readonly config: ConfigService) {
    const baseURL = (config.get<string>("RETAIL_HG_BASE_URL") || DEFAULT_BASE).replace(/\/$/, "");
    this.maxPerMinute = Math.max(
      1,
      Math.min(11, Number(config.get("RETAIL_HG_MAX_PER_MIN") ?? 8)),
    );
    this.http = axios.create({
      baseURL,
      timeout: 45_000,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es-AR,es;q=0.9",
      },
      // El 429 lo queremos ver, no que axios lo tire como excepción opaca.
      validateStatus: (s) => s < 500,
    });
  }

  /** Los locales a traer de esta fuente. Configurables sin tocar código. */
  storeSlugs(): string[] {
    const raw = (this.config.get<string>("RETAIL_HG_STORES") || "").trim();
    const list = raw
      ? raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
      : ["hardcore", "hypergaming", "liontech", "maximus", "fullh4rd", "xt-pc"];
    return [...new Set(list)];
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
    await this.waitForSlot();
    const url = `/stores/${encodeURIComponent(slug)}?page=${page}&limit=${HG_PAGE_SIZE}`;
    const res = await this.http.get<string>(url, { responseType: "text" });

    if (res.status === 429) {
      const retry = Number(res.headers["retry-after"] ?? 30);
      this.logger.warn(`HardGamers 429 en ${slug} p${page}: espero ${retry}s`);
      await sleep(Math.min(120_000, Math.max(5_000, retry * 1000)));
      return this.fetchStorePage(slug, page);
    }
    if (res.status !== 200 || typeof res.data !== "string") {
      this.logger.warn(`HardGamers ${res.status} en ${slug} p${page}`);
      return null;
    }

    // Si el servidor avisa que queda poco margen, frenamos antes de que corte.
    const remaining = Number(res.headers["x-ratelimit-remaining"]);
    if (Number.isFinite(remaining) && remaining <= 1) await sleep(15_000);

    return this.parsePage(res.data);
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
