import { Injectable, BadGatewayException } from "@nestjs/common";
import axios from "axios";
import type { NormalizedProduct, ProviderAdapter } from "../types";

const BASE_URL = "https://api.air-intra.com/v2/";

interface AirBranchStock {
  name: string;
  fisico: number;
  disponible: number;
  entrante: number;
}

interface AirProduct {
  codigo: string;
  descrip: string;
  part_number?: string;
  precio: number;
  moneda: string;
  impuesto_iva?: { alicuota: number };
  estado?: { id: string; name: string };
  rubro?: string;
  grupo?: string;
  grupo_name?: string;
  garantia?: string;
  ean?: string;
  upc?: string;
  ros?: AirBranchStock;
  mza?: AirBranchStock;
  cba?: AirBranchStock;
  lug?: AirBranchStock;
  air?: AirBranchStock;
}

/**
 * Mapeo manual campo-a-campo de Air Computers hacia nuestro esquema
 * unificado. Editar acá si Air cambia un nombre de campo.
 *
 * IMPORTANTE: `/q=articulos` no trae imagen ni descripción larga — esas
 * viven en un endpoint separado (`/q=get_meta&codiart=...`) que hoy no
 * llamamos (habría que pedirlo producto por producto). Por eso quedan
 * undefined acá, no es un bug de mapeo.
 */
const FIELD_MAP: { [K in keyof NormalizedProduct]?: (p: AirProduct) => NormalizedProduct[K] } = {
  externalId: (p) => p.codigo as never,
  partNumber: (p) => (p.part_number || undefined) as never,
  ean: (p) => (p.ean || p.upc || undefined) as never,
  name: (p) => p.descrip as never,
  category: (p) => p.rubro as never,
  subcategory: (p) => (p.grupo_name || p.grupo) as never,
  price: (p) => p.precio as never,
  currency: (p) => (p.moneda === "DOL" ? "USD" : p.moneda) as never,
  ivaPercent: (p) => p.impuesto_iva?.alicuota as never,
  stockStatus: (p) => p.estado?.name as never,
  warranty: (p) => p.garantia as never,
  stock: (p) => sumStock(p) as never,
  locationAir: (p) => mainBranch(p)?.name as never,
  // Sin equivalente en /q=articulos: imageUrl, description, longDescription,
  // finalPrice, weight/dimensiones, tags — necesitan /q=get_meta aparte.
};

@Injectable()
export class AirAdapter implements ProviderAdapter {
  readonly provider = "AIR" as const;

  async syncAll(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>
  ): Promise<void> {
    const { user, pass } = credentials;
    if (!user || !pass) throw new BadGatewayException("Credenciales de Air incompletas");

    let token: string | undefined;
    try {
      const login = await axios.get<{ token: string }>(BASE_URL, {
        params: { user, pass },
        timeout: 15_000,
      });
      token = login.data?.token;
    } catch (err) {
      const body = axios.isAxiosError(err) ? JSON.stringify(err.response?.data ?? err.message) : String(err);
      throw new BadGatewayException(`Air rechazó el login: ${body.slice(0, 300)}`);
    }
    if (!token) throw new BadGatewayException("Air no devolvió token de sesión");

    // La cuenta tiene un límite real de 1 consulta cada 5 minutos en
    // /q=articulos ("Too many queries detected" si se llama más seguido).
    // AcuStock usa un endpoint de catálogo masivo distinto que no tenemos
    // documentado; por ahora traemos todo en una sola llamada grande.
    const { data } = await axios.post<AirProduct[] | Record<string, unknown>>(
      BASE_URL,
      {
        rubro: "", grupo: "", categoria: "", estado: "", texto: "",
        orden: "DA", stock: "T", precio_final: false,
        pagina: 1, cantidad: 10000,
      },
      {
        params: { q: "articulos" },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 60_000,
      }
    );

    // Air a veces responde 200 con un objeto de error en vez de un array
    // (ej. rate limit) — mejor devolver ese mensaje real que reventar con
    // un TypeError genérico.
    if (!Array.isArray(data)) {
      throw new BadGatewayException(
        `Air no devolvió un catálogo válido: ${JSON.stringify(data).slice(0, 300)}`
      );
    }

    await onPage(data.map((p) => mapProduct(p)));
  }
}

function sumStock(p: AirProduct): number {
  return branches(p).reduce((sum, b) => sum + (b.disponible || 0), 0);
}

function mainBranch(p: AirProduct): AirBranchStock | undefined {
  const list = branches(p);
  return list.find((b) => b.disponible > 0) ?? list[0];
}

function branches(p: AirProduct): AirBranchStock[] {
  return [p.ros, p.mza, p.cba, p.lug, p.air].filter((b): b is AirBranchStock => Boolean(b));
}

function mapProduct(p: AirProduct): NormalizedProduct {
  const out: Partial<NormalizedProduct> = {};
  for (const [field, getter] of Object.entries(FIELD_MAP)) {
    (out as Record<string, unknown>)[field] = (getter as (p: AirProduct) => unknown)(p);
  }
  return { ...out, raw: p } as NormalizedProduct;
}
