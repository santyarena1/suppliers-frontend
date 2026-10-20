import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { readGrid } from "../list-import/grid-reader";
import { analyzeSheet } from "../list-import/structure-analyzer";
import type { GridSheet } from "../list-import/types";
import { SheetFetchError } from "./sheet-source";

/**
 * Pestañas de una planilla de Google Sheets bajada entera (xlsx): cuáles hay,
 * cuántos productos tiene cada una, y la elegida convertida en un archivo de una
 * sola hoja para el importador (así el perfil de columnas ve siempre una hoja).
 */

export interface SheetTab {
  name: string;
  /** Filas con datos debajo del encabezado, según el analizador de planillas. */
  rows: number;
}

/** Lo que se guarda en `Storefront.sheetTabs` después de cada lectura. */
export interface SheetTabsState {
  tabs: SheetTab[];
  /** Pestaña a la que apunta el gid del link (solo tiendas que leen por gid). */
  linkTab: string | null;
  /** La pestaña la eligió NODO (la de más filas) y no el comercio. */
  autoPicked: boolean;
}

export const EMPTY_TABS_STATE: SheetTabsState = { tabs: [], linkTab: null, autoPicked: false };

/** Lee `Storefront.sheetTabs` sin confiar en la forma (es JSON de la base). */
export function tabsStateOf(value: unknown): SheetTabsState {
  if (!value || typeof value !== "object") return EMPTY_TABS_STATE;
  const v = value as Record<string, unknown>;
  const tabs = Array.isArray(v.tabs)
    ? v.tabs
        .filter((t): t is { name: string; rows: unknown } => Boolean(t) && typeof (t as { name?: unknown }).name === "string")
        .map((t) => ({ name: t.name, rows: Number.isFinite(Number(t.rows)) ? Number(t.rows) : 0 }))
    : [];
  return { tabs, linkTab: typeof v.linkTab === "string" ? v.linkTab : null, autoPicked: v.autoPicked === true };
}

export function missingTabMessage(name: string): string {
  return `La pestaña «${name}» ya no está en la planilla. Elegí cuál leer en Vender en NODO → Productos → Google Sheets.`;
}

export class SheetWorkbook {
  private constructor(
    private readonly grids: GridSheet[],
    readonly tabs: SheetTab[],
    private readonly headerKeys: string[]
  ) {}

  /** Tira `SheetFetchError` si el archivo no se puede leer como planilla. */
  static read(buffer: Buffer): SheetWorkbook {
    // Un xlsx es un zip. Sin esa firma, la librería lo leería como texto suelto.
    if (!isZip(buffer)) throw new SheetFetchError("Google devolvió una planilla que no pudimos abrir. Probamos de nuevo más tarde.");
    let grids: GridSheet[];
    try {
      grids = readGrid(buffer, "planilla.xlsx");
    } catch {
      throw new SheetFetchError("Google devolvió una planilla que no pudimos abrir. Probamos de nuevo más tarde.");
    }
    const analyses = grids.map(analyzeSheet);
    return new SheetWorkbook(
      grids,
      analyses.map((a) => ({ name: a.sheetName, rows: a.dataRows.length })),
      analyses.map((a) => a.normalizedHeaders.join("|"))
    );
  }

  /** La pestaña por nombre; si no está igual, sin distinguir mayúsculas ni espacios de más. */
  find(name: string): GridSheet | null {
    const exact = this.grids.find((g) => g.name === name);
    if (exact) return exact;
    const key = name.trim().toLowerCase();
    return this.grids.find((g) => g.name.trim().toLowerCase() === key) ?? null;
  }

  /** La de más productos (la primera si empatan), como hace el importador. `null` si ninguna tiene una tabla. */
  bestTab(): string | null {
    let best: SheetTab | null = null;
    for (const t of this.tabs) if (t.rows > 0 && (!best || t.rows > best.rows)) best = t;
    return best?.name ?? null;
  }

  /**
   * Qué pestaña es la que Google bajó como CSV por gid: mismos encabezados y, si
   * hay varias así, la de cantidad de filas más parecida. `null` si ninguna coincide.
   */
  matchCsv(csv: Buffer): string | null {
    let sheet: GridSheet | undefined;
    try {
      sheet = readGrid(csv, "pestaña.csv")[0];
    } catch {
      return null;
    }
    if (!sheet) return null;
    const a = analyzeSheet(sheet);
    const key = a.normalizedHeaders.join("|");
    if (!key) return null;
    const candidates = this.tabs.filter((_, i) => this.headerKeys[i] === key);
    if (candidates.length === 0) return null;
    const rows = a.dataRows.length;
    return candidates.reduce((best, t) => (Math.abs(t.rows - rows) < Math.abs(best.rows - rows) ? t : best)).name;
  }
}

export function isZip(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

/** Nombre de hoja válido para Excel (31 caracteres, sin []:*?/\). */
function safeSheetName(name: string): string {
  const clean = name.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);
  return clean || "Productos";
}

/** Nombre de archivo para el historial de cargas: "Google Sheets - Lista.xlsx". */
export function tabFileName(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `Google Sheets - ${clean || "pestaña"}.xlsx`;
}

/**
 * La pestaña sola, como xlsx de una hoja. No va como CSV a propósito: en un CSV
 * los números viajan como texto y "1234.5" leído con formato argentino (punto de
 * miles) daría 12345. En xlsx el número llega como número, igual que si el
 * comercio subiera el Excel. Se conservan las celdas unificadas (divisores por
 * marca o categoría) y los links ya resueltos.
 */
export function tabAsWorkbook(grid: GridSheet): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(grid.rows);
  if (grid.merges.length) ws["!merges"] = grid.merges.map((m) => ({ s: { r: m.r0, c: m.c0 }, e: { r: m.r1, c: m.c1 } }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(grid.name));
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Huella del contenido de la pestaña (el xlsx generado no sirve: lleva fechas). */
export function tabHash(grid: GridSheet): string {
  return createHash("sha256")
    .update(`tab\n${grid.name}\n${JSON.stringify(grid.rows)}\n${JSON.stringify(grid.merges)}`)
    .digest("hex");
}
