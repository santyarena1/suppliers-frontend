import { BadGatewayException, Injectable } from "@nestjs/common";
import axios from "axios";
import type { NormalizedProduct, ProviderAdapter } from "../types";

/**
 * Diapstore corre sobre Simple Gestion (api.cumar.com.ar).
 * Account id y slug salen del config.js público de diapstore.com.
 */
const API = "https://api.cumar.com.ar";
const DEFAULT_ACCOUNT_ID = "bed2df35-717f-4900-a4b1-7c3a7fb59b7c";
const PAGE_SIZE = 50;

export interface DiapstoreProduct {
  id: string;
  sku?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  unit_price?: number | null;
  currency?: string | null;
  tax_rate?: number | null;
  stock_quantity?: number | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  status?: string | null;
}

interface DiapstoreList {
  success?: boolean;
  message?: string;
  data?: DiapstoreProduct[];
  pagination?: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
    has_next: boolean;
  };
}

export function mapDiapstoreProduct(p: DiapstoreProduct): NormalizedProduct {
  const price = typeof p.unit_price === "number" ? p.unit_price : undefined;
  const tax = typeof p.tax_rate === "number" ? p.tax_rate : undefined;
  const stock = typeof p.stock_quantity === "number" ? p.stock_quantity : undefined;
  return {
    externalId: p.id,
    sku: p.sku || undefined,
    name: p.name,
    description: p.description || undefined,
    category: p.category || undefined,
    subcategory: p.subcategory || undefined,
    price,
    currency: p.currency || undefined,
    ivaPercent: tax,
    stock,
    imageUrl: p.image_url || p.thumbnail_url || undefined,
    raw: p,
  };
}

@Injectable()
export class DiapstoreAdapter implements ProviderAdapter {
  readonly provider = "DIAPSTORE" as const;
  readonly publicCatalog = true;

  async syncAll(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>
  ): Promise<void> {
    const accountId = (credentials.account_id || credentials.accountId || DEFAULT_ACCOUNT_ID).trim();
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      let body: DiapstoreList;
      try {
        const res = await axios.get<DiapstoreList>(`${API}/api/accounts/${accountId}/products/public`, {
          params: { page, per_page: PAGE_SIZE },
          timeout: 30_000,
          headers: { Accept: "application/json", "User-Agent": "nodo-sync" },
        });
        body = res.data;
      } catch (err) {
        throw new BadGatewayException(
          `Diapstore falló en page=${page}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      if (body.success === false) {
        throw new BadGatewayException(body.message || `Diapstore rechazó page=${page}`);
      }
      totalPages = body.pagination?.total_pages ?? 1;
      const mapped = (body.data ?? []).map(mapDiapstoreProduct).filter((p) => p.name);
      if (mapped.length) await onPage(mapped);
      if (!body.pagination?.has_next) break;
      page += 1;
    }
  }
}
