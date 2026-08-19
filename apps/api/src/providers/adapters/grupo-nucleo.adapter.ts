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
}

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

    await onPage((data ?? []).map(mapProduct));
  }
}

function mapProduct(p: GnProduct): NormalizedProduct {
  return {
    externalId: String(p.item_id),
    sku: p.codigo,
    partNumber: p.partNumber || undefined,
    ean: p.ean || undefined,
    name: p.item_desc_0,
    brand: p.marca,
    category: p.categoria,
    subcategory: p.subcategoria,
    description: p.item_desc_2 || p.item_desc_1 || undefined,
    price: p.precioNeto_USD,
    currency: "USD",
    stock: (p.stock_mdp ?? 0) + (p.stock_caba ?? 0),
    imageUrl: p.url_imagenes?.[0]?.url,
    raw: p,
  };
}
