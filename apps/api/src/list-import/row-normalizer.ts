import { createHash } from "node:crypto";
import type { NormalizedProduct } from "../providers/types";
import {
  NUMERIC_FIELDS,
  type CellValue,
  type ImportProfileSpec,
  type NormalizeResult,
  type NormalizedField,
  type NumberFormat,
  type RowIssue,
  type SheetAnalysis,
} from "./types";

/**
 * Convierte un valor de celda a número según el formato de la planilla.
 * COMMA: "1.234,50" → 1234.5. DOT: "1,234.50" → 1234.5. Los números de Excel
 * pasan tal cual. Símbolos de moneda y espacios se ignoran.
 */
export function parseNumber(value: CellValue, format: NumberFormat): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let s = value
    .trim()
    .replace(/^(usd|u\$s|ars|eur|\$)/i, "")
    .replace(/[^\d.,\-]/g, "");
  if (!s || s === "-" ) return null;
  if (format === "COMMA") {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Deduce el formato numérico mirando muestras de texto. Si aparece "1.234,50"
 * es COMMA; "1,234.50" es DOT. Con solo un separador de dos decimales, el que
 * sea decide. Sin evidencia, COMMA (Argentina).
 */
export function detectNumberFormat(samples: CellValue[]): NumberFormat {
  let commaVotes = 0;
  let dotVotes = 0;
  for (const sample of samples) {
    if (typeof sample !== "string") continue;
    const s = sample.replace(/[^\d.,]/g, "");
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastDot >= 0 && lastComma >= 0) {
      if (lastComma > lastDot) commaVotes++;
      else dotVotes++;
      continue;
    }
    if (lastComma >= 0 && /,\d{1,2}$/.test(s)) commaVotes++;
    if (lastDot >= 0 && /\.\d{1,2}$/.test(s)) dotVotes++;
  }
  return dotVotes > commaVotes ? "DOT" : "COMMA";
}

const IVA_DEFAULT_PERCENT = 21;

/**
 * Aplica el perfil a las filas de datos y produce productos normalizados, el
 * mismo tipo que devuelven los adapters de API. Nada se descarta en silencio:
 * cada fila que no cierra deja un issue con fila, columna y motivo.
 */
export function normalizeRows(sheet: SheetAnalysis, profile: ImportProfileSpec): NormalizeResult {
  const items: NormalizedProduct[] = [];
  const issues: RowIssue[] = [];
  const seenIds = new Map<string, number>();

  const fieldByColumn = sheet.headers.map((header) => profile.columnMap[header] ?? null);
  const hasExplicitCode = fieldByColumn.some((f) => f === "externalId");

  for (const dataRow of sheet.dataRows) {
    const rowNumber = dataRow.index + 1;
    const raw: Record<string, CellValue> = {};
    const mapped: Partial<Record<NormalizedField, unknown>> = {};

    dataRow.cells.forEach((cell, col) => {
      const header = sheet.headers[col];
      if (header) raw[header] = cell;
      const field = fieldByColumn[col];
      if (!field || cell === null || cell === "") return;
      if (NUMERIC_FIELDS.has(field)) {
        const n = parseNumber(cell, profile.numberFormat);
        if (n === null) {
          issues.push({ row: rowNumber, column: header, message: `"${String(cell)}" no es un número válido` });
          return;
        }
        mapped[field] = n;
      } else {
        mapped[field] = String(cell).trim();
      }
    });


    const name = typeof mapped.name === "string" ? mapped.name : "";
    if (!name) {
      issues.push({ row: rowNumber, message: "Fila sin nombre de producto: se ignora" });
      continue;
    }

    applyDivider(mapped, dataRow.divider, profile.dividerMeaning);

    const externalId = resolveExternalId(mapped, hasExplicitCode);
    if (!externalId) {
      issues.push({ row: rowNumber, message: "No se pudo determinar un código para el producto" });
      continue;
    }
    const firstSeen = seenIds.get(externalId);
    if (firstSeen !== undefined) {
      issues.push({ row: rowNumber, message: `Código ${externalId} repetido (ya apareció en la fila ${firstSeen}); se conserva la primera` });
      continue;
    }
    seenIds.set(externalId, rowNumber);

    const prices = resolvePrices(mapped, profile);
    if (prices.price == null && prices.finalPrice == null) {
      issues.push({ row: rowNumber, message: "Fila sin precio: se carga sin precio" });
    }

    const item: NormalizedProduct = {
      ...(mapped as Partial<NormalizedProduct>),
      externalId,
      name,
      price: prices.price ?? undefined,
      finalPrice: prices.finalPrice ?? undefined,
      currency: typeof mapped.currency === "string" ? mapped.currency : profile.currency ?? undefined,
      ivaPercent: prices.ivaPercent ?? undefined,
      raw: { ...raw, ...(dataRow.divider ? { _divisor: dataRow.divider } : {}) },
    };
    items.push(item);
  }

  return { items, issues };
}

