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
  garantia?: string;
  iva?: number;
  peso?: number;
  dimensiones?: { largo?: number; ancho?: number; alto?: number };
  nivel_stock?: string;
  link?: string;
  atributos?: { atributo: string; valor: string }[];
}

interface ElitResponse {
  codigo: number;
  paginador: { total: number; limit: number; offset: number };
  resultado: ElitProduct[];
}

/**
 * Mapeo manual campo-a-campo de ELIT hacia nuestro esquema unificado.
 * Editar acá si ELIT cambia un nombre de campo o si queremos capturar algo
 * más de lo que hoy está en `raw`.
 */
const FIELD_MAP: { [K in keyof NormalizedProduct]?: (p: ElitProduct) => NormalizedProduct[K] } = {
  externalId: (p) => String(p.id) as never,
  sku: (p) => p.codigo_producto as never,
  partNumber: (p) => p.codigo_alfa as never,
  ean: (p) => (p.ean ? String(p.ean) : undefined) as never,
  name: (p) => p.nombre as never,
  brand: (p) => p.marca as never,
  category: (p) => p.categoria as never,
  subcategory: (p) => p.sub_categoria as never,
  description: (p) => (p.descripcion || undefined) as never,
  price: (p) => p.precio as never,
  currency: (p) => (p.moneda === 2 ? "USD" : "ARS") as never,
  stock: (p) => p.stock_total as never,
  stockStatus: (p) => p.nivel_stock as never,
  imageUrl: (p) => p.imagenes?.[0] as never,
  productUrl: (p) => p.link as never,
  warranty: (p) => p.garantia as never,
  ivaPercent: (p) => p.iva as never,
  weight: (p) => p.peso as never,
  height: (p) => p.dimensiones?.alto as never,
  width: (p) => p.dimensiones?.ancho as never,
  length: (p) => p.dimensiones?.largo as never,
  // ELIT no especifica unidad; "peso"/"dimensiones" son consistentes con Kg/Cm
  // en el resto del catálogo argentino, pero no está confirmado por la API —
  // se deja sin asumir en vez de inventar la unidad.
  tags: (p) => (p.atributos?.length ? p.atributos.map((a) => `${a.atributo}: ${a.valor}`).join(" · ") : undefined) as never,
  // Sin equivalente en ELIT (queda undefined para este proveedor):
  // longDescription, finalPrice, weightUnit, dimensionsUnit, volume, locationAir.
};

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
      const items = (data.resultado ?? []).map((p) => mapProduct(p));
      await onPage(items);

      offset += data.paginador?.limit ?? PAGE_LIMIT;
      if (!data.resultado?.length) break;
    }
  }
}

function mapProduct(p: ElitProduct): NormalizedProduct {
  const out: Partial<NormalizedProduct> = {};
  for (const [field, getter] of Object.entries(FIELD_MAP)) {
    (out as Record<string, unknown>)[field] = (getter as (p: ElitProduct) => unknown)(p);
  }
  return { ...out, raw: p } as NormalizedProduct;
}
