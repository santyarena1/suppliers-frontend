import { createHash } from "node:crypto";
import { countAliasHits, normalizeHeader } from "./column-aliases";
import type { CellValue, DataRow, GridSheet, RowKind, SheetAnalysis, StructureAnalysis } from "./types";

/** Hasta dónde buscar el encabezado: debajo de logos, títulos y leyendas. */
const HEADER_SEARCH_ROWS = 40;
/** Cuántas filas mirar después de un candidato para confirmar que debajo hay datos. */
const HEADER_LOOKAHEAD_ROWS = 15;
const MIN_DATA_ROWS_AFTER_HEADER = 2;
/** Un divisor "a lo ancho" es una celda unificada que cubre al menos tantas columnas. */
const WIDE_MERGE_MIN_COLS = 3;
/** Texto más largo que esto no es un encabezado de columna, es una leyenda. */
const MAX_HEADER_TEXT_LENGTH = 60;

interface RowStats {
  nonEmpty: number;
  text: number;
  numeric: number;
  firstCol: number;
  lastCol: number;
  /** El único valor no vacío, cuando hay uno solo. */
  single: CellValue;
}

/**
 * Entiende la forma de cada hoja sin saber nada del proveedor: dónde está el
 * encabezado real, qué filas son datos, cuáles son divisores por marca o
 * categoría (una celda sola, o unificada a lo ancho) y cuáles son ruido.
 *
 * Es determinístico a propósito: mismas celdas, mismo resultado. Lo que no se
 * puede decidir sin contexto (qué columna es el precio) es del perfil.
 */
export function analyzeStructure(sheets: GridSheet[]): StructureAnalysis {
  const analyses = sheets.map(analyzeSheet);
  const chosen = analyses.reduce<SheetAnalysis | null>((best, current) => {
    if (current.dataRows.length === 0) return best;
    if (!best || current.dataRows.length > best.dataRows.length) return current;
    return best;
  }, null);
  return { sheets: analyses, chosen, fingerprint: fingerprintOf(sheets.length, chosen) };
}

export function fingerprintOf(sheetCount: number, chosen: SheetAnalysis | null): string {
  const headers = chosen?.normalizedHeaders.filter(Boolean).join("|") ?? "";
  return createHash("sha1").update(`${sheetCount}#${headers}`).digest("hex");
}

export function analyzeSheet(sheet: GridSheet): SheetAnalysis {
  const stats = sheet.rows.map(rowStats);
  const wideMergeRows = new Set(
    sheet.merges.filter((m) => m.c1 - m.c0 + 1 >= WIDE_MERGE_MIN_COLS && m.r0 === m.r1).map((m) => m.r0)
  );
  const headerRow = findHeaderRow(sheet.rows, stats);
  const kinds: RowKind[] = sheet.rows.map((_, i) => (headerRow === null || i < headerRow ? "PREAMBLE" : "EMPTY"));

  if (headerRow === null) {
    return {
      sheetIndex: sheet.index,
      sheetName: sheet.name,
      headerRow: null,
      headers: [],
      normalizedHeaders: [],
      dataRows: [],
      dividers: [],
      rowsTotal: sheet.rows.length,
      kinds,
    };
  }

  kinds[headerRow] = "HEADER";
  const { headers, firstCol, lastCol } = buildHeaders(sheet.rows, stats, headerRow);
  const headerSignature = signatureOf(sheet.rows[headerRow], firstCol, lastCol);

  const dataRows: DataRow[] = [];
  const dividers: string[] = [];
  let currentDivider: string | null = null;

  for (let i = headerRow + 1; i < sheet.rows.length; i++) {
    const st = stats[i];
    const row = sheet.rows[i];
    if (st.nonEmpty === 0) {
      kinds[i] = "EMPTY";
      continue;
    }
    // Encabezado repetido (una vez por página impresa): se salta.
    if (signatureOf(row, firstCol, lastCol) === headerSignature) {
      kinds[i] = "HEADER";
      continue;
    }
    const isDivider =
      (st.nonEmpty === 1 && typeof st.single === "string" && !looksNumeric(st.single)) ||
      (wideMergeRows.has(i) && st.numeric === 0 && st.text >= 1);
    if (isDivider) {
      kinds[i] = "DIVIDER";
      currentDivider = dividerText(row);
      if (currentDivider) dividers.push(currentDivider);
      continue;
    }
    if (st.nonEmpty >= 2) {
      kinds[i] = "DATA";
      dataRows.push({ index: i, cells: sliceCells(row, firstCol, lastCol), divider: currentDivider });
      continue;
    }
    // Una sola celda numérica suelta (un total, un número de página): ruido.
    kinds[i] = "FOOTER";
  }

  // Los divisores después del último dato son pie de página (totales, leyendas).
  const lastData = dataRows.length ? dataRows[dataRows.length - 1].index : headerRow;
  for (let i = lastData + 1; i < kinds.length; i++) {
    if (kinds[i] === "DIVIDER") {
      kinds[i] = "FOOTER";
      const text = dividerText(sheet.rows[i]);
      const idx = text ? dividers.lastIndexOf(text) : -1;
      if (idx >= 0) dividers.splice(idx, 1);
    }
  }

  return {
    sheetIndex: sheet.index,
    sheetName: sheet.name,
    headerRow,
    headers,
    normalizedHeaders: headers.map(normalizeHeader),
    dataRows,
    dividers: [...new Set(dividers)],
    rowsTotal: sheet.rows.length,
    kinds,
  };
}

