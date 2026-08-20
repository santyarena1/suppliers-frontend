import { Injectable, BadGatewayException } from "@nestjs/common";
import axios from "axios";
import * as XLSX from "xlsx";
import type { NormalizedProduct, ProviderAdapter } from "../types";

// La API JSON documentada (www.invidcomputers.com/api/v1, GET /articulo.php)
// tiene un límite real de 50 requests/hora, verificado en vivo — el
// catálogo completo (~5000 productos ÷ 100/página) consume esa cuota
// entera de una sola sincronización, sin margen para nada más. Invid
// también tiene una tienda web normal (mismo dominio, sesión de cliente
// logueado) con una opción "Descargar lista de precios" que exporta un
// .xlsx completo sin ese límite tan agresivo — mismo patrón que se
// encontró y confirmó funcionando para AIR. La usamos en vez de la API.
const PORTAL_LOGIN_URL = "https://www.invidcomputers.com/login.php";
const EXPORT_URL = "https://www.invidcomputers.com/genera_excel.php";

/**
 * Mapeo manual campo-a-campo del Excel del portal hacia nuestro esquema
 * unificado. Esta planilla no trae stock numérico para esta cuenta (el
 * mismo comportamiento que documenta la API JSON: "STOCK solo se incluye
 * cuando el usuario tiene permiso") — la columna "Observaciones" a veces
 * trae una nota cualitativa (ej. "Stock Bajo"), que se guarda como
 * stockStatus. No se inventa un número de stock que la fuente no da.
 */
const COLUMN_INDEX = {
  codigo: 0,
  producto: 1,
  fabricante: 2,
  nroDeParte: 3,
  ean: 4,
  moneda: 5,
  precioSinIva: 6,
  iva: 7,
  precioFinal: 9,
  observaciones: 11,
} as const;

@Injectable()
export class InvidAdapter implements ProviderAdapter {
  readonly provider = "INVID" as const;

  async syncAll(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>
  ): Promise<void> {
    const { username, password } = credentials;
    if (!username || !password) throw new BadGatewayException("Credenciales de Invid incompletas");

    // 1) Login al portal web de clientes (usuario = CUIT, distinto de la API JSON).
    let sessionCookie: string | undefined;
    try {
      const loginRes = await axios.post(
        PORTAL_LOGIN_URL,
        new URLSearchParams({ login: "S", usuari: username, passwd: password, volver: "" }).toString(),
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
      throw new BadGatewayException(`No se pudo iniciar sesión en el portal de Invid: ${body.slice(0, 300)}`);
    }
    if (!sessionCookie) throw new BadGatewayException("Invid no devolvió cookie de sesión — ¿usuario/clave incorrectos?");

    // 2) Descargar la lista de precios completa (.xlsx) con esa sesión.
    let buffer: Buffer;
    try {
      const res = await axios.get<ArrayBuffer>(EXPORT_URL, {
        headers: { Cookie: sessionCookie },
        timeout: 60_000,
        responseType: "arraybuffer",
      });
      buffer = Buffer.from(res.data);
    } catch (err) {
      const body = axios.isAxiosError(err) ? String(err.message) : String(err);
      throw new BadGatewayException(`Invid no devolvió la lista de precios: ${body.slice(0, 300)}`);
    }

    let rows: unknown[][];
    try {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    } catch (err) {
      throw new BadGatewayException(
        `No se pudo leer el Excel de Invid: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // El archivo trae unas filas de encabezado/membrete antes de la tabla real
    // — buscamos la fila cuyo primer valor sea literalmente "Codigo".
    const headerIdx = rows.findIndex((r) => String(r?.[0] ?? "").trim() === "Codigo");
    if (headerIdx === -1) throw new BadGatewayException("Invid: no se encontró la tabla de productos en el Excel");

    const items: NormalizedProduct[] = [];
    for (const row of rows.slice(headerIdx + 1)) {
      const codigo = row?.[COLUMN_INDEX.codigo];
      const producto = row?.[COLUMN_INDEX.producto];
      if (!codigo || !producto) continue; // fila vacía / divisoria de sección, no un producto
      items.push(mapProduct(row));
    }
    if (items.length === 0) throw new BadGatewayException("Invid devolvió un catálogo vacío");

    await onPage(items);
  }
}

function mapProduct(row: unknown[]): NormalizedProduct {
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const str = (v: unknown): string | undefined => {
    const s = String(v ?? "").trim();
    return s.length > 0 ? s : undefined;
  };

  return {
    externalId: String(row[COLUMN_INDEX.codigo]).trim(),
    name: String(row[COLUMN_INDEX.producto]).trim(),
    brand: str(row[COLUMN_INDEX.fabricante]),
    partNumber: str(row[COLUMN_INDEX.nroDeParte]),
    ean: str(row[COLUMN_INDEX.ean]),
    currency: str(row[COLUMN_INDEX.moneda])?.includes("US$") ? "USD" : str(row[COLUMN_INDEX.moneda]),
    price: num(row[COLUMN_INDEX.precioSinIva]),
    ivaPercent: num(row[COLUMN_INDEX.iva]),
    finalPrice: num(row[COLUMN_INDEX.precioFinal]),
    stockStatus: str(row[COLUMN_INDEX.observaciones]),
    raw: row,
  } as NormalizedProduct;
}
