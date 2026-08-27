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
const SITE_BASE = "https://www.invidcomputers.com";

// La lista de precios (Excel) no trae imagen. La API JSON documentada sí
// (`IMAGE_URL`), pero comparte el límite real de 50 req/hora con AcuStock
// (otro sistema del negocio que usa la misma cuenta), así que no es viable
// pedirle una imagen por producto ahí sin arriesgar romper AcuStock.
// En cambio, la tienda web (mismo login de portal) tiene páginas de listado
// por categoría — 20 productos por página, paginadas con
// `--view--grilla-{offset}` — donde cada `<img>` de producto ya trae la URL
// completa de la miniatura, con el código de producto embebido en el propio
// nombre de archivo (16 dígitos con cero-padding + un id de carga interno
// pegado sin separador). Confirmado en vivo: para el código 413764, el
// archivo es `thumb/0000000000413764<id-interno>..._WxH.ext`. Recorrer estas
// páginas no toca el límite de 50/hora en absoluto (es la misma tienda
// pública, no la API). Categorías: lista fija tomada de la navegación real
// del sitio — si falta alguna, esos productos simplemente quedan sin imagen
// (no se inventa), no rompe nada.
const CATEGORY_SLUGS = [
  "accesorios--prod--3", "almacenamiento--prod--18", "computadoras--prod--16",
  "conectividad--prod--1", "consumibles--prod--141", "coolers--prod--175",
  "destacados--prod--173", "discos-rigidos-ssd--prod--9", "electrodomesticos--prod--10",
  "energia--prod--137", "gabinetes-y-fuentes--prod--14", "impresoras--prod--15",
  "memorias-ram--prod--17", "microprocesadores--prod--19", "monitores--prod--20",
  "mothers--prod--4", "notebooks--prod--152", "perifericos--prod--2",
  "placas-de-video--prod--5", "proyectores--prod--22", "setup-gamer--prod--213",
  "tablets--prod--24", "parlantes-perifericos--prod--27", "super-ofertas--prod--151",
];
const IMAGE_MAX_PAGES_PER_CATEGORY = 60; // 60*20=1200 productos por categoría, tope de seguridad

