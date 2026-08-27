import { Injectable, BadGatewayException } from "@nestjs/common";
import axios from "axios";
import type { NormalizedProduct, ProviderAdapter } from "../types";

// La API JSON documentada (api.air-intra.com/v2, ?q=articulos) tiene un
// límite real de 1 request cada 5 minutos, verificado en vivo — inviable
// para sincronizar un catálogo de miles de productos. AIR SRL también tiene
// un portal web separado (www.air-intra.com) con una opción de exportar el
// catálogo a CSV que NO tiene ese límite tan agresivo (confirmado en vivo:
// varios requests seguidos funcionaron sin bloquearse). Usamos ese portal.
const PORTAL_URL = "https://www.air-intra.com/2025/ar/";
const EXPORT_URL = "https://www.air-intra.com/2025/consultas/descargas.php";

interface AirCsvRow {
  Codigo: string;
  Descripcion: string;
  lista5: string;
  Tipo: string;
  IVA: string;
  ROS: string;
  MZA: string;
  CBA: string;
  LUG: string;
  Grupo: string;
  Rubro: string;
  "Part Number": string;
}

/**
 * Mapeo manual campo-a-campo del CSV del portal de Air hacia nuestro
 * esquema unificado. Este CSV es más chico que la API JSON (no trae ean,
 * garantía, imagen, descripción larga) — lo que no está, queda undefined,
 * no se inventa. Grupo/Rubro son códigos numéricos del proveedor, no
 * nombres legibles (mismo criterio que ya usaba el adapter anterior con
 * estos mismos campos vía la API JSON).
 */
const FIELD_MAP: { [K in keyof NormalizedProduct]?: (r: AirCsvRow) => NormalizedProduct[K] } = {
  externalId: (r) => r.Codigo?.trim() as never,
  partNumber: (r) => (r["Part Number"]?.trim() || undefined) as never,
  name: (r) => r.Descripcion?.trim() as never,
  price: (r) => (r.lista5 ? Number(r.lista5) : undefined) as never,
  currency: () => "USD" as never,
  ivaPercent: (r) => (r.IVA ? Number(r.IVA) : undefined) as never,
  category: (r) => (r.Rubro?.trim() || undefined) as never,
  subcategory: (r) => (r.Grupo?.trim() || undefined) as never,
  stock: (r) => sumStock(r) as never,
};

@Injectable()
export class AirAdapter implements ProviderAdapter {
  readonly provider = "AIR" as const;
  /** La exportación usa stock:"F" (con stock físico): los agotados no vienen. */
  readonly omitsUnavailableProducts = true;

  async syncAll(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>
  ): Promise<void> {
    const { user, pass } = credentials;
    if (!user || !pass) throw new BadGatewayException("Credenciales de Air incompletas");

    // 1) Login al portal web (distinto de la API JSON) — form clásico que
    // devuelve una cookie de sesión PHP.
    let sessionCookie: string | undefined;
    try {
      const loginRes = await axios.post(
        PORTAL_URL,
        new URLSearchParams({ urbid: user, urbpass: pass, p: "", from: "" }).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 20_000,
          maxRedirects: 0,
          validateStatus: (s) => s < 400 || s === 302,
        }
      );
      const setCookie = loginRes.headers["set-cookie"];
      sessionCookie = setCookie?.map((c: string) => c.split(";")[0]).join("; ");
    } catch (err) {
      const body = axios.isAxiosError(err) ? String(err.message) : String(err);
      throw new BadGatewayException(`No se pudo iniciar sesión en el portal de Air: ${body.slice(0, 300)}`);
    }
    if (!sessionCookie) throw new BadGatewayException("Air no devolvió cookie de sesión — ¿usuario/clave incorrectos?");

    // 2) Descargar el catálogo completo en CSV con esa sesión.
    // stock:"F" y limit:3000 son los valores confirmados en vivo — con
    // limit:3000 devolvió el catálogo completo real (3081 productos, o sea
    // el límite no lo trunca). limit:99999 devolvió 404 (probablemente lo
    // rechaza por absurdo), así que no lo usamos. No probamos otros valores
    // de "stock" (ej. "T" para "todos") para no arriesgar una query que no
    // sabemos si existe — si hace falta traer también sin stock físico, hay
    // que confirmar ese valor real primero.
    const query = {
      grupo: 0, rubro: "", estado: "", texto: "", orden: "DA",
      stock: "F", codiart: "", canasto: 0, favoritos: "0", limit: 3000,
    };
    let csvText: string;
    try {
      const res = await axios.get<string>(EXPORT_URL, {
        params: { type: "csv", q: JSON.stringify(query) },
        headers: { Cookie: sessionCookie },
        timeout: 60_000,
        responseType: "text",
      });
      csvText = res.data;
    } catch (err) {
      const body = axios.isAxiosError(err) ? String(err.message) : String(err);
      throw new BadGatewayException(`Air no devolvió el catálogo CSV: ${body.slice(0, 300)}`);
    }

    const rows = parseAirCsv(csvText);
    if (rows.length === 0) throw new BadGatewayException("Air devolvió un catálogo CSV vacío");

    await onPage(rows.map((r) => mapProduct(r)));
  }
}

const AIR_CSV_COLUMNS = ["Codigo", "Descripcion", "lista5", "Tipo", "IVA", "ROS", "MZA", "CBA", "LUG", "Grupo", "Rubro", "Part Number"];

/**
 * El CSV de Air no es RFC4180 estricto: las descripciones a veces traen
 * comillas sueltas sin escapar (ej. medidas en pulgadas: `19"`), lo que
 * rompe cualquier parser estricto — confirmado en vivo (una sola fila así
 * corrompe el parseo del resto del archivo con csv-parse). Como el formato
 * es consistente (todos los campos van entre comillas, separados por
 * `,` exactamente), separamos cada línea por el literal `","` en vez de
 * interpretar comillas como delimitador real. Esto funciona salvo que un
 * campo contenga la secuencia exacta `","`, algo que no aparece en la
 * práctica en códigos/descripciones/precios de este proveedor.
 */
function parseAirCsv(csvText: string): AirCsvRow[] {
  const lines = csvText.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: AirCsvRow[] = [];
  // primera línea es el encabezado — no la usamos, los nombres de columna están fijos arriba.
  for (const line of lines.slice(1)) {
    const trimmed = line.trim().replace(/^"/, "").replace(/"$/, "");
    const fields = trimmed.split('","');
    if (fields.length < AIR_CSV_COLUMNS.length) continue; // fila realmente corrupta, se saltea
    const row: Record<string, string> = {};
    AIR_CSV_COLUMNS.forEach((col, i) => {
      row[col] = (fields[i] ?? "").trim();
    });
    rows.push(row as unknown as AirCsvRow);
  }
  return rows;
}

function sumStock(r: AirCsvRow): number {
  return [r.ROS, r.MZA, r.CBA, r.LUG].reduce((sum, v) => sum + (Number(v) || 0), 0);
}

function mapProduct(r: AirCsvRow): NormalizedProduct {
  const out: Partial<NormalizedProduct> = {};
  for (const [field, getter] of Object.entries(FIELD_MAP)) {
    (out as Record<string, unknown>)[field] = (getter as (r: AirCsvRow) => unknown)(r);
  }
  return { ...out, raw: r } as NormalizedProduct;
}
