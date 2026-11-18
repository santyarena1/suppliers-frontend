/**
 * Datos fiscales de una factura electrónica argentina, desde el QR de ARCA
 * (RG 4892: `https://www.afip.gob.ar/fe/qr/?p=<JSON en base64>`) o, si no hay
 * QR, desde el texto del PDF. Funciones puras: lo que no se puede leer con
 * certeza queda en `null` (nunca se estima).
 */
import { validCuit } from "./order-payload";

export type InvoiceClass = "factura" | "nota_credito" | "nota_debito" | "recibo" | "otro";

export interface FiscalData {
  /** Letra: A, B, C, M o E. */
  tipo: string | null;
  /** Código ARCA del comprobante (1 = Factura A, 6 = Factura B…). */
  tipo_codigo: number | null;
  clase: InvoiceClass | null;
  punto_venta: number | null;
  numero: number | null;
  /** AAAA-MM-DD. */
  fecha_emision: string | null;
  cae: string | null;
  /** AAAA-MM-DD (solo sale del texto: el QR no la trae). */
  cae_vencimiento: string | null;
  /** 30-12345678-9. */
  cuit_emisor: string | null;
  importe_total: number | null;
  /** ARS, USD u otro código de ARCA tal cual. */
  moneda: string | null;
  cotizacion: number | null;
}

export const EMPTY_FISCAL: FiscalData = {
  tipo: null,
  tipo_codigo: null,
  clase: null,
  punto_venta: null,
  numero: null,
  fecha_emision: null,
  cae: null,
  cae_vencimiento: null,
  cuit_emisor: null,
  importe_total: null,
  moneda: null,
  cotizacion: null,
};

// ---------- Tipos de comprobante (tabla de ARCA) ----------

const CMP: Record<number, [string, InvoiceClass]> = {
  1: ["A", "factura"], 2: ["A", "nota_debito"], 3: ["A", "nota_credito"], 4: ["A", "recibo"],
  6: ["B", "factura"], 7: ["B", "nota_debito"], 8: ["B", "nota_credito"], 9: ["B", "recibo"],
  11: ["C", "factura"], 12: ["C", "nota_debito"], 13: ["C", "nota_credito"], 15: ["C", "recibo"],
  19: ["E", "factura"], 20: ["E", "nota_debito"], 21: ["E", "nota_credito"],
  51: ["M", "factura"], 52: ["M", "nota_debito"], 53: ["M", "nota_credito"], 54: ["M", "recibo"],
  201: ["A", "factura"], 202: ["A", "nota_debito"], 203: ["A", "nota_credito"],
  206: ["B", "factura"], 207: ["B", "nota_debito"], 208: ["B", "nota_credito"],
  211: ["C", "factura"], 212: ["C", "nota_debito"], 213: ["C", "nota_credito"],
};

export function comprobanteTipo(code: number | null): { tipo: string | null; clase: InvoiceClass | null } {
  const hit = code == null ? undefined : CMP[code];
  return hit ? { tipo: hit[0], clase: hit[1] } : { tipo: null, clase: code == null ? null : "otro" };
}

function currency(code: unknown): string | null {
  const c = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!c) return null;
  if (c === "PES" || c === "ARS") return "ARS";
  if (c === "DOL" || c === "USD") return "USD";
  return c;
}

export function formatCuit(raw: string | number | null | undefined): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length !== 11 || !validCuit(d)) return null;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

const isoDate = (y: number, m: number, d: number): string | null => {
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/** "2026-11-17", "20261117" o "17/11/2026" → "2026-11-17". */
export function parseDate(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  let m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return isoDate(+m[3], +m[2], +m[1]);
  return null;
}

const posInt = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/\D/g, "") || NaN);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const posNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// ---------- QR ----------

const QR_HOST = /^(?:www\.)?(?:afip|arca)\.gob\.ar$/i;

/** ¿Es el link del QR de una factura electrónica? */
export function isArcaQrUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return QR_HOST.test(u.hostname) && /\/fe\/qr\/?/i.test(u.pathname) && !!u.searchParams.get("p");
  } catch {
    return false;
  }
}

/**
 * Lee el link del QR. Devuelve `null` si no es un QR de ARCA o el JSON no se
 * puede leer; los campos que no vengan o no sean válidos quedan en `null`.
 */
