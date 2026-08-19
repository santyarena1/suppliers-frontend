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
  rubro?: string;
  grupo?: string;
  garantia?: string;
  ros?: AirBranchStock;
  mza?: AirBranchStock;
  cba?: AirBranchStock;
  lug?: AirBranchStock;
  air?: AirBranchStock;
}

@Injectable()
export class AirAdapter implements ProviderAdapter {
  readonly provider = "AIR" as const;

  async syncAll(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>
  ): Promise<void> {
    const { user, pass } = credentials;
    if (!user || !pass) throw new BadGatewayException("Credenciales de Air incompletas");

    const login = await axios.get<{ token: string }>(BASE_URL, {
      params: { user, pass },
      timeout: 15_000,
    });
    const token = login.data.token;
    if (!token) throw new BadGatewayException("Air no devolvió token de sesión");

    // La API no documenta paginación para /q=articulos: se trae el catálogo
    // completo en una sola respuesta.
    const { data } = await axios.post<AirProduct[]>(
      BASE_URL,
      { rubro: "", grupo: "", categoria: "", estado: "", texto: "", orden: "DA", stock: "T", precio_final: false },
      {
        params: { q: "articulos" },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 60_000,
      }
    );

    await onPage((data ?? []).map(mapProduct));
  }
}

function mapProduct(p: AirProduct): NormalizedProduct {
  const branches = [p.ros, p.mza, p.cba, p.lug, p.air].filter((b): b is AirBranchStock => Boolean(b));
  const totalStock = branches.reduce((sum, b) => sum + (b.disponible || 0), 0);
  const mainBranch = branches.find((b) => b.disponible > 0) ?? branches[0];

  return {
    externalId: p.codigo,
    partNumber: p.part_number || undefined,
    name: p.descrip,
    category: p.rubro,
    subcategory: p.grupo,
    price: p.precio,
    currency: p.moneda === "DOL" ? "USD" : p.moneda,
    stock: totalStock,
    locationAir: mainBranch?.name,
    raw: p,
  };
}
