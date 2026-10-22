import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { parse } from "csv-parse/sync";
import type { CatalogSyncMeta, NormalizedProduct, ProviderAdapter } from "../types";
import { axiosErrorMessage } from "../json-value";

/**
 * Masnet (masnet.com.ar): el catálogo entero sale en un CSV de su API.
 * `GET /api/v1/productos/csv?user_id=…&token=…`. Lógica portada de
 * `MasnetClient.php` de AcuStock; no la probamos contra el portal real.
 */
export const MASNET_CSV_URL = "https://masnet.com.ar/api/v1/productos/csv";

/** Columnas que AcuStock exige en la cabecera. Si falta una, el CSV no se toma. */
export const MASNET_CSV_COLUMNS = [
  "id", "codigo_alfa", "codigo_producto", "nombre", "categoria", "sub_categoria", "marca",
  "precio", "impuesto_interno", "iva", "moneda", "markup", "cotizacion", "pvp_usd", "pvp_ars",
  "stock_total", "stock_deposito_cliente", "stock_deposito_cd", "link", "imagen", "miniatura", "actualizado",
] as const;

/** Menos filas que esto es una respuesta rota, no un catálogo: no se pisa nada. */
export const MASNET_MIN_ROWS = 5;
const BATCH = 200;
const TIMEOUT_MS = 90_000;
/** El CSV completo pesa unos pocos MB; el tope evita que un error devuelva algo enorme. */
const MAX_BYTES = 60 * 1024 * 1024;

export type MasnetRow = Record<string, string>;

export interface MasnetCredentials {
  userId: string;
  token: string;
}

export function parseMasnetCredentials(raw: Record<string, string>): MasnetCredentials {
  return {
    userId: (raw.user_id ?? raw.userId ?? raw.usuario ?? "").trim(),
    token: (raw.token ?? raw.api_token ?? "").trim(),
  };
}

