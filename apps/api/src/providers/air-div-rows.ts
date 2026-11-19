import { parseLooseAmount, stripTags } from "./html-table";

/**
 * Las páginas de cuenta de Air (2025) no usan <table>: cada fila es un
 * `<div class="row">` y la de títulos `<div class="row h_row">`. Los importes van
 * en formato US («9,999,999.99») y las fechas dd/mm/aaaa.
 *
 * Fila → registro con las claves de la fila de títulos. Si las celdas no
 * coinciden con los títulos, se reconoce cada dato por su forma (código de
 * comprobante, fecha, importe).
 */

export type AirDivRow = Record<string, string> & { _code?: string };

const CODE = /^[A-Z]{2,4}\d{6,}$/;
const DATE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
const AMOUNT = /^-?[\d.,]*\d$/;

/** Trozos de HTML de cada `<div class="row …">`, en orden. */
function rowChunks(html: string): { header: boolean; html: string }[] {
  const re = /<div\b[^>]*\bclass=["']([^"']*\brow\b[^"']*)["'][^>]*>/gi;
  const starts: { at: number; header: boolean }[] = [];
  for (const m of html.matchAll(re)) {
    const classes = m[1].split(/\s+/);
    if (!classes.includes("row")) continue;
    starts.push({ at: m.index ?? 0, header: classes.includes("h_row") });
  }
  return starts.map((s, i) => ({ header: s.header, html: html.slice(s.at, starts[i + 1]?.at ?? html.length) }));
}

/** Celdas hoja de una fila (sin etiquetas adentro), conservando las vacías. */
function cells(chunk: string): string[] {
  const inner = chunk.replace(/^<div\b[^>]*>/i, "");
  // Hasta el cierre de la fila: el primer bloque de la siguiente sección corta antes.
  const out: string[] = [];
  for (const m of inner.matchAll(/<(div|label|span|section|p|b|strong|a)\b[^>]*>([^<]*)<\/\1>/gi)) out.push(stripTags(m[2]));
  return out;
}

function byShape(values: string[], header: string[]): AirDivRow {
  const row: AirDivRow = {};
  const texts = values.filter((v) => v !== "");
  const code = texts.find((v) => CODE.test(v));
  const dates = texts.filter((v) => DATE.test(v));
  const amounts = texts.filter((v) => AMOUNT.test(v) && !DATE.test(v) && !CODE.test(v) && /[.,]\d{2}$/.test(v));
  const has = (k: string) => header.some((h) => h.toLowerCase() === k);
  if (code) row[header.find((h) => /comprobante/i.test(h)) ?? "Comprobante"] = code;
  else if (texts[0] && !DATE.test(texts[0])) row[header.find((h) => /comprobante/i.test(h)) ?? "Comprobante"] = texts[0];
  if (dates[0]) row.Fecha = dates[0];
  if (dates[1] && has("vence")) row.Vence = dates[1];
  if (has("debe") && has("haber")) {
    // Debe/Haber: [movimiento, saldo] o [debe, haber, saldo]. Los recibos (RE…) van al haber.
    const saldo = amounts.at(-1);
    if (saldo != null) row.Saldo = saldo;
    if (amounts.length >= 3) {
      row.Debe = amounts[0];
      row.Haber = amounts[1];
    } else if (amounts.length === 2) {
      row[/^RE/i.test(code ?? "") || /^NC/i.test(code ?? "") ? "Haber" : "Debe"] = amounts[0];
    }
  } else {
    const keys = header.filter((h) => /importe|saldo|acumula|total|neto/i.test(h));
    amounts.forEach((a, i) => {
      if (keys[i]) row[keys[i]] = a;
    });
  }
  return row;
}

export function parseAirDivRows(html: string): AirDivRow[] {
  const chunks = rowChunks(html);
  const headerChunk = chunks.find((c) => c.header);
  const header = headerChunk ? cells(headerChunk.html).filter((h) => h && !/^ops\.?$|^opc\.?$|^sel\.?$/i.test(h)) : [];
  const out: AirDivRow[] = [];
  for (const c of chunks) {
    if (c.header) continue;
    const values = cells(c.html);
    if (values.every((v) => v === "")) continue;
    let row: AirDivRow;
    // Mismas celdas que títulos (las vacías cuentan): se toman por posición.
    const usable = values.slice(0, header.length);
    if (header.length > 0 && values.length >= header.length && usable.some((v) => DATE.test(v)) && header.every((h, i) => !/fecha|vence/i.test(h) || usable[i] === "" || DATE.test(usable[i]))) {
      row = {};
      header.forEach((h, i) => {
        if (usable[i] !== "") row[h] = usable[i];
      });
    } else {
      row = byShape(values, header);
    }
    const code = Object.values(row).find((v) => CODE.test(v));
    if (code) row._code = code;
    if (Object.keys(row).length > 0) out.push(row);
  }
  return out;
}

/**
 * Saldo de la cuenta: el acumulado de la última fila de Debe/Haber. En Air,
 * positivo = lo que se le debe; negativo = a favor del comercio.
 */
export function airBalanceFromRows(rows: AirDivRow[]): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const raw = rows[i].Saldo;
    if (raw == null) continue;
    const n = parseLooseAmount(raw);
    if (n != null) return n;
  }
  return null;
}
