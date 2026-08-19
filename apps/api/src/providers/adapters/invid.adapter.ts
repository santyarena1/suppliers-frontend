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
  IMAGE_URL?: string;
  CATEGORY?: string;
  CATEGORY_ID?: string;
}

interface InvidListResponse {
  status: number;
  data: InvidArticulo[];
  next_page_url?: string | null;
}

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
      const { data } = await axios.get<InvidListResponse>(`${BASE_URL}/articulo.php`, {
        params: { offset, exclude_zero_price: 1 },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30_000,
      });

      const list = Array.isArray(data.data) ? data.data : data.data ? [data.data] : [];
      await onPage(list.map(mapProduct));

      hasMore = Boolean(data.next_page_url) && list.length > 0;
      offset += 100;
    }
  }
}

function mapProduct(p: InvidArticulo): NormalizedProduct {
  return {
    externalId: p.ID,
    partNumber: p.PART_NUMBER || undefined,
    ean: p.EAN || undefined,
    name: p.TITLE,
    brand: p.BRAND || undefined,
    category: p.CATEGORY || undefined,
    description: p.DESCRIPTION || p.LONG_DESCRIPTION || undefined,
    price: p.PRICE ? Number(p.PRICE) : undefined,
    currency: p.CURRENCY,
    stock: p.STOCK,
    imageUrl: p.IMAGE_URL || undefined,
    raw: p,
  };
}