/**
 * Mapeo manual campo-a-campo del Excel del portal hacia nuestro esquema
 * unificado. Esta planilla no trae cantidad numérica de stock para esta
 * cuenta (el mismo comportamiento que documenta la API JSON: "STOCK solo
 * se incluye cuando el usuario tiene permiso"), así que no se inventa una
 * cantidad exacta que la fuente no da.
 *
 * Pero SÍ trae una señal real: es literalmente una "Lista de Precios" —
 * en las 1369 filas reales (verificado, sin contar las de encabezado
 * repetido) no existe NINGÚN valor tipo "Sin stock"/"Agotado" en
 * "Observaciones", solo vacío (622) o "Stock Bajo" (672). Es decir, la
 * lista solo incluye productos disponibles para vender; "Stock Bajo" es
 * una advertencia sobre ESOS productos, no una exclusión. Por eso: todo
 * producto listado se marca con stock nominal (nivel "normal" o "bajo"
 * según Observaciones), no con 0 — cero sería más falso que la
 * aproximación, ya que ningún producto en la lista está realmente agotado.
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
  impInternos: 8,
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
      // El archivo repite la fila de encabezado de columnas más de una vez
      // en medio de la tabla (confirmado en vivo: 75 filas con "Codigo"/
      // "Producto"/"Observaciones" literales) — no son productos, se saltean.
      if (String(codigo).trim() === "Codigo" || String(producto).trim() === "Producto") continue;
      items.push(mapProduct(row));
    }
    if (items.length === 0) throw new BadGatewayException("Invid devolvió un catálogo vacío");

    // 3) Enriquecer con imagen real recorriendo la tienda web (no rompe si falla).
    try {
      const images = await crawlCategoryImages(sessionCookie);
      for (const item of items) {
        const code = normalizeCode(item.externalId);
        const img = images.get(code);
        if (img) {
          item.imageUrl = img;
          item.productUrl = `${SITE_BASE}/x---det--${code}`;
        }
      }
    } catch {
      // Sin imagen no rompe la sincronización — el catálogo en sí ya se sincronizó.
    }

    await onPage(items);
  }

  /**
   * Enriquecimiento lento: visita la ficha de cada producto en la tienda web
   * (1 request por producto, ~1200 productos → 15-25 min) para traer lo que
   * ni el Excel ni la API JSON dan sin gastar su cupo: categoría/subcategoría
   * reales (breadcrumb), disponibilidad real (metatag product:availability)
   * y la ficha técnica completa. Se llama en background después de un sync
   * normal — nunca bloquea la respuesta de /sync. Si un producto puntual
   * falla (404, timeout), se saltea sin cortar el resto.
   */
  async enrichDetails(
    credentials: Record<string, string>,
    codes: string[],
    onItem: (externalId: string, patch: Partial<NormalizedProduct>) => Promise<void>
  ): Promise<void> {
    const { username, password } = credentials;
    if (!username || !password) return;

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
      sessionCookie = loginRes.headers["set-cookie"]?.map((c: string) => c.split(";")[0]).join("; ");
    } catch {
      return;
    }
    if (!sessionCookie) return;

    for (const rawCode of codes) {
      const code = normalizeCode(rawCode);
      let html: string;
      try {
        const res = await axios.get<string>(`${SITE_BASE}/x---det--${code}`, {
          headers: { Cookie: sessionCookie },
          timeout: 15_000,
          responseType: "text",
        });
        html = res.data;
      } catch {
        continue; // producto puntual no disponible, seguimos con el próximo
      }

      const patch = extractDetailPatch(html);
      if (Object.keys(patch).length > 0) {
        await onItem(rawCode, patch);
      }

      await sleep(200); // ritmo respetuoso — es la tienda real, no una API pensada para esto
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Decodifica las entidades HTML numéricas/nombradas más comunes que aparecen en este sitio. */
function decodeEntities(s: string): string {
  return s
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&ntilde;/gi, "ñ")
    .replace(/&Aacute;/g, "Á").replace(/&Eacute;/g, "É").replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó").replace(/&Uacute;/g, "Ú").replace(/&Ntilde;/g, "Ñ")
    .replace(/&reg;/gi, "®").replace(/&trade;/gi, "™").replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/&deg;/gi, "°");
}

/** Extrae categoría/subcategoría (breadcrumb), disponibilidad y ficha técnica de una página de producto ya descargada. */
export function extractDetailPatch(html: string): Partial<NormalizedProduct> {
  const patch: Partial<NormalizedProduct> = {};

  // Breadcrumb: "breadcrumb"> <a ...>Cat</a> / <a ...>Subcat</a> / <li>Nombre...
  const breadcrumbIdx = html.toLowerCase().indexOf("breadcrumb");
  if (breadcrumbIdx !== -1) {
    const liIdx = html.indexOf("<li", breadcrumbIdx);
    const segment = html.slice(breadcrumbIdx, liIdx > -1 ? liIdx : breadcrumbIdx + 500);
    const crumbs = [...segment.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map((m) => decodeEntities(m[1]).trim());
    if (crumbs[0]) patch.category = crumbs[0];
    if (crumbs[1]) patch.subcategory = crumbs[1];
  }

  // Disponibilidad real: <meta name="product:availability" content="in stock|out of stock">
  const availMatch = html.match(/name="product:availability"\s+content="([^"]*)"/i);
  if (availMatch) {
    const val = availMatch[1].toLowerCase();
    if (val.includes("out of stock") || val.includes("sin stock")) {
      patch.stockStatus = "Sin stock (tienda)";
      patch.stock = 0;
    } else if (val.includes("in stock")) patch.stockStatus = "Disponible (tienda)";
  }

  // Descripción corta: metatag dc.description (resumen de la mini-ficha técnica).
  const descMatch = html.match(/name="dc\.description"\s+content="([^"]*)"/i);
  if (descMatch) {
    const desc = decodeEntities(descMatch[1]).replace(/\s+/g, " ").trim();
    if (desc) patch.description = desc.slice(0, 1000);
  }

  // Ficha técnica completa: bloque tab-content (pestañas "Descripción" / "Más información").
  const tabIdx = html.indexOf('class="tab-content"');
  if (tabIdx !== -1) {
    const endIdx = html.indexOf("Productos relacionados", tabIdx);
    const block = html.slice(tabIdx, endIdx > -1 ? endIdx : tabIdx + 8000);
    const text = decodeEntities(
      block
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<(div|li|tr|td|p|br|h[1-6])[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    )
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n")
      .slice(0, 6000);
    if (text) patch.longDescription = text;
  }

  return patch;
}

