import { normalizeHeader } from "./column-aliases";
import type { ImportProfileSpec, NormalizedField, SheetAnalysis, StructureAnalysis } from "./types";

/**
 * Planillas que ya conocemos columna por columna. Si la hoja trae todas las
 * columnas de un formato, se lee con este perfil sin IA ni revisión: lo
 * revisamos a mano contra la planilla real del proveedor.
 */
export interface KnownListFormat {
  key: string;
  label: string;
  /** Proveedor por lista que la plataforma dio de alta para esta planilla: va al directorio aunque nadie la haya subido todavía. */
  providerKey?: string;
  /** Encabezado normalizado → campo (o `null`: se ignora). Todos tienen que estar en la hoja. */
  columns: Record<string, NormalizedField | null>;
  currency: string | null;
  priceIncludesIva: boolean;
  ivaPercent: number | null;
  dividerMeaning: ImportProfileSpec["dividerMeaning"];
}

export const KNOWN_LIST_FORMATS: readonly KnownListFormat[] = [
  {
    // «Lista Gremio» de Aula (Aula, IROK y ATK), revisada el 2026-11-11.
    key: "aula-gremio",
    label: "Lista gremio de Aula",
    providerKey: "LIST_AULA",
    columns: {
      marca: "brand",
      ean: "externalId",
      descripcion: "name",
      familiadeproductos: "category",
      iva: "ivaPercent",
      preciousdsiniva: "price",
      stockactual: "stock",
      linkspecs: "productUrl",
    },
    currency: "USD",
    priceIncludesIva: false,
    // La alícuota viene por fila (0,105 / 0,21).
    ivaPercent: null,
    // La fila "AULA" de arriba no es la marca de todo: también hay IROK y ATK.
    dividerMeaning: "IGNORE",
  },
];

/** Proveedores por lista dados de alta por la plataforma con su planilla conocida. */
export const CURATED_LIST_PROVIDERS: ReadonlySet<string> = new Set(
  KNOWN_LIST_FORMATS.flatMap((f) => (f.providerKey ? [f.providerKey] : []))
);

/** El formato conocido de una hoja y su perfil, o `null` si no coincide con ninguno. */
export function knownFormatSpec(sheet: SheetAnalysis): { format: KnownListFormat; spec: ImportProfileSpec } | null {
  const byNorm = new Map(sheet.headers.map((h) => [normalizeHeader(h), h] as const));
  for (const format of KNOWN_LIST_FORMATS) {
    const required = Object.keys(format.columns);
    if (!required.every((norm) => byNorm.has(norm))) continue;
    const columnMap: Record<string, NormalizedField | null> = {};
    for (const header of sheet.headers) columnMap[header] = format.columns[normalizeHeader(header)] ?? null;
    return {
      format,
      spec: {
        sheetIndex: sheet.sheetIndex,
        headerRow: sheet.headerRow ?? 0,
        columnMap,
        currency: format.currency,
        priceIncludesIva: format.priceIncludesIva,
        ivaPercent: format.ivaPercent,
        numberFormat: "DOT",
        dividerMeaning: format.dividerMeaning,
      },
    };
  }
  return null;
}

/** La primera hoja del archivo que es de un formato conocido (la elegida, si lo es). */
export function knownFormatIn(
  analysis: StructureAnalysis,
  preferred: SheetAnalysis
): { sheet: SheetAnalysis; format: KnownListFormat; spec: ImportProfileSpec } | null {
  for (const sheet of [preferred, ...analysis.sheets.filter((s) => s !== preferred)]) {
    if (sheet.dataRows.length === 0) continue;
    const found = knownFormatSpec(sheet);
    if (found) return { sheet, ...found };
  }
  return null;
}
