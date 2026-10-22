import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import type { NormalizedProduct, ProviderAdapter } from "../types";
import { SolutionBoxWebClient } from "../solution-box-web-client";
import {
  flattenCategories,
  mapSolutionBoxArticle,
  mapSolutionBoxDetail,
  type SolutionBoxCategory,
} from "../solution-box.parser";
import { asRecord, unwrapList } from "../json-value";
import { isAccessBlockedError } from "../provider-rate-limits";

/** El sitio pagina de a 1000 como máximo por rubro. */
const PAGE_LIMIT = 1000;
const MAX_PAGES_PER_CATEGORY = 20;
/** Fichas de a una y con pausa: el portal suspendió la cuenta por exceso de pedidos. */
const DETAIL_CONCURRENCY = 1;
const DETAIL_PAUSE_MS = 3_000;
/** Pausa entre listados de rubro durante la sync. */
const LIST_PAUSE_MS = 2_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Catálogo de Solution Box leído de la API interna de www.solutionbox.com.ar
 * con la sesión del cliente. Por cada rubro se piden dos listados: con
 * `Stock=1` (trae precio) y sin filtro (trae también lo sin stock, sin precio).
 * La API oficial de lxc.solutionbox.com.ar queda para cuando Solution Box
 * entregue credenciales y documentación.
 */
@Injectable()
export class SolutionBoxAdapter implements ProviderAdapter {
  readonly provider = "SOLUTION_BOX" as const;
  private readonly logger = new Logger(SolutionBoxAdapter.name);

  async syncAll(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>
  ): Promise<void> {
    const api = await SolutionBoxWebClient.login(credentials);
    const categories = flattenCategories(await api.get("/articulos/categorias"));
    if (categories.length === 0) throw new BadGatewayException("Solution Box no devolvió rubros");
    const seen = new Set<string>();
    for (const cat of categories) {
      const items = await this.readCategory(api, cat, seen);
      if (items.length) await onPage(items);
    }
    if (seen.size === 0) throw new BadGatewayException("Solution Box no devolvió artículos");
  }

  private async readCategory(api: SolutionBoxWebClient, cat: SolutionBoxCategory, seen: Set<string>) {
    const out: NormalizedProduct[] = [];
    // Primero lo que tiene stock (viene con precio), después el resto.
    for (const withStock of [true, false]) {
      for (let page = 0; page < MAX_PAGES_PER_CATEGORY; page++) {
        const params: Record<string, unknown> = { limit: PAGE_LIMIT, offset: page * PAGE_LIMIT };
        if (withStock) params.Stock = 1;
        const body = await api.get(`/articulos/info/categoria/${encodeURIComponent(cat.code)}`, params);
        await sleep(LIST_PAUSE_MS);
        const rows = unwrapList(asRecord(body)?.articulos);
        for (const row of rows) {
          const item = mapSolutionBoxArticle(row, cat);
          if (!item || seen.has(item.externalId)) continue;
          seen.add(item.externalId);
          out.push(item);
        }
        if (rows.length < PAGE_LIMIT) break;
      }
    }
    return out;
  }

  /** Descripción por ficha, en background: solo para lo sincronizado con stock. */
  async enrichDetails(
    credentials: Record<string, string>,
    codes: string[],
    onItem: (externalId: string, patch: Partial<NormalizedProduct>) => Promise<void>
  ): Promise<void> {
    if (codes.length === 0) return;
    const api = await SolutionBoxWebClient.login(credentials);
    const queue = [...codes];
    let failures = 0;
    const worker = async () => {
      while (queue.length > 0) {
        const code = queue.shift();
        if (!code) return;
        try {
          const detail = mapSolutionBoxDetail(await api.get("/articulos/detalle", { sku: code }));
          // Sin descripción en el portal: queda "" para no volver a pedirla en cada sync.
          await onItem(code, { longDescription: "", ...detail });
        } catch (err) {
          failures++;
          if (failures <= 5) this.logger.warn(`Solution Box ficha ${code}: ${err instanceof Error ? err.message : String(err)}`);
          // Un 429/403 no se insiste: el resto queda para la próxima sync.
          if (failures > 10 || isAccessBlockedError(err instanceof Error ? err.message : String(err))) {
            queue.length = 0;
            return;
          }
        }
        await sleep(DETAIL_PAUSE_MS);
      }
    };
    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, worker));
    if (failures > 0) this.logger.warn(`Solution Box: ${failures} fichas no se pudieron leer`);
  }
}
