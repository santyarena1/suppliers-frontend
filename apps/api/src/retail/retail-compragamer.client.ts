import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { type AxiosInstance } from "axios";

/**
 * Tercera fuente de locales: Compra Gamer.
 *
 * No está en el agregador principal ni en HardGamers, pero publica su catálogo
 * completo como un JSON estático, sin auth ni paginación: una sola petición
 * trae todo. Es la fuente más barata de las tres.
 *
 * Va sin imagen a propósito: su CDN contesta 403 a cualquier cliente que no sea
 * un navegador, y un link roto es peor que no tener foto.
 */

const DEFAULT_URL = "https://static.compragamer.com/productos";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Lo que publica su JSON, recortado a lo que usamos. */
interface CompragamerRaw {
  id_producto?: number;
  nombre?: string;
  precioEspecial?: number | null;
  precioLista?: number | null;
  stock?: number | null;
  vendible?: number | null;
  visible_solo_en_ATPC?: number | null;
  visible_solo_en_combo?: number | null;
}

export interface CompragamerProduct {
  externalKey: string;
  name: string;
  price: number;
  inStock: boolean;
}

@Injectable()
export class RetailCompragamerClient {
  private readonly logger = new Logger(RetailCompragamerClient.name);
  private readonly http: AxiosInstance;
  private readonly url: string;

  constructor(private readonly config: ConfigService) {
    this.url = (config.get<string>("RETAIL_CG_URL") || DEFAULT_URL).trim();
    this.http = axios.create({
      timeout: 120_000,
      // El catálogo entero son ~10 MB en una sola respuesta.
      maxContentLength: 64 * 1024 * 1024,
      maxBodyLength: 64 * 1024 * 1024,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "es-AR,es;q=0.9",
        Referer: "https://compragamer.com/",
      },
      validateStatus: (s) => s < 500,
    });
  }

  enabled(): boolean {
    return this.config.get("RETAIL_CG_DISABLED") !== "true";
  }

  /** Nombre con el que se da de alta el local. */
  storeName(): string {
    return "Compra Gamer";
  }

  async fetchCatalog(): Promise<CompragamerProduct[] | null> {
    const res = await this.http.get<unknown>(this.url);
    if (res.status !== 200 || !Array.isArray(res.data)) {
      this.logger.warn(`Compra Gamer ${res.status}: respuesta inesperada`);
      return null;
    }

    const out: CompragamerProduct[] = [];
    for (const raw of res.data as CompragamerRaw[]) {
      const id = raw?.id_producto;
      const name = (raw?.nombre || "").trim();
      if (!id || !name) continue;
      // Armados a medida y piezas que solo existen dentro de un combo no son
      // productos comparables: ensucian la referencia de mercado.
      if (raw.visible_solo_en_ATPC === 1 || raw.visible_solo_en_combo === 1) continue;

      // El precio que el local publica como titular es el especial; el de lista
      // queda de respaldo. Elegimos el titular para no inflar el margen.
      const price = Number(raw.precioEspecial) > 0 ? Number(raw.precioEspecial) : Number(raw.precioLista);
      if (!Number.isFinite(price) || price <= 0) continue;

      out.push({
        externalKey: `compragamer:${id}`,
        name,
        price,
        inStock: Number(raw.stock ?? 0) > 0 && raw.vendible !== 0,
      });
    }
    return out;
  }
}
