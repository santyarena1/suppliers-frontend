import { BadRequestException } from "@nestjs/common";
import * as XLSX from "xlsx";
import type { CellValue, GridSheet, MergeRange } from "./types";

/** Tope de filas por hoja: una lista de precios no pasa de esto; más es un error. */
const MAX_ROWS = 60_000;
const MAX_COLS = 80;

/**
 * Lee un xlsx / xls / csv y devuelve cada hoja como matriz cruda de celdas, con
 * los rangos de celdas unificadas. No interpreta nada: eso es del analizador.
 *
 * Los números vienen como número (lo que Excel guardó), los textos como texto
 * recortado. "1.234,50" escrito como texto llega como texto y lo resuelve el
 * normalizador según el formato numérico del perfil.
 */
export function readGrid(buffer: Buffer, filename: string): GridSheet[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: true });
  } catch {
    throw new BadRequestException(`No se pudo leer "${filename}": ¿es un Excel o CSV válido?`);
  }
  if (workbook.SheetNames.length === 0) {
    throw new BadRequestException("El archivo no tiene ninguna hoja");
  }

  return workbook.SheetNames.map((name, index) => {
    const sheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
    const rows: CellValue[][] = matrix
      .slice(0, MAX_ROWS)
      .map((row, r) =>
        Array.isArray(row) ? row.slice(0, MAX_COLS).map((value, c) => withHyperlink(sheet, r, c, toCellValue(value))) : []
      );
    const merges: MergeRange[] = (sheet["!merges"] ?? []).map((m) => ({
      r0: m.s.r,
      c0: m.s.c,
      r1: m.e.r,
      c1: m.e.c,
    }));
    return { index, name, rows, merges };
  });
}

/** Un texto corto tipo "LINK" o "Ver" que es un hipervínculo vale por su destino. */
const LINK_TEXT_MAX = 12;

function withHyperlink(sheet: XLSX.WorkSheet, r: number, c: number, value: CellValue): CellValue {
  if (typeof value !== "string" || value.length > LINK_TEXT_MAX || /^https?:///i.test(value)) return value;
  const cell = sheet[XLSX.utils.encode_cell({ r, c })] as { l?: { Target?: string } } | undefined;
  const target = cell?.l?.Target?.trim();
  return target && /^https?:///i.test(target) ? target : value;
}

function toCellValue(value: unknown): CellValue {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}