function applyDivider(
  mapped: Partial<Record<NormalizedField, unknown>>,
  divider: string | null,
  meaning: ImportProfileSpec["dividerMeaning"]
) {
  if (!divider || meaning === "IGNORE") return;
  const field: NormalizedField = meaning === "BRAND" ? "brand" : "category";
  if (mapped[field] === undefined || mapped[field] === "") mapped[field] = divider;
}

/**
 * Código estable del producto: el del proveedor si lo hay (o SKU / part number /
 * EAN), y si la lista no trae ninguno, un hash del nombre normalizado más la
 * marca, para poder seguirlo entre cargas.
 */
function resolveExternalId(mapped: Partial<Record<NormalizedField, unknown>>, hasExplicitCode: boolean): string | null {
  const candidates: (keyof typeof mapped)[] = hasExplicitCode
    ? ["externalId", "sku", "partNumber", "ean"]
    : ["sku", "partNumber", "ean"];
  for (const key of candidates) {
    const value = mapped[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  const name = typeof mapped.name === "string" ? mapped.name : "";
  if (!name) return null;
  const brand = typeof mapped.brand === "string" ? mapped.brand : "";
  const key = `${normalizeText(name)}|${normalizeText(brand)}`;
  return `H-${createHash("sha1").update(key).digest("hex").slice(0, 16)}`;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Precio neto y final. Si la planilla trae uno solo, el otro se deriva con el
 * IVA del perfil (o de la fila). Sin IVA conocido y con el precio "con IVA", se
 * asume 21 %.
 */
function resolvePrices(mapped: Partial<Record<NormalizedField, unknown>>, profile: ImportProfileSpec) {
  const ivaRaw = typeof mapped.ivaPercent === "number" ? mapped.ivaPercent : profile.ivaPercent ?? null;
  // Muchas planillas escriben la alícuota como fracción (0,105 / 0,21): se pasa a puntos.
  const ivaPercent = ivaRaw != null && ivaRaw > 0 && ivaRaw < 1 ? Math.round(ivaRaw * 10000) / 100 : ivaRaw;
  let price = typeof mapped.price === "number" ? mapped.price : null;
  let finalPrice = typeof mapped.finalPrice === "number" ? mapped.finalPrice : null;

  if (price != null && finalPrice == null) {
    if (profile.priceIncludesIva) {
      const iva = ivaPercent ?? IVA_DEFAULT_PERCENT;
      finalPrice = round4(price);
      price = round4(price / (1 + iva / 100));
    } else if (ivaPercent != null) {
      finalPrice = round4(price * (1 + ivaPercent / 100));
    }
  } else if (price == null && finalPrice != null) {
    const iva = ivaPercent ?? IVA_DEFAULT_PERCENT;
    price = round4(finalPrice / (1 + iva / 100));
  }

  const effectiveIva = price != null || finalPrice != null ? (ivaPercent ?? IVA_DEFAULT_PERCENT) : ivaPercent;
  return { price, finalPrice, ivaPercent: effectiveIva };
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
