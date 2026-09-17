import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import type { CatalogSyncMeta, NormalizedProduct, ProviderAdapter } from "../types";
import {
  DistecnaClient,
  detailPatchFromDistecna,
  hasDistecnaCatalogAccess,
  mapDistecnaListProduct,
  parseDistecnaCredentials,
  productTypeFromRaw,
} from "../distecna-client";

const PAGE_LIMIT = 150;
const PAGE_PAUSE_MS = 200;
const DETAIL_PAUSE_MS = 200;
const DETAIL_CONCURRENCY = 2;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Catálogo de Distecna (Camino A por API Key, o V2 si hay usuario/contraseña JWT).
 * El listado solo trae código, SKU, stock, moneda, precio, IVA e II: el nombre,
 * la marca, la categoría y las fotos salen del detalle en background.
 */
@Injectable()
export class DistecnaAdapter implements ProviderAdapter {
  readonly provider = "DISTECNA" as const;
  private readonly logger = new Logger(DistecnaAdapter.name);

  async syncAll(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>,
    onMeta?: (meta: CatalogSyncMeta) => Promise<void>
  ): Promise<void> {
    const creds = parseDistecnaCredentials(credentials);
    if (!hasDistecnaCatalogAccess(creds)) {
      throw new BadGatewayException(
        "Credenciales de Distecna incompletas: hace falta la API Key (x-apikey) o usuario y contraseña de la API de pedidos."
      );
    }
    const client = DistecnaClient.fromCredentials(credentials);
    let offset = 0;
    let total = Infinity;
    let seen = 0;

    while (offset < total) {
      const page = await client.listProducts({ limit: PAGE_LIMIT, offset });
      total = page.total ?? 0;
      if (offset === 0 && total > 0) await onMeta?.({ expectedTotal: total });
      if (offset === 0) this.logger.log(`Distecna listado: total ${total}, primera tanda ${page.products?.length ?? 0}`);
      const items = (page.products ?? [])
        .map(mapDistecnaListProduct)
        .filter((p) => p.externalId);
      if (items.length) await onPage(items);
      seen += page.products?.length ?? 0;
      if (!(page.products ?? []).length) break;
      offset += PAGE_LIMIT;
      if (offset < total) await sleep(PAGE_PAUSE_MS);
    }

    if (seen === 0) {
      throw new BadGatewayException("Distecna no devolvió productos. Revisá la API Key o el entorno (prod/qa).");
    }
    this.logger.log(`Distecna sync: ${seen} productos (total declarado ${Number.isFinite(total) ? total : "?"})`);
  }

  async enrichDetails(
    credentials: Record<string, string>,
    codes: string[],
    onItem: (externalId: string, patch: Partial<NormalizedProduct>) => Promise<void>
  ): Promise<void> {
    if (codes.length === 0) return;
    const client = DistecnaClient.fromCredentials(credentials);
    const queue = [...codes];
    let failures = 0;
    const worker = async () => {
      while (queue.length > 0) {
        const code = queue.shift();
        if (!code) return;
        try {
          const detail = await client.getDetail(code);
          const patch = detailPatchFromDistecna(detail);
          if (productTypeFromRaw(detail) || Object.keys(patch).length > 0) {
            await onItem(code, patch);
          }
        } catch (err) {
          failures++;
          if (failures <= 5) {
            this.logger.warn(`Distecna ficha ${code}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        await sleep(DETAIL_PAUSE_MS);
      }
    };
    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, worker));
    if (failures > 0) this.logger.warn(`Distecna: ${failures} fichas no se pudieron leer`);
  }
}
