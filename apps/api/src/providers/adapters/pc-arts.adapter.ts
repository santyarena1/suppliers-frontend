import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import type { CatalogSyncMeta, NormalizedProduct, ProviderAdapter } from "../types";
import { asNumber, asRecord, asString, axiosErrorMessage } from "../json-value";

/**
 * PC Arts (pcarts.com): `GET https://api.pcarts.com/operations` con los headers
 * `x-session-token` (el token API del comercio) y `operation`:
 * - 1005: catálogo (nombre, marca, categoría, imágenes), `offset`/`limit` de a 400;
 * - 1004: stock y precio, de a 500.
 * Las dos responden `{ Products: [...], Paging: { total } }` y se cruzan por `sku`.
 * Portado de `PcArtsClient.php` de AcuStock; no lo probamos contra la API real.
 */
export const PC_ARTS_API = "https://api.pcarts.com/operations";
export const PC_ARTS_CATALOG_OP = "1005";
export const PC_ARTS_STOCK_OP = "1004";
export const PC_ARTS_CATALOG_LIMIT = 400;
export const PC_ARTS_STOCK_LIMIT = 500;
/** AcuStock espera 0,3 s entre páginas; acá un poco más. */
const PAGE_PAUSE_MS = 500;
const TIMEOUT_MS = 90_000;
const RETRIES = 2;
/** Tope de páginas por operación: si `Paging.total` viene mal no se pide para siempre. */
const MAX_PAGES = 200;
const BATCH = 200;

export interface PcArtsPage {
  products: Record<string, unknown>[];
  total: number;
}

export type PcArtsFetch = (operation: string, offset: number, limit: number) => Promise<PcArtsPage>;

export function parsePcArtsToken(raw: Record<string, string>): string {
  return (raw.api_token ?? raw.token ?? raw.session_token ?? raw.apiKey ?? "").trim();
}

