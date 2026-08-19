import { Injectable, BadGatewayException } from "@nestjs/common";
import axios from "axios";
import type { NormalizedProduct, ProviderAdapter } from "../types";

const BASE_URL = "https://api.gruponucleosa.com";

interface GnImpuesto {
  imp_desc: string;
  imp_porcentaje: number;
}

interface GnProduct {
  item_id: number;
  codigo: string;
  ean?: string;
  partNumber?: string;
  item_desc_0: string;
  item_desc_1?: string;
  item_desc_2?: string;
  marca?: string;
  categoria?: string;
  subcategoria?: string;
  precioNeto_USD: number;
  impuestos?: GnImpuesto[];
  stock_mdp?: number;
  stock_caba?: number;
  url_imagenes?: { url: string }[];
  peso_gr?: number;
  alto_cm?: number;
  ancho_cm?: number;
  largo_cm?: number;
  volumen_cm3?: number;
}

/**
 * Mapeo manual campo-a-campo de Grupo Núcleo hacia nuestro esquema
 * unificado. Editar acá si Grupo Núcleo cambia un nombre de campo.
 */
const FIELD_MAP: { [K in keyof NormalizedProduct]?: (p: GnProduct) => NormalizedProduct[K] } = {
  externalId: (p) => String(p.item_id) as never,
  sku: (p) => p.codigo as never,
  partNumber: (p) => (p.partNumber || undefined) as never,
  ean: (p) => (p.ean || undefined) as never,
  name: (p) => p.item_desc_0 as never,
  brand: (p) => p.marca as never,
  category: (p) => p.categoria as never,
  subcategory: (p) => p.subcategoria as never,
  // item_desc_1 = descripción media, item_desc_2 = detallada.
  description: (p) => (p.item_desc_1 || undefined) as never,
  longDescription: (p) => (p.item_desc_2 || undefined) as never,
  price: (p) => p.precioNeto_USD as never,
  currency: () => "USD" as never,
  ivaPercent: (p) => p.impuestos?.[0]?.imp_porcentaje as never,
  stock: (p) => (p.stock_mdp ?? 0) + (p.stock_caba ?? 0) as never,
  imageUrl: (p) => p.url_imagenes?.[0]?.url as never,
  weight: (p) => p.peso_gr as never,
  weightUnit: (p) => (p.peso_gr != null ? "gr" : undefined) as never,
  height: (p) => p.alto_cm as never,
  width: (p) => p.ancho_cm as never,
  length: (p) => p.largo_cm as never,
  dimensionsUnit: (p) => (p.alto_cm != null ? "cm" : undefined) as never,
  volume: (p) => p.volumen_cm3 as never,
  // Sin equivalente en Grupo Núcleo: finalPrice, stockStatus, productUrl,
  // warranty, tags. El stock por depósito (mdp/caba) queda solo en `raw`,
  // acá se suma en un único número.
};

@Injectable()
export class GrupoNucleoAdapter implements ProviderAdapter {
  readonly provider = "GRUPO_NUCLEO" as const;

  async syncAll(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>
  ): Promise<void> {
    const { id, username, password } = credentials;
    if (!id || !username || !password) {
      throw new BadGatewayException("Credenciales de Grupo Núcleo incompletas");
    }

    const login = await axios.post<string>(
      `${BASE_URL}/Authentication/Login`,
      { id: Number(id), username, password },
      { timeout: 15_000 }
    );
    // El token viene como string plano (JWT), no envuelto en JSON.
    const token = typeof login.data === "string" ? login.data.trim().replace(/^"|"$/g, "") : "";
    if (!token) throw new BadGatewayException("Grupo Núcleo no devolvió token");

    // La API no documenta paginación: se trae el catálogo completo de una.
    const { data } = await axios.get<GnProduct[]>(`${BASE_URL}/API_V1/GetCatalog`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "*/*" },
      timeout: 60_000,
    });

    await onPage((data ?? []).map((p) => mapProduct(p)));
  }
}

function mapProduct(p: GnProduct): NormalizedProduct {
  const out: Partial<NormalizedProduct> = {};
  for (const [field, getter] of Object.entries(FIELD_MAP)) {
    (out as Record<string, unknown>)[field] = (getter as (p: GnProduct) => unknown)(p);
  }
  return { ...out, raw: p } as NormalizedProduct;
}
