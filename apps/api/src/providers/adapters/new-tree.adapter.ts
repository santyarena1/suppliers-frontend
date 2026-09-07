import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import type { NormalizedProduct, ProviderAdapter } from "../types";
import {
  NewTreeWebClient,
  hasNewTreePortalLogin,
  parseNewTreeCredentials,
} from "../new-tree-web-client";
import { NewTreeSoapClient, parseNewTreeApiCredentials } from "../new-tree-soap-client";
import {
  detailPath,
  listingPath,
  mapApiArticle,
  mapListingItem,
  parseCategoryNav,
  parseDetail,
  parseListing,
  parseMaxPage,
  type NewTreeApiArticle,
  type NewTreeCategory,
} from "../new-tree-catalog.parser";

/** Tanda con la que se persiste el catálogo de la API (viene entero en una respuesta). */
const API_BATCH = 200;

/** Páginas del listado que se piden en paralelo (el portal es WebForms: sin abusar). */
const PAGE_CONCURRENCY = 3;
/** Tope defensivo por listado; el catálogo completo son ~50 páginas de 32. */
const MAX_PAGES = 250;
/** Fichas en paralelo durante el enriquecimiento en background. */
const DETAIL_CONCURRENCY = 3;
const DETAIL_PAUSE_MS = 150;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Catálogo de New Tree, leído del portal (www.newtree.com.ar):
 * - Con usuario y contraseña se ven los precios del cliente; sin sesión, los de lista.
 * - Se recorre cada subcategoría del menú (para quedarnos con categoría y
 *   subcategoría) y al final el listado general para lo que no cuelga de ninguna.
 * - La ficha de cada producto (marca, modelo, IVA, descripción) se trae en
 *   background con `enrichDetails`, porque son ~1500 pedidos lentos.
 */
@Injectable()
export class NewTreeAdapter implements ProviderAdapter {
  readonly provider = "NEW_TREE" as const;
  readonly publicCatalog = true;
  private readonly logger = new Logger(NewTreeAdapter.name);

  private async open(credentials: Record<string, string>): Promise<NewTreeWebClient> {
    const creds = parseNewTreeCredentials(credentials);
    return hasNewTreePortalLogin(creds) ? NewTreeWebClient.login(credentials) : NewTreeWebClient.connect();
  }

  async syncAll(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>
  ): Promise<void> {
    // Con credenciales de la API (SOAP de GlobalBluePoint) el catálogo entra por ahí:
    // precios del cliente y un solo pedido, sin depender del portal (Cloudflare).
    if (parseNewTreeApiCredentials(credentials)) {
      await this.syncFromApi(credentials, onPage);
      return;
    }
    await this.syncFromPortal(credentials, onPage);
  }

  private async syncFromApi(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>
  ): Promise<void> {
    const soap = await NewTreeSoapClient.authenticate(credentials);
    const rows = await soap.getArticulos();
    const seen = new Set<string>();
    let batch: NormalizedProduct[] = [];
    for (const row of rows) {
      const item = mapApiArticle(row as NewTreeApiArticle);
      if (!item || seen.has(item.externalId)) continue;
      seen.add(item.externalId);
      batch.push(item);
      if (batch.length >= API_BATCH) {
        await onPage(batch);
        batch = [];
      }
    }
    if (batch.length) await onPage(batch);
    if (seen.size === 0) throw new BadGatewayException("La API de New Tree no devolvió artículos");
  }

  private async syncFromPortal(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>
  ): Promise<void> {
    const client = await this.open(credentials);
    try {
      await client.setSessionVariable("cantidad", "52");
    } catch (err) {
      this.logger.warn(`New Tree: no se pudo fijar 52 por página (${err instanceof Error ? err.message : String(err)})`);
    }
    const home = await client.getHtml("/HOME/newtree.aspx");
    const categories = parseCategoryNav(home);
    const seen = new Set<string>();

    for (const cat of categories) {
      const items = await this.walkListing(client, cat, seen);
      if (items.length) await onPage(items);
    }
    const rest = await this.walkListing(client, null, seen);
    if (rest.length) await onPage(rest);

    if (seen.size === 0) {
      throw new BadGatewayException("New Tree no devolvió productos: cambió el portal o la sesión no es válida");
    }
  }

  private async walkListing(
    client: NewTreeWebClient,
    cat: NewTreeCategory | null,
    seen: Set<string>
  ): Promise<NormalizedProduct[]> {
    const first = await client.getHtml(listingPath(cat, 1));
    const pages = [parseListing(first)];
    const maxPage = Math.min(parseMaxPage(first), MAX_PAGES);
    for (let start = 2; start <= maxPage; start += PAGE_CONCURRENCY) {
      const numbers = Array.from({ length: Math.min(PAGE_CONCURRENCY, maxPage - start + 1) }, (_, i) => start + i);
      const htmls = await Promise.all(numbers.map((n) => client.getHtml(listingPath(cat, n))));
      const parsed = htmls.map(parseListing);
      pages.push(...parsed);
      if (parsed.every((p) => p.length === 0)) break;
    }
    const out: NormalizedProduct[] = [];
    for (const item of pages.flat()) {
      if (seen.has(item.itemId)) continue;
      seen.add(item.itemId);
      out.push(mapListingItem(item, cat));
    }
    return out;
  }

  async enrichDetails(
    credentials: Record<string, string>,
    codes: string[],
    onItem: (externalId: string, patch: Partial<NormalizedProduct>) => Promise<void>
  ): Promise<void> {
    if (codes.length === 0) return;
    // La API ya trae marca, modelo, IVA y descripción: no hace falta leer fichas del portal.
    if (parseNewTreeApiCredentials(credentials)) return;
    const client = await this.open(credentials);
    const queue = [...codes];
    let failures = 0;
    const worker = async () => {
      while (queue.length > 0) {
        const code = queue.shift();
        if (!code) return;
        try {
          const detail = parseDetail(await client.getHtml(detailPath(code)));
          const patch: Partial<NormalizedProduct> = {};
          if (detail.brand) patch.brand = detail.brand;
          if (detail.partNumber) patch.partNumber = detail.partNumber;
          if (detail.ean) patch.ean = detail.ean;
          if (detail.ivaPercent != null) patch.ivaPercent = detail.ivaPercent;
          if (detail.description) patch.description = detail.description;
          if (detail.longDescription) patch.longDescription = detail.longDescription;
          if (detail.imageUrls[0]) patch.imageUrl = detail.imageUrls[0];
          if (Object.keys(patch).length > 0) await onItem(code, patch);
        } catch (err) {
          failures++;
          if (failures <= 5) {
            this.logger.warn(`New Tree ficha ${code}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        await sleep(DETAIL_PAUSE_MS);
      }
    };
    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, worker));
    if (failures > 0) this.logger.warn(`New Tree: ${failures} fichas no se pudieron leer`);
  }
}