/** Número del CSV: acepta "1234.5", "1234,5" y "1.234,50". Vacío o basura → undefined. */
export function parseCsvNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  let t = raw.trim().replace(/\s/g, "");
  if (!t) return undefined;
  if (t.includes(",") && t.includes(".")) {
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (t.includes(",")) {
    t = t.replace(",", ".");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * `stock_total` llega como texto. Si trae un número ("12", "+50", ">10") vale ese
 * número; "sin stock" es 0; cualquier otra cosa queda sin dato (y se guarda el texto).
 */
export function parseMasnetStock(raw: string | undefined): { stock?: number; stockStatus?: string } {
  const text = (raw ?? "").trim();
  if (!text) return {};
  const m = text.match(/-?\d+(?:[.,]\d+)?/);
  if (m) {
    const n = parseCsvNumber(m[0]);
    if (n != null) {
      const stock = Math.max(0, Math.round(n));
      return /^\d+(?:[.,]\d+)?$/.test(text) ? { stock } : { stock, stockStatus: text };
    }
  }
  if (/sin\s*stock|agotado|^no$/i.test(text)) return { stock: 0, stockStatus: text };
  return { stockStatus: text };
}

/** Igual que AcuStock: "2", "D", "U$S", "USD" → USD; "1", "P", "ARS" → ARS; lo demás USD. */
export function normalizeMasnetCurrency(raw: string | undefined): "USD" | "ARS" {
  const m = (raw ?? "").trim().toUpperCase();
  if (["1", "P", "PESO", "PESOS", "ARS", "$"].includes(m)) return "ARS";
  return "USD";
}

/** "Notebooks" + "Gamer" → "Notebooks > Gamer" (como lo compone AcuStock). */
function categoryPath(cat?: string, sub?: string): string | undefined {
  if (cat && sub && sub.toLowerCase() !== cat.toLowerCase()) return `${cat} > ${sub}`;
  return cat || sub || undefined;
}

const text = (v: string | undefined): string | undefined => {
  const t = (v ?? "").replace(/\\'/g, "'").trim();
  return t ? t : undefined;
};

/**
 * Una fila del CSV. `precio` es neto de IVA y, según AcuStock, ya incluye el
 * impuesto interno: por eso no se suma `impuesto_interno` otra vez. El final
 * es precio × (1 + IVA). `markup`/`pvp_*` son el precio sugerido de Masnet y
 * quedan solo en `raw`.
 */
export function mapMasnetRow(row: MasnetRow): NormalizedProduct | null {
  const id = text(row.id);
  const alfa = text(row.codigo_alfa);
  const externalId = alfa ?? id;
  const name = text(row.nombre);
  if (!externalId || !name) return null;

  const price = parseCsvNumber(row.precio);
  const iva = parseCsvNumber(row.iva);
  const ivaPercent = iva != null && iva >= 0 && iva <= 100 ? iva : undefined;
  const { stock, stockStatus } = parseMasnetStock(row.stock_total);
  const finalPrice =
    price != null && price > 0 && ivaPercent != null ? Math.round(price * (1 + ivaPercent / 100) * 10000) / 10000 : undefined;
  const sub = text(row.sub_categoria);

  return {
    externalId,
    sku: alfa ?? id,
    partNumber: text(row.codigo_producto),
    ean: text(row.ean),
    name,
    brand: text(row.marca),
    category: categoryPath(text(row.categoria), sub),
    subcategory: sub,
    description: text(row.descripcion),
    price: price != null && price > 0 ? price : undefined,
    finalPrice,
    currency: price != null && price > 0 ? normalizeMasnetCurrency(row.moneda) : undefined,
    ivaPercent,
    stock,
    stockStatus,
    imageUrl: text(row.imagen) ?? text(row.miniatura),
    productUrl: text(row.link),
    raw: row,
  };
}

/** Parece una página de error (HTML) en vez del CSV. */
export function looksLikeHtml(body: string): boolean {
  const head = body.trimStart().slice(0, 64).toLowerCase();
  return !head || head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<head") || head.includes("<body");
}

/** Parsea y valida el CSV entero. Tira con un mensaje claro si no sirve. */
export function parseMasnetCsv(body: string): MasnetRow[] {
  if (looksLikeHtml(body)) {
    throw new BadGatewayException("Masnet no devolvió el CSV del catálogo (respuesta vacía o página de error). Revisá User ID y token.");
  }
  // AcuStock lee con fgetcsv y escape "\", así que Masnet puede mandar comillas
  // escapadas como \" además de "". csv-parse entiende una sola forma: se pasan a "".
  let header: string[] = [];
  const rows = parse(body.replace(/\\"/g, '""'), {
    columns: (raw: string[]) => (header = raw.map((h) => h.replace(/^﻿/, "").trim().toLowerCase())),
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: false,
  }) as MasnetRow[];
  const missing = MASNET_CSV_COLUMNS.find((c) => !header.includes(c));
  if (missing) throw new BadGatewayException(`El CSV de Masnet cambió de formato: falta la columna «${missing}».`);
  const valid = rows.filter((r) => text(r.id) || text(r.codigo_alfa));
  if (valid.length < MASNET_MIN_ROWS) {
    throw new BadGatewayException(`El CSV de Masnet trajo ${valid.length} productos; se esperaban al menos ${MASNET_MIN_ROWS}. No se actualizó nada.`);
  }
  return valid;
}

/** El token viaja en la URL: nunca puede terminar en un log ni en un error. */
export function maskMasnetSecrets(message: string, creds: MasnetCredentials): string {
  let out = message;
  for (const secret of [creds.token, encodeURIComponent(creds.token)]) {
    if (secret && secret.length >= 3) out = out.split(secret).join("••••");
  }
  return out.replace(/([?&]token=)[^&\s"']+/gi, "$1••••");
}

@Injectable()
export class MasnetAdapter implements ProviderAdapter {
  readonly provider = "MASNET" as const;
  private readonly logger = new Logger(MasnetAdapter.name);

  async syncAll(
    credentials: Record<string, string>,
    onPage: (items: NormalizedProduct[]) => Promise<void>,
    onMeta?: (meta: CatalogSyncMeta) => Promise<void>
  ): Promise<void> {
    const creds = parseMasnetCredentials(credentials);
    if (!creds.userId || !creds.token) {
      throw new BadGatewayException("Credenciales de Masnet incompletas: hacen falta User ID y token de la API.");
    }

    let body: string;
    try {
      const res = await axios.get<string>(MASNET_CSV_URL, {
        params: { user_id: creds.userId, token: creds.token },
        timeout: TIMEOUT_MS,
        responseType: "text",
        maxContentLength: MAX_BYTES,
        maxRedirects: 3,
        headers: { Accept: "text/csv,*/*" },
      });
      body = typeof res.data === "string" ? res.data : String(res.data ?? "");
    } catch (err) {
      const msg = maskMasnetSecrets(axiosErrorMessage(err, "No se pudo descargar el CSV de Masnet"), creds);
      throw new BadGatewayException(`Masnet: ${msg}`);
    }

    const rows = parseMasnetCsv(body);
    await onMeta?.({ expectedTotal: rows.length });
    let seen = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const items = rows.slice(i, i + BATCH).map(mapMasnetRow).filter((p): p is NormalizedProduct => p != null);
      if (items.length) await onPage(items);
      seen += items.length;
    }
    if (seen === 0) throw new BadGatewayException("Masnet no devolvió productos con código y nombre.");
    this.logger.log(`Masnet sync: ${seen} productos`);
  }
}
