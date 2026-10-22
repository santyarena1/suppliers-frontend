import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import type { CatalogSyncMeta, NormalizedProduct, ProviderAdapter } from "../types";
import { axiosErrorMessage } from "../json-value";

/**
 * Microglobal: web service SOAP "WSMG reseller". `GetCatalog(cliente, usuario,
 * password)` devuelve el catálogo entero en una respuesta; `result = 0` es OK.
 * Portado de `MicroglobalClient.php` de AcuStock; no lo probamos contra el WS real.
 *
 * La URL es fija: AcuStock deja cambiarla, acá no, para que una cuenta no pueda
 * hacer que la API le pegue a cualquier host.
 */
export const MICROGLOBAL_WS_URL = "https://ws.microglobal.com.ar/WSMG_res/WSMG.asmx";
const SOAP_NS = "http://tempuri.org/";
/** AcuStock le da 180 s: el catálogo completo tarda en armarse del lado de ellos. */
const TIMEOUT_MS = 180_000;
const MAX_BYTES = 80 * 1024 * 1024;
const BATCH = 200;

export interface MicroglobalCredentials {
  cliente: string;
  /** Vacío si la cuenta es el administrador del cliente (así lo indica AcuStock). */
  usuario: string;
  password: string;
  currency: "USD" | "ARS";
}

export function parseMicroglobalCredentials(raw: Record<string, string>): MicroglobalCredentials {
  const moneda = (raw.moneda ?? raw.currency ?? "").trim().toUpperCase();
  return {
    cliente: (raw.cliente ?? raw.client ?? raw.codigo_cliente ?? "").trim(),
    usuario: (raw.usuario ?? raw.user ?? raw.username ?? "").trim(),
    password: raw.password ?? raw.pass ?? "",
    currency: moneda === "ARS" ? "ARS" : "USD",
  };
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function xmlUnescape(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function buildMicroglobalEnvelope(action: string, creds: MicroglobalCredentials): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    `<soap:Body><${action} xmlns="${SOAP_NS}">` +
    `<cliente>${xmlEscape(creds.cliente)}</cliente>` +
    `<usuario>${xmlEscape(creds.usuario)}</usuario>` +
    `<password>${xmlEscape(creds.password)}</password>` +
    `</${action}></soap:Body></soap:Envelope>`
  );
}

