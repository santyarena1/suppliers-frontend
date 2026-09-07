import { Injectable, Logger } from "@nestjs/common";
import { CatalogAiService } from "../catalog/catalog-ai.service";
import { guessColumnMap } from "./column-aliases";
import { detectNumberFormat } from "./row-normalizer";
import {
  NORMALIZED_FIELDS,

  type CellValue,
  type DividerMeaning,
  type ImportProfileSpec,
  type NormalizedField,
  type NumberFormat,
  type SheetAnalysis,
} from "./types";

const SAMPLE_ROWS = 25;
const SAMPLE_DIVIDERS = 3;

export interface LearnedProfile {
  spec: ImportProfileSpec;
  /** `true` si la propuesta salió del modelo; `false` si es la heurística por alias. */
  fromAi: boolean;
  reasoning: string;
}

const SYSTEM_PROMPT =
  "Sos un experto en listas de precios de distribuidores de tecnología en Argentina. " +
  "Recibís el encabezado y una muestra de filas de una planilla y tenés que decir qué columna es cada campo. " +
  "Respondé solo JSON válido con la forma pedida. Si una columna no corresponde a ningún campo, mapeala a null. " +
  "Nunca inventes columnas que no están en el encabezado.";

/**
 * Propone un perfil de lectura para una planilla nueva. Usa la IA una sola vez
 * por proveedor (o cambio de formato) con una muestra chica; si no hay clave o
 * el modelo falla, cae a la heurística por alias, que siempre devuelve algo.
 */
@Injectable()
export class ProfileLearner {
  private readonly logger = new Logger(ProfileLearner.name);

  constructor(private readonly ai: CatalogAiService) {}

  async learn(sheet: SheetAnalysis): Promise<LearnedProfile> {
    const heuristic = this.heuristic(sheet);
    if (!(await this.ai.isConfigured())) {
      return { spec: heuristic, fromAi: false, reasoning: "Mapeo por nombres de columna (sin clave de OpenAI configurada)." };
    }
    try {
      const raw = await this.ai.chatJson<unknown>(this.buildPrompt(sheet), SYSTEM_PROMPT);
      const parsed = parseAiProfile(raw, sheet.headers);
      if (!parsed) {
        this.logger.warn("La IA devolvió un perfil inválido; se usa la heurística");
        return { spec: heuristic, fromAi: false, reasoning: "La respuesta de la IA no fue válida; mapeo por nombres de columna." };
      }
      return {
        spec: {
          ...heuristic,
          ...parsed.spec,
          // La IA no ve la hoja ni la fila de encabezado: eso lo decidió el analizador.
          sheetIndex: sheet.sheetIndex,
          headerRow: sheet.headerRow ?? 0,
        },
        fromAi: true,
        reasoning: parsed.reasoning,
      };
    } catch (err) {
      this.logger.warn(`Aprendizaje de perfil con IA falló: ${err instanceof Error ? err.message : String(err)}`);
      return { spec: heuristic, fromAi: false, reasoning: "La IA no respondió; mapeo por nombres de columna." };
    }
  }

  heuristic(sheet: SheetAnalysis): ImportProfileSpec {
    const columnMap = guessColumnMap(sheet.headers);
    const priceCols = sheet.headers.filter((h) => columnMap[h] === "price" || columnMap[h] === "finalPrice");
    const samples: CellValue[] = [];
    for (const row of sheet.dataRows.slice(0, SAMPLE_ROWS)) {
      for (const header of priceCols) {
        const col = sheet.headers.indexOf(header);
        if (col >= 0) samples.push(row.cells[col]);
      }
    }
    return {
      sheetIndex: sheet.sheetIndex,
      headerRow: sheet.headerRow ?? 0,
      columnMap,
      currency: null,
      priceIncludesIva: false,
      ivaPercent: null,
      numberFormat: detectNumberFormat(samples),
      dividerMeaning: sheet.dividers.length > 0 ? "CATEGORY" : "IGNORE",
    };
  }

