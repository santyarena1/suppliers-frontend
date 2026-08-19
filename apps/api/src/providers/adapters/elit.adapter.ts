import { Injectable, BadGatewayException } from "@nestjs/common";
import axios from "axios";
import type { NormalizedProduct, ProviderAdapter } from "../types";

const BASE_URL = "https://clientes.elit.com.ar/v1/api/productos";
const PAGE_LIMIT = 40;

interface ElitProduct {
  id: number;
  codigo_alfa: string;
  codigo_producto: string;
  nombre: string;
  categoria: string;
  sub_categoria: string;
  marca: string;
  precio: number;
  moneda: number;
  ean: number;
  stock_total: number;
  imagenes: string[];
  descripcion: string;
}

interface ElitResponse {
  codigo: number;
  paginador: { total: number; limit: number; offset: number };
  resultado: ElitProduct[];
}

@Injectable()
export class ElitAdapter implements ProviderAdapter {
  readonly provider = "ELIT" as const;

  async syncAll(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>
  ): Promise<void> {
    const { user_id, token } = credentials;
    if (!user_id || !token) throw new BadGatewayException("Credenciales de ELIT incompletas");

    // La API de ELIT usa offset 1-indexado: offset=0 devuelve 400
    // ("offset must be greater than or equal to 1"), confirmado en vivo.
    let offset = 1;
    let total = Infinity;

    while (offset < total) {
      // La paginación de ELIT va por query string (?offset=N), no por body:
      // el body solo maneja auth, "offset" ahí se ignora silenciosamente.
      let data: ElitResponse;
      try {
        const res = await axios.post<ElitResponse>(
          `${BASE_URL}?offset=${offset}`,
          { user_id, token },
          { timeout: 30_000 }
        );
        data = res.data;
      } catch (err) {
        throw new BadGatewayException(
          `ELIT falló en offset=${offset}: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      total = data.paginador?.total ?? 0;
      const items = (data.resultado ?? []).map(mapProduct);
      await onPage(items);

      offset += data.paginador?.limit ?? PAGE_LIMIT;
      if (!data.resultado?.length) break;
    }
  }
}

function mapProduct(p: ElitProduct): NormalizedProduct {
  return {
    externalId: String(p.id),
    sku: p.codigo_producto,
    partNumber: p.codigo_alfa,
    ean: p.ean ? String(p.ean) : undefined,
    name: p.nombre,
    brand: p.marca,
    category: p.categoria,
    subcategory: p.sub_categoria,
    description: p.descripcion || undefined,
    price: p.precio,
    currency: p.moneda === 2 ? "USD" : "ARS",
    stock: p.stock_total,
    imageUrl: p.imagenes?.[0],
    raw: p,
  };
}
