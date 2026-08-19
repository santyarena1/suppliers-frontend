import { Injectable, BadGatewayException } from "@nestjs/common";
import axios from "axios";
import { parse } from "csv-parse/sync";
import type { NormalizedProduct, ProviderAdapter } from "../types";

const BASE_URL = "https://api.nb.com.ar/v1/priceListCsv";

interface NbRow {
  CODIGO: string;
  "ID FABRICANTE": string;
  CATEGORIA: string;
  DETALLE: string;
  IMAGEN: string;
  IVA: string;
  STOCK: string;
  MONEDA: string;
  PRECIO: string;
  CATEGORIA_USUARIO?: string;
  DETALLE_USUARIO?: string;
  MARCA?: string;
}

@Injectable()
export class NewBytesAdapter implements ProviderAdapter {
  readonly provider = "NEW_BYTES" as const;

  async syncAll(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>
  ): Promise<void> {
    const { token } = credentials;
    if (!token) throw new BadGatewayException("Falta el token de NewBytes");

    const { data } = await axios.get<string>(`${BASE_URL}/${token}`, {
      timeout: 60_000,
      responseType: "text",
    });

    if (typeof data !== "string" || data.trim().startsWith('"El Token')) {
      throw new BadGatewayException("Token de NewBytes inválido o expirado");
    }

    const rows: NbRow[] = parse(data, {
      columns: true,
      delimiter: ";",
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });

    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
      await onPage(rows.slice(i, i + BATCH).map(mapProduct));
    }
  }
}

function mapProduct(r: NbRow): NormalizedProduct {
  return {
    externalId: r.CODIGO,
    partNumber: r["ID FABRICANTE"] || undefined,
    name: r.DETALLE_USUARIO || r.DETALLE,
    brand: r.MARCA || undefined,
    category: r.CATEGORIA_USUARIO || r.CATEGORIA,
    price: r.PRECIO ? Number(r.PRECIO) : undefined,
    currency: r.MONEDA === "U$S" ? "USD" : "ARS",
    stock: r.STOCK ? Number(r.STOCK) : undefined,
    imageUrl: r.IMAGEN || undefined,
    raw: r,
  };
}
