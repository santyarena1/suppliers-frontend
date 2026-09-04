import type { NormalizedProduct } from "../providers/types";

/** Campos de la ficha/oferta a los que puede mapearse una columna de la planilla. */
export type NormalizedField = Exclude<keyof NormalizedProduct, "raw">;

export const NORMALIZED_FIELDS: NormalizedField[] = [
  "externalId",
  "sku",
  "partNumber",
  "ean",
  "name",
  "brand",
  "category",
  "subcategory",
  "description",
  "longDescription",
  "price",
  "finalPrice",
  "currency",
  "ivaPercent",
  "stock",
  "stockStatus",
  "imageUrl",
  "productUrl",
  "locationAir",
  "warranty",
  "weight",
  "weightUnit",
  "height",
  "width",
  "length",
  "dimensionsUnit",
  "volume",
  "tags",
];

export const NUMERIC_FIELDS: ReadonlySet<NormalizedField> = new Set<NormalizedField>([
  "price",
  "finalPrice",
  "ivaPercent",
  "stock",
  "weight",
  "height",
  "width",
  "length",
  "volume",
]);

export type CellValue = string | number | boolean | null;

export interface MergeRange {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/** Una hoja tal cual: matriz de celdas, sin interpretar. */
export interface GridSheet {
  index: number;
  name: string;
  rows: CellValue[][];
  merges: MergeRange[];
}

export type RowKind = "PREAMBLE" | "HEADER" | "DIVIDER" | "DATA" | "EMPTY" | "FOOTER";

export interface DataRow {
  /** Índice de fila en la hoja (base 0). */
  index: number;
  cells: CellValue[];
  /** Texto del último divisor visto antes de esta fila, si hubo. */
  divider: string | null;
}

export interface SheetAnalysis {
  sheetIndex: number;
  sheetName: string;
  headerRow: number | null;
  /** Encabezados tal cual aparecen (o "Columna X" para columnas sin título). */
  headers: string[];
  normalizedHeaders: string[];
  dataRows: DataRow[];
  dividers: string[];
  rowsTotal: number;
  kinds: RowKind[];
}

export interface StructureAnalysis {
  sheets: SheetAnalysis[];
  /** La hoja con más filas de datos. `null` si ninguna tiene. */
  chosen: SheetAnalysis | null;
  /** Hash de encabezados normalizados + cantidad de hojas. */
  fingerprint: string;
}

export type NumberFormat = "DOT" | "COMMA";
export type DividerMeaning = "BRAND" | "CATEGORY" | "IGNORE";

/** Lo que hay que saber para leer la planilla de un proveedor. */
export interface ImportProfileSpec {
  sheetIndex: number;
  headerRow: number;
  /** encabezado original → campo, o `null` para ignorar la columna. */
  columnMap: Record<string, NormalizedField | null>;
  currency: string | null;
  priceIncludesIva: boolean;
  ivaPercent: number | null;
  numberFormat: NumberFormat;
  dividerMeaning: DividerMeaning;
}

export interface RowIssue {
  row: number;
  column?: string;
  message: string;
}

export interface NormalizeResult {
  items: NormalizedProduct[];
  issues: RowIssue[];
}

export interface PreviousOffer {
  externalId: string;
  name: string;
  price: number | null;
  finalPrice: number | null;
}

export interface DiffItem {
  externalId: string;
  name: string;
  price: number | null;
}

export interface PriceChange {
  externalId: string;
  name: string;
  before: number | null;
  after: number | null;
  /** Variación porcentual (positiva = subió). `null` si no se puede calcular. */
  percent: number | null;
}

export interface ImportDiff {
  counts: {
    created: number;
    priceChanged: number;
    unchanged: number;
    missing: number;
    /** Filas con precio nulo o inválido dentro de las normalizadas. */
    withoutPrice: number;
  };
  /** Muestras (acotadas) por grupo, para la pantalla de revisión. */
  samples: {
    created: DiffItem[];
    priceChanged: PriceChange[];
    missing: DiffItem[];
  };
  /** Todos los externalId que faltan, para poder aplicar la acción de faltantes. */
  missingIds: string[];
}

export interface SanityThresholds {
  /** % de productos anteriores que desaparecen. */
  maxMissingPercent: number;
  /** % de productos existentes cuyo precio cambió. */
  maxPriceChangedPercent: number;
  /** % de filas sin precio válido. */
  maxInvalidPricePercent: number;
  /** Filas nuevas / filas anteriores mínimo (0.5 = la mitad). */
  minRowsRatio: number;
  /** Cantidad mínima de cambios para evaluar "todos con el mismo %". */
  uniformChangeMinCount: number;
}

export const DEFAULT_SANITY_THRESHOLDS: SanityThresholds = {
  maxMissingPercent: 30,
  maxPriceChangedPercent: 80,
  maxInvalidPricePercent: 5,
  minRowsRatio: 0.5,
  uniformChangeMinCount: 20,
};
