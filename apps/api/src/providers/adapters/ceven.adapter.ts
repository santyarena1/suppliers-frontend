import { BadGatewayException, Injectable } from "@nestjs/common";
import axios from "axios";
import type { NormalizedProduct, ProviderAdapter } from "../types";

/** SuiteCommerce de ceven.com, confirmado en vivo (c=5032996, n=2, fieldset=search). */
const ITEMS_URL = "https://www.ceven.com/api/cacheable/items";
const PAGE_LIMIT = 100;
const SITE = { c: "5032996", n: "2", country: "AR", currency: "ARS", language: "es", fieldset: "search" };

export interface CevenItem {
  internalid: number;
  itemid?: string;
  displayname?: string;
  storedisplayname2?: string;
  storedescription?: string;
  custitem_marca?: string;
  onlinecustomerprice?: number;
  quantityavailable?: number;
  isinstock?: boolean;
  outofstockmessage?: string;
  urlcomponent?: string;
  itemimages_detail?: { urls?: { url?: string }[] };
}

interface CevenResponse {
  total?: number;
  items?: CevenItem[];
  code?: number;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function mapCevenItem(p: CevenItem): NormalizedProduct {
  const name = (p.storedisplayname2 || p.displayname || "").trim();
  const price = typeof p.onlinecustomerprice === "number" ? p.onlinecustomerprice : undefined;
  const stock = typeof p.quantityavailable === "number" ? p.quantityavailable : undefined;
  const imageUrl = p.itemimages_detail?.urls?.[0]?.url;
  const extra = p as CevenItem & Record<string, unknown>;
  const ivaRaw = extra.taxrate ?? extra.taxRate ?? extra.custitem_iva ?? extra.custitem_alicuota_iva;
  const ivaPercent = typeof ivaRaw === "number" && Number.isFinite(ivaRaw) ? ivaRaw : undefined;
  return {
    externalId: String(p.internalid),
    sku: p.itemid || undefined,
    name,
    brand: p.custitem_marca || undefined,
    description: p.storedescription ? stripHtml(p.storedescription) : undefined,
    price,
    currency: price != null ? "ARS" : undefined,
    ivaPercent,
    stock,
    stockStatus: p.isinstock === false ? (p.outofstockmessage || "Sin stock") : undefined,
    imageUrl,
    productUrl: p.urlcomponent ? `https://www.ceven.com/${p.urlcomponent}` : undefined,
    raw: p,
  };
}

@Injectable()
export class CevenAdapter implements ProviderAdapter {
  readonly provider = "CEVEN" as const;
  readonly publicCatalog = true;

  async syncAll(
    _credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>
  ): Promise<void> {
    let offset = 0;
    let total = Infinity;
    while (offset < total) {
      let data: CevenResponse;
      try {
        const res = await axios.get<CevenResponse>(ITEMS_URL, {
          params: { ...SITE, limit: PAGE_LIMIT, offset },
          timeout: 30_000,
          headers: { Accept: "application/json", "User-Agent": "nodo-sync" },
        });
        data = res.data;
      } catch (err) {
        throw new BadGatewayException(
          `Ceven falló en offset=${offset}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      if (data.code && data.code >= 400) {
        throw new BadGatewayException(`Ceven → ${data.code} en offset=${offset}`);
      }
      total = data.total ?? 0;
      const mapped = (data.items ?? []).map(mapCevenItem).filter((p) => p.name);
      if (mapped.length) await onPage(mapped);
      if (!(data.items ?? []).length) break;
      offset += data.items!.length;
    }
  }
}
