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
  GARANTIA?: string;
  MONEDA: string;
  PRECIO: string;
  "PRECIO FINAL"?: string;
  ATRIBUTOS?: string;
  CATEGORIA_USUARIO?: string;
  DETALLE_USUARIO?: string;
  PESO?: string;
  ALTO?: string;
  ANCHO?: string;
  LARGO?: string;
  MARCA?: string;
}

/**
 * Mapeo manual columna-a-columna del CSV de NewBytes hacia nuestro esquema
 * unificado. Editar acá si NB cambia una columna del CSV.
 */
const FIELD_MAP: { [K in keyof NormalizedProduct]?: (r: NbRow) => NormalizedProduct[K] } = {
  externalId: (r) => r.CODIGO as never,
  partNumber: (r) => (r["ID FABRICANTE"] || undefined) as never,
  name: (r) => (r.DETALLE_USUARIO || r.DETALLE) as never,
  brand: (r) => (r.MARCA || undefined) as never,
  category: (r) => (r.CATEGORIA_USUARIO || r.CATEGORIA) as never,
  // ATRIBUTOS trae la ficha técnica en texto libre, es más "descripción larga"
  // que un listado de tags.
  longDescription: (r) => (r.ATRIBUTOS || undefined) as never,
  price: (r) => (r.PRECIO ? Number(r.PRECIO) : undefined) as never,
  finalPrice: (r) => (r["PRECIO FINAL"] ? Number(r["PRECIO FINAL"]) : undefined) as never,
  currency: (r) => (r.MONEDA === "U$S" ? "USD" : "ARS") as never,
  ivaPercent: (r) => (r.IVA ? Number(r.IVA.replace("%", "").trim()) : undefined) as never,
  stock: (r) => (r.STOCK ? Number(r.STOCK) : undefined) as never,
  imageUrl: (r) => (r.IMAGEN || undefined) as never,
  warranty: (r) => (r.GARANTIA || undefined) as never,
  weight: (r) => (r.PESO ? Number(r.PESO) : undefined) as never,
  height: (r) => (r.ALTO ? Number(r.ALTO) : undefined) as never,
  width: (r) => (r.ANCHO ? Number(r.ANCHO) : undefined) as never,
  length: (r) => (r.LARGO ? Number(r.LARGO) : undefined) as never,
  // NB no aclara la unidad de peso/dimensiones en el CSV — se deja
  // weightUnit/dimensionsUnit sin asumir en vez de inventarla.
  // Sin equivalente en NB: description (corta separada), stockStatus,
  // productUrl, ean, subcategory, volume.
};

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
      await onPage(rows.slice(i, i + BATCH).map((r) => mapProduct(r)));
    }
  }
}

function mapProduct(r: NbRow): NormalizedProduct {
  const out: Partial<NormalizedProduct> = {};
  for (const [field, getter] of Object.entries(FIELD_MAP)) {
    (out as Record<string, unknown>)[field] = (getter as (r: NbRow) => unknown)(r);
  }
  return { ...out, raw: r } as NormalizedProduct;
}