  buildPrompt(sheet: SheetAnalysis): string {
    const rows = sheet.dataRows.slice(0, SAMPLE_ROWS).map((r) => r.cells.map(cellText));
    const dividers = sheet.dividers.slice(0, SAMPLE_DIVIDERS);
    return [
      "Campos posibles (usá exactamente estos nombres): " + NORMALIZED_FIELDS.join(", ") + ".",
      "Aclaraciones: externalId es el código del proveedor; price es el precio neto (sin IVA); finalPrice el precio con IVA; " +
        "ivaPercent la alícuota; stock la cantidad disponible. Si hay varias columnas de precio, elegí la principal como price y, " +
        "si hay una con IVA incluido, como finalPrice.",
      "Un encabezado \"Columna X\" es una columna sin título: deducí qué es por los valores de la muestra (un código corto suele ser " +
        "externalId, un texto largo name, un número price). Un título que describe un grupo de productos (ej. \"GABINETES KIT\") no es " +
        "un campo: mapealo a null. Columnas CANTIDAD / TOTAL vacías o en cero son para que el cliente arme el pedido, no stock: null.",
      "",
      "Encabezado (columnas en orden): " + JSON.stringify(sheet.headers),
      "Muestra de filas: " + JSON.stringify(rows),
      dividers.length ? "Filas divisorias que aparecen entre grupos de productos: " + JSON.stringify(dividers) : "No hay filas divisorias.",
      "",
      "Respondé con este JSON:",
      JSON.stringify({
        columnMap: { "<encabezado tal cual>": "<campo o null>" },
        currency: "ARS | USD | null si no se puede saber",
        priceIncludesIva: "true si la columna price ya incluye IVA",
        ivaPercent: "número o null",
        numberFormat: "COMMA si los decimales van con coma (1.234,50), DOT si van con punto (1,234.50)",
        dividerMeaning: "BRAND si los divisores son marcas, CATEGORY si son rubros o categorías, IGNORE si no aportan",
        reasoning: "una oración explicando las decisiones dudosas",
      }),
    ].join("\n");
  }
}

function cellText(cell: CellValue): string {
  if (cell === null) return "";
  return String(cell).slice(0, 80);
}

/** Valida y tipa la respuesta del modelo. Devuelve `null` si no sirve. */
export function parseAiProfile(
  raw: unknown,
  headers: string[]
): { spec: Partial<ImportProfileSpec>; reasoning: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const map = obj.columnMap;
  if (!map || typeof map !== "object") return null;

  const validFields = new Set<string>(NORMALIZED_FIELDS);
  const columnMap: Record<string, NormalizedField | null> = {};
  const usedFields = new Set<NormalizedField>();
  for (const header of headers) columnMap[header] = null;
  for (const [header, field] of Object.entries(map as Record<string, unknown>)) {
    const actual = headers.find((h) => h === header) ?? headers.find((h) => h.toLowerCase() === header.toLowerCase());
    if (!actual) continue;
    if (field === null || field === undefined || field === "null") continue;
    if (typeof field !== "string" || !validFields.has(field)) continue;
    const f = field as NormalizedField;
    if (usedFields.has(f)) continue;
    columnMap[actual] = f;
    usedFields.add(f);
  }
  if (!usedFields.has("name")) return null;
  if (!usedFields.has("price") && !usedFields.has("finalPrice")) return null;

  const spec: Partial<ImportProfileSpec> = { columnMap };
  if (typeof obj.currency === "string" && /^[A-Z]{3}$/.test(obj.currency)) spec.currency = obj.currency;
  if (typeof obj.priceIncludesIva === "boolean") spec.priceIncludesIva = obj.priceIncludesIva;
  if (typeof obj.ivaPercent === "number" && obj.ivaPercent >= 0 && obj.ivaPercent <= 100) spec.ivaPercent = obj.ivaPercent;
  if (obj.numberFormat === "DOT" || obj.numberFormat === "COMMA") spec.numberFormat = obj.numberFormat as NumberFormat;
  if (obj.dividerMeaning === "BRAND" || obj.dividerMeaning === "CATEGORY" || obj.dividerMeaning === "IGNORE") {
    spec.dividerMeaning = obj.dividerMeaning as DividerMeaning;
  }
  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning.slice(0, 500) : "";
  return { spec, reasoning };
}