export function parsePcArtsPage(body: unknown): PcArtsPage {
  const rec = asRecord(body);
  if (!rec) throw new BadGatewayException("PC Arts devolvió una respuesta que no es JSON.");
  const list = Array.isArray(rec.Products) ? rec.Products : Array.isArray(rec.products) ? rec.products : [];
  const paging = asRecord(rec.Paging) ?? asRecord(rec.paging);
  return {
    products: list.map((p) => asRecord(p)).filter((p): p is Record<string, unknown> => p != null),
    total: Math.max(0, Math.trunc(asNumber(paging?.total) ?? 0)),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Recorre una operación paginada y devuelve los productos por `sku`. */
export async function fetchPcArtsOperation(
  fetchPage: PcArtsFetch,
  operation: string,
  limit: number,
  pauseMs = PAGE_PAUSE_MS
): Promise<Map<string, Record<string, unknown>>> {
  const bySku = new Map<string, Record<string, unknown>>();
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { products, total } = await fetchPage(operation, offset, limit);
    for (const p of products) {
      const sku = asString(p.sku);
      if (sku) bySku.set(sku, p);
    }
    offset += limit;
    if (!products.length || offset >= total) break;
    if (pauseMs > 0) await sleep(pauseMs);
  }
  return bySku;
}

/** Catálogo (1005) + stock/precio (1004), unidos por `sku`. Lo de 1004 manda. */
export async function fetchPcArtsCatalog(fetchPage: PcArtsFetch, pauseMs = PAGE_PAUSE_MS): Promise<Record<string, unknown>[]> {
  const catalog = await fetchPcArtsOperation(fetchPage, PC_ARTS_CATALOG_OP, PC_ARTS_CATALOG_LIMIT, pauseMs);
  const stock = await fetchPcArtsOperation(fetchPage, PC_ARTS_STOCK_OP, PC_ARTS_STOCK_LIMIT, pauseMs);
  const skus = new Set([...catalog.keys(), ...stock.keys()]);
  return [...skus].map((sku) => ({ ...(catalog.get(sku) ?? {}), ...(stock.get(sku) ?? {}) }));
}

function firstImage(raw: Record<string, unknown>): string | undefined {
  if (Array.isArray(raw.images) && raw.images.length) {
    const first = raw.images[0];
    const url = typeof first === "string" ? first : asString(asRecord(first)?.url);
    if (url) return url;
  }
  for (const key of ["image_url", "image", "IMAGE_URL", "thumbnail"]) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Producto ya unido. `price` es neto en USD (AcuStock lo trata siempre como
 * USD); `tax_iva_rate` y `tax_ii_rate` (internos) son alícuotas aparte y el
 * final es neto × (1 + IVA + internos).
 */
export function mapPcArtsProduct(raw: Record<string, unknown>): NormalizedProduct | null {
  const sku = asString(raw.sku);
  if (!sku) return null;
  const name = asString(raw.sku_desc) ?? sku;

  const price = asNumber(raw.price);
  const iva = asNumber(raw.tax_iva_rate);
  const ii = asNumber(raw.tax_ii_rate) ?? asNumber(raw.tax_internal_rate);
  const ivaPercent = iva != null && iva >= 0 && iva <= 100 ? iva : undefined;
  const internos = ii != null && ii > 0 && ii <= 100 ? ii : 0;
  const hasPrice = price != null && price > 0;
  const stock = asNumber(raw.stock);

  return {
    externalId: sku,
    sku,
    partNumber: asString(raw.part_number) ?? asString(raw.partNumber) ?? asString(raw.mpn),
    ean: asString(raw.ean) ?? asString(raw.EAN) ?? asString(raw.upc),
    name,
    brand: asString(raw.brand),
    category: asString(raw.category_desc),
    price: hasPrice ? round4(price) : undefined,
    finalPrice: hasPrice && ivaPercent != null ? round4(price * (1 + (ivaPercent + internos) / 100)) : undefined,
    currency: hasPrice ? "USD" : undefined,
    ivaPercent,
    stock: stock != null ? Math.max(0, Math.trunc(stock)) : undefined,
    imageUrl: firstImage(raw),
    raw,
  };
}

function httpFetcher(token: string): PcArtsFetch {
  return async (operation, offset, limit) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const res = await axios.get(PC_ARTS_API, {
          params: { offset, limit },
          headers: { "Content-Type": "application/json", "x-session-token": token, operation },
          timeout: TIMEOUT_MS,
          maxRedirects: 0,
        });
        return parsePcArtsPage(res.data);
      } catch (err) {
        if (err instanceof BadGatewayException) throw err;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        // Un 429 no se reintenta: la sync se pausa y se prueba más tarde (provider-rate-limits).
        const retryable = status == null || (status >= 500 && status <= 504);
        if (!retryable || attempt >= RETRIES) {
          const msg = axiosErrorMessage(err, "no respondió").split(token).join("••••");
          throw new BadGatewayException(`PC Arts (operación ${operation}, offset ${offset}): ${msg}`);
        }
        await sleep(2_000 * 2 ** attempt);
      }
    }
  };
}

@Injectable()
export class PcArtsAdapter implements ProviderAdapter {
  readonly provider = "PC_ARTS" as const;
  private readonly logger = new Logger(PcArtsAdapter.name);

  async syncAll(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>,
    onMeta?: (meta: CatalogSyncMeta) => Promise<void>
  ): Promise<void> {
    const token = parsePcArtsToken(credentials);
    if (!token) throw new BadGatewayException("Falta el token API de PC Arts.");

    const merged = await fetchPcArtsCatalog(httpFetcher(token));
    const items = merged.map(mapPcArtsProduct).filter((p): p is NormalizedProduct => p != null);
    if (!items.length) throw new BadGatewayException("PC Arts no devolvió productos. Revisá el token API.");
    await onMeta?.({ expectedTotal: items.length });
    for (let i = 0; i < items.length; i += BATCH) await onPage(items.slice(i, i + BATCH));
    this.logger.log(`PC Arts sync: ${items.length} productos`);
  }
}