function rowStats(row: CellValue[]): RowStats {
  let nonEmpty = 0;
  let text = 0;
  let numeric = 0;
  let firstCol = -1;
  let lastCol = -1;
  let single: CellValue = null;
  row.forEach((cell, col) => {
    if (cell === null || cell === "") return;
    nonEmpty++;
    single = cell;
    if (firstCol < 0) firstCol = col;
    lastCol = col;
    if (typeof cell === "number" || (typeof cell === "string" && looksNumeric(cell))) numeric++;
    else text++;
  });
  return { nonEmpty, text, numeric, firstCol, lastCol, single: nonEmpty === 1 ? single : null };
}

/** "1.234,50", "$ 1234.5", "12" → sí. "AB-12" → no. */
export function looksNumeric(value: string): boolean {
  const cleaned = value.replace(/[\s$]/g, "").replace(/^(usd|u\$s|ars|eur)/i, "");
  if (!cleaned) return false;
  return /^-?\d{1,3}([.,]\d{3})*([.,]\d+)?$|^-?\d+([.,]\d+)?$/.test(cleaned);
}

/**
 * Elige la fila de encabezado: varias celdas de texto corto, casi sin números,
 * y debajo de ella filas con números. Entre candidatas gana la que más
 * encabezados conocidos tiene; a igual puntaje, la de más arriba.
 */
function findHeaderRow(rows: CellValue[][], stats: RowStats[]): number | null {
  let best: { index: number; score: number } | null = null;
  const limit = Math.min(rows.length, HEADER_SEARCH_ROWS);
  for (let i = 0; i < limit; i++) {
    const st = stats[i];
    if (st.text < 2 || st.numeric > 1) continue;
    const texts = rows[i].filter((c): c is string => typeof c === "string" && c.length <= MAX_HEADER_TEXT_LENGTH);
    if (texts.length < 2) continue;
    if (!hasDataBelow(stats, i)) continue;
    const score = texts.length + countAliasHits(texts) * 3 - st.numeric;
    if (!best || score > best.score) best = { index: i, score };
  }
  return best?.index ?? null;
}

function hasDataBelow(stats: RowStats[], headerIndex: number): boolean {
  let dataRows = 0;
  const end = Math.min(stats.length, headerIndex + 1 + HEADER_LOOKAHEAD_ROWS);
  for (let i = headerIndex + 1; i < end; i++) {
    if (stats[i].nonEmpty >= 2 && stats[i].numeric >= 1) dataRows++;
    if (dataRows >= MIN_DATA_ROWS_AFTER_HEADER) return true;
  }
  return false;
}

/**
 * Encabezados de la tabla. El ancho lo define el encabezado más las columnas a
 * la derecha donde igual hay datos (columnas sin título reciben "Columna X").
 */
function buildHeaders(rows: CellValue[][], stats: RowStats[], headerRow: number) {
  const header = rows[headerRow];
  const firstCol = Math.max(0, stats[headerRow].firstCol);
  let lastCol = stats[headerRow].lastCol;
  const lookEnd = Math.min(rows.length, headerRow + 1 + 200);
  for (let i = headerRow + 1; i < lookEnd; i++) {
    if (stats[i].nonEmpty >= 2 && stats[i].lastCol > lastCol) lastCol = stats[i].lastCol;
  }
  const headers: string[] = [];
  const seen = new Map<string, number>();
  for (let col = firstCol; col <= lastCol; col++) {
    const raw = header[col];
    let label = raw === null || raw === undefined ? "" : String(raw).trim();
    if (!label) label = `Columna ${columnLetter(col)}`;
    const count = seen.get(label) ?? 0;
    seen.set(label, count + 1);
    headers.push(count === 0 ? label : `${label} (${count + 1})`);
  }
  return { headers, firstCol, lastCol };
}

export function columnLetter(col: number): string {
  let n = col;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function sliceCells(row: CellValue[], firstCol: number, lastCol: number): CellValue[] {
  const out: CellValue[] = [];
  for (let col = firstCol; col <= lastCol; col++) out.push(row[col] ?? null);
  return out;
}

function signatureOf(row: CellValue[], firstCol: number, lastCol: number): string {
  return sliceCells(row, firstCol, lastCol)
    .map((c) => (typeof c === "string" ? normalizeHeader(c) : c === null ? "" : String(c)))
    .join("|");
}

function dividerText(row: CellValue[]): string | null {
  const cell = row.find((c) => c !== null && c !== "");
  if (cell === undefined || cell === null) return null;
  const text = String(cell).trim();
  return text || null;
}
