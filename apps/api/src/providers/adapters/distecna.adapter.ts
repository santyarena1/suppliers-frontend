import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import type { CatalogSyncMeta, NormalizedProduct, ProviderAdapter } from "../types";
import {
  DistecnaClient,
  applyDistecnaDetail,
  hasDistecnaCatalogAccess,
  mapDistecnaListProduct,
  parseDistecnaCredentials,
  productTypeFromRaw,
} from "../distecna-client";

const PAGE_LIMIT = 150;
const PAGE_PAUSE_MS = 80;
const DETAIL_CONCURRENCY = 4;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Catálogo de Distecna (Camino A por API Key, o V2 si hay usuario/contraseña JWT).
 * El listado solo trae código, SKU, stock, moneda, precio, IVA e II. Nombre,
 * marca, categoría y fotos salen de GET /Product/{code} en la misma tanda:
 * si se deja para después, el buscador muestra SKUs a $0 sin foto.
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
      const items = await this.withDetails(client, page.products ?? []);
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

  /** Pide las fichas de la tanda en paralelo. Si una falla, queda el renglón del listado. */
  private async withDetails(client: DistecnaClient, rows: Parameters<typeof mapDistecnaListProduct>[0][]): Promise<NormalizedProduct[]> {
    const mapped = rows.map(mapDistecnaListProduct).filter((p) => p.externalId);
    if (mapped.length === 0) return mapped;
    let failures = 0;
    let index = 0;
    const worker = async () => {
      while (true) {
        const i = index++;
        if (i >= mapped.length) return;
        const item = mapped[i];
        try {
          const detail = await client.getDetail(item.externalId, productTypeFromRaw(item.raw));
          mapped[i] = applyDistecnaDetail(item, detail);
        } catch (err) {
          failures++;
          if (failures <= 5) {
            this.logger.warn(
              `Distecna ficha ${item.externalId}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, mapped.length) }, worker));
    if (failures > 0) this.logger.warn(`Distecna: ${failures}/${mapped.length} fichas de esta tanda no se pudieron leer`);
    return mapped;
  }
}
