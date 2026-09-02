import { Injectable, BadGatewayException, Logger } from "@nestjs/common";
import axios from "axios";
import type { NormalizedProduct, ProviderAdapter } from "../types";
import { asRecord, asString } from "../json-value";

// La API JSON documentada (api.air-intra.com/v2, ?q=articulos) tiene un
// límite real de 1 request cada 5 minutos, verificado en vivo — inviable
// para sincronizar un catálogo de miles de productos. AIR SRL también tiene
// un portal web separado (www.air-intra.com) con una opción de exportar el
// catálogo a CSV que NO tiene ese límite tan agresivo (confirmado en vivo:
// varios requests seguidos funcionaron sin bloquearse). Usamos ese portal.
const PORTAL_URL = "https://www.air-intra.com/2025/ar/";
const EXPORT_URL = "https://www.air-intra.com/2025/consultas/descargas.php";
// Los mismos JSON que carga el portal logueado (`ar/index.js` → get_json_rubros
// / get_json_grupos). Rubro = categoría, Grupo = marca. El CSV solo trae ids.
const RUBROS_URL = "https://www.air-intra.com/2025/cache/rubros.txt";
const GRUPOS_URL = "https://www.air-intra.com/2025/cache/grupos.txt";

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
 * no se inventa. Rubro/Grupo del CSV son ids: el nombre sale de
 * cache/rubros.txt y cache/grupos.txt. Sin match, category/brand quedan
 * vacíos (no se guarda el número para que no ensucie el menú).
 */
const FIELD_MAP: { [K in keyof NormalizedProduct]?: (r: AirCsvRow) => NormalizedProduct[K] } = {
  externalId: (r) => r.Codigo?.trim() as never,
  partNumber: (r) => (r["Part Number"]?.trim() || undefined) as never,
  name: (r) => r.Descripcion?.trim() as never,
  price: (r) => (r.lista5 ? Number(r.lista5) : undefined) as never,
  currency: () => "USD" as never,
  ivaPercent: (r) => (r.IVA ? Number(r.IVA) : undefined) as never,
  stock: (r) => sumStock(r) as never,
};

@Injectable()
export class AirAdapter implements ProviderAdapter {
  readonly provider = "AIR" as const;
  private readonly logger = new Logger(AirAdapter.name);

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

    // 2) Descargar el catálogo CSV y, en paralelo, los diccionarios de
    // rubros (categorías) y grupos (marcas) que el portal usa para los filtros.
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
    let rubros: Map<string, string>;
    let grupos: Map<string, string>;
    try {
      const [csvRes, rubroMap, grupoMap] = await Promise.all([
        axios.get<string>(EXPORT_URL, {
          params: { type: "csv", q: JSON.stringify(query) },
          headers: { Cookie: sessionCookie },
          timeout: 60_000,
          responseType: "text",
        }),
        fetchAirTermMap(RUBROS_URL, sessionCookie),
        fetchAirTermMap(GRUPOS_URL, sessionCookie),
      ]);
      csvText = csvRes.data;
      rubros = rubroMap;
      grupos = grupoMap;
    } catch (err) {
      const body = axios.isAxiosError(err) ? String(err.message) : String(err);
      throw new BadGatewayException(`Air no devolvió el catálogo CSV: ${body.slice(0, 300)}`);
    }

    if (rubros.size === 0 || grupos.size === 0) {
      this.logger.warn(`Air cache de rubros/grupos incompleto (rubros=${rubros.size}, grupos=${grupos.size})`);
    }

    const rows = parseAirCsv(csvText);
    if (rows.length === 0) throw new BadGatewayException("Air devolvió un catálogo CSV vacío");

    await onPage(rows.map((r) => mapAirProduct(r, rubros, grupos)));
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
export function parseAirCsv(csvText: string): AirCsvRow[] {
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

/** Diccionario id → nombre de `cache/rubros.txt` / `cache/grupos.txt`. */
export function parseAirTermMap(data: unknown): Map<string, string> {
  const list = Array.isArray(data) ? data : [];
  const map = new Map<string, string>();
  for (const item of list) {
    const rec = asRecord(item);
    if (!rec) continue;
    const name = asString(rec.name);
    if (!name || /^todos los /i.test(name)) continue;
    const rawId = rec.id;
    if (rawId == null || rawId === "" || rawId === 0 || rawId === "0") continue;
    const key = String(rawId).trim();
    if (!key) continue;
    map.set(key, name);
    if (/^\d+$/.test(key)) map.set(String(Number(key)), name);
    if (key.includes("-")) map.set(key.replace(/-/g, ""), name);
  }
  return map;
}

/** Resuelve un id de Rubro/Grupo al nombre. Sin match → undefined, no se usa el código. */
export function resolveAirTerm(map: Map<string, string>, raw?: string): string | undefined {
  const key = raw?.trim();
  if (!key || key === "0") return undefined;
  return map.get(key)
    ?? (/^\d+$/.test(key) ? map.get(String(Number(key))) : undefined)
    ?? (key.includes("-") ? map.get(key.replace(/-/g, "")) : undefined);
}

export function mapAirProduct(
  r: AirCsvRow,
  rubros: Map<string, string> = new Map(),
  grupos: Map<string, string> = new Map(),
): NormalizedProduct {
  const out: Partial<NormalizedProduct> = {};
  for (const [field, getter] of Object.entries(FIELD_MAP)) {
    (out as Record<string, unknown>)[field] = (getter as (r: AirCsvRow) => unknown)(r);
  }
  out.category = resolveAirTerm(rubros, r.Rubro);
  out.brand = resolveAirTerm(grupos, r.Grupo);
  return { ...out, raw: r } as NormalizedProduct;
}

async function fetchAirTermMap(url: string, cookie: string): Promise<Map<string, string>> {
  try {
    const res = await axios.get<unknown>(url, {
      headers: { Cookie: cookie, Accept: "application/json, text/plain, */*" },
      timeout: 20_000,
    });
    const parsed: unknown = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    return parseAirTermMap(parsed);
  } catch {
    return new Map();
  }
}