/** Normaliza un código de producto a 7 dígitos con cero-padding (formato del Excel). */
function normalizeCode(raw: string): string {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? String(n).padStart(7, "0") : raw;
}

/** Recorre las páginas de listado por categoría de la tienda y arma un mapa
 * código de producto -> URL de imagen, usando la cookie de sesión ya logueada. */
async function crawlCategoryImages(sessionCookie: string): Promise<Map<string, string>> {
  const images = new Map<string, string>();
  const imgRe = /<img[^>]+src="((?:https:\/\/www\.invidcomputers\.com\/)?thumb\/(\d{16})[^"]*)"/g;

  for (const slug of CATEGORY_SLUGS) {
    for (let page = 0; page < IMAGE_MAX_PAGES_PER_CATEGORY; page++) {
      const offset = page * 20;
      let html: string;
      try {
        const res = await axios.get<string>(`${SITE_BASE}/${slug}--view--grilla-${offset}`, {
          headers: { Cookie: sessionCookie },
          timeout: 20_000,
          responseType: "text",
        });
        html = res.data;
      } catch {
        break; // categoría/página no disponible, seguimos con la próxima categoría
      }

      let found = 0;
      let m: RegExpExecArray | null;
      imgRe.lastIndex = 0;
      while ((m = imgRe.exec(html))) {
        const code = String(parseInt(m[2], 10)).padStart(7, "0");
        const path = m[1].split("?")[0];
        images.set(code, path.startsWith("http") ? path : `${SITE_BASE}/${path}`);
        found++;
      }
      if (found === 0) break; // última página de esta categoría
    }
  }
  return images;
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

  const stockStatus = str(row[COLUMN_INDEX.observaciones]);
  const isLowStock = stockStatus?.trim().toLowerCase() === "stock bajo";
  const net = num(row[COLUMN_INDEX.precioSinIva]);
  const iva = num(row[COLUMN_INDEX.iva]);
  const internos = num(row[COLUMN_INDEX.impInternos]);
  const listedFinal = num(row[COLUMN_INDEX.precioFinal]);

  return {
    externalId: String(row[COLUMN_INDEX.codigo]).trim(),
    name: String(row[COLUMN_INDEX.producto]).trim(),
    brand: str(row[COLUMN_INDEX.fabricante]),
    partNumber: str(row[COLUMN_INDEX.nroDeParte]),
    ean: str(row[COLUMN_INDEX.ean]),
    currency: str(row[COLUMN_INDEX.moneda])?.includes("US$") ? "USD" : str(row[COLUMN_INDEX.moneda]),
    price: net,
    ivaPercent: iva,
    finalPrice: listedFinal ?? sumInvidTaxes(net, iva, internos),
    stock: isLowStock ? 1 : 5, // nominal, no cantidad real — ver comentario arriba de COLUMN_INDEX
    stockStatus,
    raw: row,
  } as NormalizedProduct;
}

/** Invid: precio final = neto + IVA + impuesto interno. La alícuota puede ser % o monto. */
function sumInvidTaxes(net?: number, iva?: number, internos?: number): number | undefined {
  if (net == null) return undefined;
  const ivaAmount = iva == null ? 0 : iva > 1 && iva <= 100 ? net * (iva / 100) : iva;
  const intAmount = internos == null ? 0 : internos > 1 && internos <= 100 ? net * (internos / 100) : internos;
  return Math.round((net + ivaAmount + intAmount) * 10000) / 10000;
}