export function parseArcaQr(raw: string): FiscalData | null {
  if (!isArcaQrUrl(raw)) return null;
  const p = new URL(raw.trim()).searchParams.get("p") ?? "";
  let json: Record<string, unknown>;
  try {
    const b64 = p.replace(/\s/g, "+").replace(/-/g, "+").replace(/_/g, "/");
    const txt = Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64").toString("utf8");
    json = JSON.parse(txt) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const code = posInt(json.tipoCmp);
  const { tipo, clase } = comprobanteTipo(code);
  const cae = String(json.codAut ?? "").replace(/\D/g, "");
  const moneda = currency(json.moneda);
  return {
    tipo,
    tipo_codigo: code,
    clase,
    punto_venta: posInt(json.ptoVta),
    numero: posInt(json.nroCmp),
    fecha_emision: parseDate(json.fecha),
    cae: cae.length === 14 ? cae : null,
    cae_vencimiento: null,
    cuit_emisor: formatCuit(json.cuit as string | number),
    importe_total: posNum(json.importe),
    moneda,
    // En pesos ARCA informa ctz = 1: no es una cotización del dólar.
    cotizacion: moneda === "ARS" ? null : posNum(json.ctz),
  };
}

// ---------- Texto del PDF ----------

/** "1.234.567,89" o "1234567.89" → número. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, "");
  else if (lastComma < 0 && (s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const DATE_RE = String.raw`(\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{4}-\d{2}-\d{2})`;

/**
 * Datos fiscales desde el texto del PDF (cuando no hay QR legible). Solo toma
 * lo que aparece con su etiqueta; el CUIT del emisor solo si aparece antes de
 * los datos del cliente (para no confundirlo con el CUIT del comprador).
 */
export function parseInvoiceText(text: string): FiscalData {
  const t = text.replace(/ /g, " ").replace(/[ \t]+/g, " ");
  const out: FiscalData = { ...EMPTY_FISCAL };

  const cae = t.match(/C\.?\s?A\.?\s?E\.?\s*(?:N[°ºro.]*\s*)?:?\s*(\d{14})\b/i);
  if (cae) out.cae = cae[1];
  const vto = t.match(new RegExp(String.raw`(?:Fecha\s+de\s+)?V(?:to|encimiento)\.?\s*(?:de[l]?\s*)?C\.?A\.?E\.?\s*:?\s*` + DATE_RE, "i"));
  if (vto) out.cae_vencimiento = parseDate(vto[1]);

  const emision = t.match(new RegExp(String.raw`Fecha\s+(?:de\s+)?Emisi[oó]n\s*:?\s*` + DATE_RE, "i"));
  if (emision) out.fecha_emision = parseDate(emision[1]);

  const pv = t.match(/Punto\s+de\s+Venta\s*:?\s*(\d{1,5})/i);
  const nro = t.match(/Comp(?:robante)?\.?\s*Nro\.?\s*:?\s*(\d{1,8})/i);
  if (pv && nro) {
    out.punto_venta = posInt(pv[1]);
    out.numero = posInt(nro[1]);
  } else {
    const both = t.match(/N[°º]\s*:?\s*(\d{4,5})\s*-\s*(\d{8})\b/);
    if (both) {
      out.punto_venta = posInt(both[1]);
      out.numero = posInt(both[2]);
    }
  }

  const cod = t.match(/C[OÓ]D(?:IGO)?\.?\s*(?:N[°º]\s*)?:?\s*0*(\d{1,3})\b/i);
  if (cod) {
    out.tipo_codigo = posInt(cod[1]);
    const k = comprobanteTipo(out.tipo_codigo);
    out.tipo = k.tipo;
    out.clase = k.clase;
  }
  if (!out.clase) {
    if (/NOTA\s+DE\s+CR[EÉ]DITO/i.test(t)) out.clase = "nota_credito";
    else if (/NOTA\s+DE\s+D[EÉ]BITO/i.test(t)) out.clase = "nota_debito";
    else if (/\bFACTURA\b/i.test(t)) out.clase = "factura";
  }

  const total = t.match(/Importe\s+Total\s*:?\s*(?:\$|U\$S|USD|US\$)?\s*([\d.,]+)/i);
  if (total) out.importe_total = parseAmount(total[1]);

  // CUIT del emisor: el primero válido, siempre que aparezca antes de los datos del cliente.
  const receptor = t.search(/Apellido\s+y\s+Nombre|Raz[oó]n\s+Social\s*:?\s*[^\n]*\n[^\n]*Domicilio[^\n]*\n[^\n]*Condici[oó]n|Se[ñn]or(?:es)?\s*:|Cliente\s*:/i);
  const cuitRe = /C\.?U\.?I\.?T\.?\s*(?:N[°º]\s*)?:?\s*(\d{2}-?\d{8}-?\d)/gi;
  let m: RegExpExecArray | null;
  while ((m = cuitRe.exec(t))) {
    if (receptor >= 0 && m.index > receptor) break;
    const c = formatCuit(m[1]);
    if (c) {
      out.cuit_emisor = receptor >= 0 ? c : null;
      break;
    }
  }

  if (/\bU\$S\b|D[OÓ]LARES|\bUSD\b/i.test(t) && /Moneda\s*:?\s*(?:U\$S|USD|D[OÓ]LAR)/i.test(t)) out.moneda = "USD";
  else if (/Moneda\s*:?\s*(?:\$|PES|ARS|PESOS)/i.test(t)) out.moneda = "ARS";
  const ctz = t.match(/(?:Cotizaci[oó]n|Tipo\s+de\s+Cambio|T\.?\s?C\.?)\s*(?:U\$S|USD)?\s*:?\s*\$?\s*([\d.,]+)/i);
  if (ctz) {
    const n = parseAmount(ctz[1]);
    out.cotizacion = n != null && n > 1 ? n : null;
  }
  return out;
}

/** ¿Hay algo fiscal que valga la pena? (CAE, o punto de venta + número). */
export function hasFiscalData(f: FiscalData): boolean {
  return !!f.cae || (f.punto_venta != null && f.numero != null);
}

/**
 * Junta el QR (manda) con el texto (completa lo que el QR no trae, como el
 * vencimiento del CAE). Si los dos dicen cosas distintas, gana el QR.
 */
export function mergeFiscal(qr: FiscalData | null, text: FiscalData | null): FiscalData {
  const base = { ...EMPTY_FISCAL };
  for (const k of Object.keys(base) as (keyof FiscalData)[]) {
    const q = qr?.[k] ?? null;
    const x = text?.[k] ?? null;
    (base as Record<string, unknown>)[k] = q ?? x;
  }
  return base;
}