/** Hijos directos de un fragmento XML: `[nombre local, contenido]`. Tolera prefijos de namespace. */
function childElements(xml: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re = /<(?:[\w-]+:)?([\w-]+)(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/(?:[\w-]+:)?\1\s*>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push([m[1], m[2] ?? ""]);
  return out;
}

function firstElement(xml: string, name: string): string | null {
  const re = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</(?:[\\w-]+:)?${name}\\s*>)`);
  const m = xml.match(re);
  return m ? (m[1] ?? "") : null;
}

export type MicroglobalRow = Record<string, string>;

/**
 * Respuesta de `GetCatalog`. Igual que AcuStock: un `soap:Fault` o un `result`
 * distinto de 0 es error (con el `message` que manda Microglobal); las filas
 * salen de `listProducts` (o `listCategories`/`listBrands` en otras acciones).
 */
export function parseMicroglobalResponse(xml: string, action = "GetCatalog"): MicroglobalRow[] {
  const body = (xml ?? "").trim();
  if (!body) throw new BadGatewayException("Microglobal devolvió una respuesta vacía.");
  const fault = firstElement(body, "faultstring");
  if (fault != null) throw new BadGatewayException(`Microglobal: ${xmlUnescape(fault).trim() || "error SOAP"}`);
  const result = firstElement(body, `${action}Result`);
  if (result == null) throw new BadGatewayException(`Microglobal no devolvió ${action}Result.`);

  const code = Number(xmlUnescape(firstElement(result, "result") ?? "-1").trim());
  if (code !== 0) {
    const message = xmlUnescape(firstElement(result, "message") ?? "").trim();
    throw new BadGatewayException(`Microglobal: ${message || `respondió error ${Number.isFinite(code) ? code : "?"}`}.`);
  }

  const rows: MicroglobalRow[] = [];
  for (const [name, content] of childElements(result)) {
    if (!["listProducts", "listCategories", "listBrands"].includes(name)) continue;
    for (const [, item] of childElements(content)) {
      const row: MicroglobalRow = {};
      for (const [field, value] of childElements(item)) row[field] = xmlUnescape(value).trim();
      if (Object.keys(row).length) rows.push(row);
    }
  }
  return rows;
}

const num = (v: string | undefined): number | undefined => {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: string | undefined): string | undefined => {
  const t = (v ?? "").trim();
  return t ? t : undefined;
};
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Un producto de `GetCatalog`. `precio` es neto; `iva_pct` e `ii_pct`
 * (internos) vienen aparte y el final es neto × (1 + IVA + internos), como lo
 * calcula AcuStock. La moneda no viene en el producto: la elige el comercio al
 * cargar la cuenta (USD por defecto). `peso` llega en gramos.
 */
export function mapMicroglobalProduct(row: MicroglobalRow, currency: "USD" | "ARS" = "USD"): NormalizedProduct | null {
  const externalId = str(row.partNumber);
  const name = str(row.descripcion);
  if (!externalId || !name) return null;

  const price = num(row.precio);
  const iva = num(row.iva_pct);
  const ii = num(row.ii_pct);
  const ivaPercent = iva != null && iva >= 0 && iva <= 100 ? iva : undefined;
  const internos = ii != null && ii > 0 && ii <= 100 ? ii : 0;
  const hasPrice = price != null && price > 0;
  const stock = num(row.stock);
  const grams = num(row.peso);

  return {
    externalId,
    sku: externalId,
    partNumber: str(row.partNumber_ori) ?? externalId,
    ean: str(row.upc),
    name,
    brand: str(row.marca),
    category: str(row.categoria),
    price: hasPrice ? round4(price) : undefined,
    finalPrice: hasPrice && ivaPercent != null ? round4(price * (1 + (ivaPercent + internos) / 100)) : undefined,
    currency: hasPrice ? currency : undefined,
    ivaPercent,
    stock: stock != null ? Math.max(0, Math.trunc(stock)) : undefined,
    weight: grams != null && grams > 0 ? round4(grams / 1000) : undefined,
    weightUnit: grams != null && grams > 0 ? "kg" : undefined,
    raw: row,
  };
}

@Injectable()
export class MicroglobalAdapter implements ProviderAdapter {
  readonly provider = "MICROGLOBAL" as const;
  private readonly logger = new Logger(MicroglobalAdapter.name);

  async syncAll(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>,
    onMeta?: (meta: CatalogSyncMeta) => Promise<void>
  ): Promise<void> {
    const creds = parseMicroglobalCredentials(credentials);
    if (!creds.cliente || !creds.password) {
      throw new BadGatewayException("Credenciales de Microglobal incompletas: hacen falta código de cliente y contraseña.");
    }

    let xml: string;
    try {
      const res = await axios.post<string>(MICROGLOBAL_WS_URL, buildMicroglobalEnvelope("GetCatalog", creds), {
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${SOAP_NS}GetCatalog"` },
        timeout: TIMEOUT_MS,
        responseType: "text",
        maxContentLength: MAX_BYTES,
        maxRedirects: 0,
        // Un 500 de ASMX trae el soap:Fault con el motivo: se lee igual.
        validateStatus: (s) => s === 200 || s === 500,
      });
      xml = typeof res.data === "string" ? res.data : String(res.data ?? "");
    } catch (err) {
      throw new BadGatewayException(`Microglobal: ${axiosErrorMessage(err, "no respondió el web service")}`);
    }

    const rows = parseMicroglobalResponse(xml, "GetCatalog");
    await onMeta?.({ expectedTotal: rows.length });
    let seen = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const items = rows
        .slice(i, i + BATCH)
        .map((r) => mapMicroglobalProduct(r, creds.currency))
        .filter((p): p is NormalizedProduct => p != null);
      if (items.length) await onPage(items);
      seen += items.length;
    }
    if (seen === 0) throw new BadGatewayException("Microglobal no devolvió productos. Revisá código de cliente, usuario y contraseña.");
    this.logger.log(`Microglobal sync: ${seen} productos`);
  }
}
