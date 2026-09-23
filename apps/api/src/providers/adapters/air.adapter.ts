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
  price: (r) => parseAirPrice(r.lista5) as never,
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
    const user = (credentials.user || credentials.username || "").trim();
    const pass = (credentials.pass || credentials.password || "").trim();
    if (!user || !pass) throw new BadGatewayException("Credenciales de Air incompletas");

    // 1) Login al portal web (distinto de la API JSON) — form clásico que
    // devuelve una cookie de sesión PHP. Una cookie sola no alcanza: el portal
    // también la manda si el login falló, y el CSV de una sesión anónima no
    // trae el precio de la cuenta.
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
          responseType: "text",
        }
      );
      const html = typeof loginRes.data === "string" ? loginRes.data : "";
      if (airLoginRejected(html)) {
        throw new BadGatewayException("Air rechazó el usuario o la clave de esta cuenta");
      }
      const setCookie = loginRes.headers["set-cookie"];
      sessionCookie = setCookie?.map((c: string) => c.split(";")[0]).join("; ");
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
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
    // stock "T" es el filtro real del portal para "todos" (el default "F" deja
    // afuera lo que no tiene stock físico y esas fichas se ven sin precio).
    const query = {
      grupo: 0, rubro: "", estado: "", texto: "", orden: "DA",
      stock: "T", codiart: "", canasto: 0, favoritos: "0", limit: 8000,
    };
    let csvText: string;
    let rubros: Map<string, string>;
    let grupos: Map<string, string>;
    try {
      const [csvRes, rubroMap, grupoMap] = await Promise.all([
        axios.get<string>(EXPORT_URL, {
          params: { type: "csv", q: JSON.stringify(query) },
          headers: { Cookie: sessionCookie },
          timeout: 90_000,
          responseType: "text",
          maxRedirects: 0,
          validateStatus: (s) => s < 400,
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
    if (!/codigo/i.test(csvText.slice(0, 500))) {
      throw new BadGatewayException("Air no devolvió el CSV del catálogo. La sesión de esta cuenta no quedó iniciada.");
    }

    if (rubros.size === 0 || grupos.size === 0) {
      this.logger.warn(`Air cache de rubros/grupos incompleto (rubros=${rubros.size}, grupos=${grupos.size})`);
    }

    const rows = parseAirCsv(csvText);
    if (rows.length === 0) throw new BadGatewayException("Air devolvió un catálogo CSV vacío");

    // El CSV nombra la columna de precio según la lista de ESA cuenta
    // (lista1, lista3, lista5…). El portal, en cambio, muestra siempre
    // precio.lista de quien inició sesión. Esa es la que hay que guardar.
    const accountPrices = await fetchAirAccountPrices(sessionCookie, rubros);
    const applied = applyAirAccountPrices(rows, accountPrices);
    if (accountPrices.size === 0) {
      this.logger.warn("Air no devolvió precio.lista del portal; se usa la columna de precio del CSV");
    } else {
      this.logger.log(`Air: ${applied} precios de la cuenta sobre ${rows.length} productos`);
    }

    const products = rows.map((r) => mapAirProduct(r, rubros, grupos));
    const withPrice = products.filter((p) => typeof p.price === "number" && p.price > 0).length;
    if (products.length > 20 && withPrice < products.length * 0.5) {
      throw new BadGatewayException(
        `Air devolvió ${products.length} productos y solo ${withPrice} con precio de esta cuenta.`
      );
    }

    await onPage(products);
  }
}

const AIR_CSV_COLUMNS = ["Codigo", "Descripcion", "lista5", "Tipo", "IVA", "ROS", "MZA", "CBA", "LUG", "Grupo", "Rubro", "Part Number"];
const CONSART_URL = "https://www.air-intra.com/2025/ar/consart.php?q=1";

/** El portal rechaza el login con action_state -1, o devuelve el formulario si la cuenta quedó vacía. */
export function airLoginRejected(html: string): boolean {
  if (/name=["']action_state["']\s+content=["']-1["']/i.test(html)) return true;
  const cuenta = html.match(/name=["']cuenta["']\s+content=["']([^"']*)["']/i)?.[1] ?? null;
  return cuenta === "" && /inicia sesión/i.test(html);
}

/** "12.5", "12,50" y "1.234,50" son precios. Vacío o texto no. */
export function parseAirPrice(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  let s = raw.trim().replace(/\s/g, "").replace(/u\$s/gi, "").replace(/USD|ARS|\$/gi, "");
  if (!s) return undefined;
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function splitAirCsvLine(line: string): string[] {
  const trimmed = line.trim().replace(/^\uFEFF/, "");
  const body = trimmed.replace(/^"/, "").replace(/"$/, "");
  return body.split('","').map((field) => field.trim());
}

function foldHeader(header: string): string {
  return header.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/**
 * La columna de precio no se llama siempre lista5: cada cuenta exporta la
 * suya (lista1, lista3, …). Si hay varias, gana la que trae importes.
 */
export function chooseAirPriceColumn(headers: string[], rows: string[][]): number {
  const candidates = headers
    .map((header, index) => ({ name: foldHeader(header), index }))
    .filter(({ name }) => /^(lista\d*|precio|price)$/.test(name));
  if (candidates.length === 0) return headers.length > 2 ? 2 : -1;
  if (candidates.length === 1) return candidates[0].index;
  let best = candidates[0].index;
  let bestScore = -1;
  for (const candidate of candidates) {
    let score = 0;
    for (const row of rows) {
      const price = parseAirPrice(row[candidate.index]);
      if (price != null && price > 0) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate.index;
    }
  }
  return best;
}

function columnIndex(headers: string[], names: string[], fallback: number): number {
  const folded = headers.map(foldHeader);
  for (const name of names) {
    const index = folded.indexOf(name);
    if (index >= 0) return index;
  }
  return fallback;
}

/** Pone en lista5 el precio que el portal muestra a esta cuenta (precio.lista). */
export function applyAirAccountPrices(rows: AirCsvRow[], prices: Map<string, number>): number {
  let applied = 0;
  for (const row of rows) {
    const price = prices.get(row.Codigo.trim());
    if (price == null || !(price > 0)) continue;
    row.lista5 = String(price);
    applied++;
  }
  return applied;
}

interface AirPortalArticle {
  codiart?: string;
  precio?: { lista?: unknown };
}

function pricesFromArticles(data: unknown): Map<string, number> {
  const list = Array.isArray(data) ? data : [];
  const map = new Map<string, number>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const article = item as AirPortalArticle;
    const code = article.codiart?.trim();
    const raw = article.precio?.lista;
    const price = typeof raw === "number" ? (Number.isFinite(raw) ? raw : undefined) : parseAirPrice(raw == null ? undefined : String(raw));
    if (!code || price == null || !(price > 0)) continue;
    map.set(code, price);
  }
  return map;
}

async function postAirCatalog(cookie: string, rubro: string, limit: number): Promise<unknown> {
  const res = await axios.post(
    CONSART_URL,
    {
      grupo: 0,
      grupo_name: "",
      rubro,
      rubro_name: "",
      estado: "",
      favoritos: 0,
      texto: "",
      orden: "DA",
      stock: "T",
      canasto: 0,
      limit,
      view: 0,
      cpt_tipo: "NV",
      seccion: "",
      seccion_name: "",
    },
    {
      headers: { Cookie: cookie, "Content-Type": "application/json", Accept: "application/json, text/plain, */*" },
      timeout: 90_000,
      validateStatus: (s) => s === 200 || s === 201,
    }
  );
  const data = res.data;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
  return data;
}

/** Precio de la cuenta logueada. Si el listado viene cortado, se completa por rubro. */
async function fetchAirAccountPrices(cookie: string, rubros: Map<string, string>): Promise<Map<string, number>> {
  try {
    const first = pricesFromArticles(await postAirCatalog(cookie, "", 8000));
    // Más de 500: el portal respetó el límite y ya vino el catálogo. 500 o menos
    // puede ser el tope viejo de la pantalla: se completa rubro por rubro.
    if (first.size === 0 || first.size > 500 || rubros.size === 0) return first;
    for (const rubroId of rubros.keys()) {
      const page = pricesFromArticles(await postAirCatalog(cookie, rubroId, 2000));
      for (const [code, price] of page) first.set(code, price);
    }
    return first;
  } catch {
    return new Map();
  }
}

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
  if (lines.length === 0) return [];
  const headerFields = splitAirCsvLine(lines[0]);
  const headers = headerFields.length >= 3 ? headerFields : AIR_CSV_COLUMNS;
  const dataLines = lines.slice(1).map(splitAirCsvLine);
  const priceIndex = chooseAirPriceColumn(headers, dataLines);
  const index = {
    codigo: columnIndex(headers, ["codigo"], 0),
    descripcion: columnIndex(headers, ["descripcion"], 1),
    tipo: columnIndex(headers, ["tipo"], 3),
    iva: columnIndex(headers, ["iva"], 4),
    ros: columnIndex(headers, ["ros"], 5),
    mza: columnIndex(headers, ["mza"], 6),
    cba: columnIndex(headers, ["cba"], 7),
    lug: columnIndex(headers, ["lug"], 8),
    grupo: columnIndex(headers, ["grupo"], 9),
    rubro: columnIndex(headers, ["rubro"], 10),
    partNumber: columnIndex(headers, ["part number", "partnumber"], 11),
  };
  const rows: AirCsvRow[] = [];
  for (const fields of dataLines) {
    if (fields.length < 3) continue;
    const cell = (i: number) => (i >= 0 ? (fields[i] ?? "").trim() : "");
    if (!cell(index.codigo)) continue;
    rows.push({
      Codigo: cell(index.codigo),
      Descripcion: cell(index.descripcion),
      lista5: cell(priceIndex),
      Tipo: cell(index.tipo),
      IVA: cell(index.iva),
      ROS: cell(index.ros),
      MZA: cell(index.mza),
      CBA: cell(index.cba),
      LUG: cell(index.lug),
      Grupo: cell(index.grupo),
      Rubro: cell(index.rubro),
      "Part Number": cell(index.partNumber),
    });
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
