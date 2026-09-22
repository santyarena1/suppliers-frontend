import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import type { CatalogSyncMeta, NormalizedProduct, ProviderAdapter } from "../types";
import {
  POLYTECH_PAGE_SIZE,
  PolytechClient,
  hasPolytechAccess,
  mapPolytechProduct,
  parsePolytechCredentials,
} from "../polytech-client";

/**
 * Catálogo de Polytech (Gestión Resellers). `POST /products/search` sin keywords
 * recorre el catálogo paginado. El precio guardado es neto en USD; el final incluye IVA.
 */
@Injectable()
export class PolytechAdapter implements ProviderAdapter {
  readonly provider = "POLYTECH" as const;
  private readonly logger = new Logger(PolytechAdapter.name);

  async syncAll(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>,
    onMeta?: (meta: CatalogSyncMeta) => Promise<void>
  ): Promise<void> {
    if (!hasPolytechAccess(parsePolytechCredentials(credentials))) {
      throw new BadGatewayException(
        "Credenciales de Polytech incompletas: hace falta usuario y contraseña del portal, o la API Key."
      );
    }
    const client = await PolytechClient.fromCredentials(credentials);
    let page = 1;
    let totalPages = 1;
    let seen = 0;

    while (page <= totalPages) {
      const batch = await client.searchProducts({ page, resultsPerPage: POLYTECH_PAGE_SIZE });
      if (page === 1) {
        totalPages = Math.max(0, batch.totalPages);
        if (totalPages > 0) {
          await onMeta?.({ expectedTotal: totalPages * POLYTECH_PAGE_SIZE });
        }
        this.logger.log(`Polytech listado: ${totalPages} páginas, primera tanda ${batch.items.length}`);
      }
      const items = batch.items.map(mapPolytechProduct).filter((item): item is NormalizedProduct => item != null);
      if (items.length) await onPage(items);
      seen += items.length;
      if (!batch.items.length) break;
      page += 1;
    }

    if (seen === 0) {
      throw new BadGatewayException("Polytech no devolvió productos. Revisá usuario y contraseña del portal.");
    }
    this.logger.log(`Polytech sync: ${seen} productos`);
  }
}
