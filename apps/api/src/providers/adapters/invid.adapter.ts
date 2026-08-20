import { Injectable, BadGatewayException } from "@nestjs/common";
import axios from "axios";
import type { NormalizedProduct, ProviderAdapter } from "../types";

const BASE_URL = "https://www.invidcomputers.com/api/v1";

interface InvidArticulo {
  ID: string;
  TITLE: string;
  PRICE: string;
  CURRENCY: string;
  PART_NUMBER?: string;
  EAN?: string;
  BRAND?: string;
  DESCRIPTION?: string;
  LONG_DESCRIPTION?: string;
  STOCK_STATUS?: string;
  STOCK?: number;
  IVA_PERCENT?: number;
  FINAL_PRICE?: string;
  IMAGE_URL?: string;
  CATEGORY?: string;
  CATEGORY_ID?: string;
  TAGS?: Record<string, string[]>;
  HEIGHT?: number;
  WIDTH?: number;
  LENGTH?: number;
  VOLUME?: number;
  WEIGHT?: number;
  DIMENSIONS_UNIT?: string;
  WEIGHT_UNIT?: string;
}

interface InvidListResponse {
  status: number;
  data: InvidArticulo[];
  next_page_url?: string | null;
}

/**
 * Mapeo manual campo-a-campo de Invid hacia nuestro esquema unificado.
 * Editar acá si Invid cambia un nombre de campo (spec pública en
 * docs/providers/invid.openapi.yaml).
 */
const FIELD_MAP: { [K in keyof NormalizedProduct]?: (p: InvidArticulo) => NormalizedProduct[K] } = {
  externalId: (p) => p.ID as never,
  partNumber: (p) => (p.PART_NUMBER || undefined) as never,
  ean: (p) => (p.EAN || undefined) as never,
  name: (p) => p.TITLE as never,
  brand: (p) => (p.BRAND || undefined) as never,
  category: (p) => (p.CATEGORY || undefined) as never,
  description: (p) => (p.DESCRIPTION || undefined) as never,
  longDescription: (p) => (p.LONG_DESCRIPTION || undefined) as never,
  price: (p) => (p.PRICE ? Number(p.PRICE) : undefined) as never,
  finalPrice: (p) => (p.FINAL_PRICE ? Number(p.FINAL_PRICE) : undefined) as never,
  currency: (p) => p.CURRENCY as never,
  ivaPercent: (p) => p.IVA_PERCENT as never,
  stock: (p) => p.STOCK as never,
  stockStatus: (p) => p.STOCK_STATUS as never,
  imageUrl: (p) => (p.IMAGE_URL || undefined) as never,
  weight: (p) => p.WEIGHT as never,
  weightUnit: (p) => p.WEIGHT_UNIT as never,
  height: (p) => p.HEIGHT as never,
  width: (p) => p.WIDTH as never,
  length: (p) => p.LENGTH as never,
  dimensionsUnit: (p) => p.DIMENSIONS_UNIT as never,
  volume: (p) => p.VOLUME as never,
  tags: (p) => flattenTags(p.TAGS) as never,
  // Sin equivalente en Invid: warranty, productUrl, subcategory.
};

@Injectable()
export class InvidAdapter implements ProviderAdapter {
  readonly provider = "INVID" as const;

  async syncAll(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>
  ): Promise<void> {
    const { username, password } = credentials;
    if (!username || !password) throw new BadGatewayException("Credenciales de Invid incompletas");

    const auth = await axios.post<{ status: number; access_token: string }>(
      `${BASE_URL}/auth.php`,
      { username, password },
      { timeout: 15_000 }
    );
    const token = auth.data.access_token;

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let res;
      try {
        res = await axios.get<InvidListResponse>(`${BASE_URL}/articulo.php`, {
          params: { offset, exclude_zero_price: 1 },
          headers: { Authorization: `Bearer ${token}` },
          timeout: 30_000,
        });
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 429) {
          // Límite real de Invid: 50 req/hora, compartido con otros sistemas
          // que usan la misma cuenta. Frenamos acá (lo ya sincronizado hasta
          // esta página queda guardado) en vez de perder todo el progreso;
          // el cron reintenta solo en la próxima corrida.
          const retryAfter = err.response.headers["retry-after"];
          const waitMsg = retryAfter ? ` Probá de nuevo en ${formatRetryAfter(retryAfter)}.` : "";
          throw new BadGatewayException(
            `Invid alcanzó su límite de 50 requests/hora (offset ${offset}, cuenta compartida con otros sistemas).${waitMsg}`
          );
        }
        throw err;
      }

      const { data } = res;
      const remaining = res.headers["x-ratelimit-remaining"];

      const list = Array.isArray(data.data) ? data.data : data.data ? [data.data] : [];
      await onPage(list.map((p) => mapProduct(p)));

      hasMore = Boolean(data.next_page_url) && list.length > 0;
      offset += 100;

      // Si nos queda 1 request o menos de cuota, frenamos antes de que la
      // próxima pegue un 429 — mejor terminar prolijo con lo sincronizado
      // hasta acá que perder el request en un error.
      if (hasMore && remaining !== undefined && Number(remaining) <= 1) {
        throw new BadGatewayException(
          `Invid: cuota de 50 requests/hora casi agotada, se frenó en offset ${offset} (cuenta compartida con otros sistemas). Lo sincronizado hasta acá quedó guardado; el cron completa el resto en la próxima corrida.`
        );
      }
    }
  }
}

function formatRetryAfter(value: string): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return value;
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? "un minuto" : `${minutes} minutos`;
}

function flattenTags(tags: Record<string, string[]> | undefined): string | undefined {
  if (!tags || Object.keys(tags).length === 0) return undefined;
  return Object.entries(tags)
    .map(([group, values]) => `${group}: ${values.join(", ")}`)
    .join(" · ");
}

function mapProduct(p: InvidArticulo): NormalizedProduct {
  const out: Partial<NormalizedProduct> = {};
  for (const [field, getter] of Object.entries(FIELD_MAP)) {
    (out as Record<string, unknown>)[field] = (getter as (p: InvidArticulo) => unknown)(p);
  }
  return { ...out, raw: p } as NormalizedProduct;
}
