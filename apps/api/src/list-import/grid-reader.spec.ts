import * as XLSX from "xlsx";
import { readGrid } from "./grid-reader";
import { analyzeStructure } from "./structure-analyzer";

function xlsxBuffer(sheets: { name: string; rows: unknown[][]; merges?: XLSX.Range[] }[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    if (s.merges) ws["!merges"] = s.merges;
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("readGrid", () => {
  test("lee un xlsx con dos hojas, celdas unificadas y filas en blanco conservando índices", () => {
    const buffer = xlsxBuffer([
      { name: "Portada", rows: [["Hola"]] },
      {
        name: "Lista",
        rows: [
          ["ACME", null, null],
          [],
          ["Código", "Producto", "Precio"],
          ["MARCA X", null, null],
          ["A1", "Uno", 10.5],
          ["A2", "Dos", "1.234,50"],
        ],
        merges: [{ s: { r: 3, c: 0 }, e: { r: 3, c: 2 } }],
      },
    ]);
    const sheets = readGrid(buffer, "lista.xlsx");
    expect(sheets.map((s) => s.name)).toEqual(["Portada", "Lista"]);
    const lista = sheets[1];
    expect(lista.rows[2]).toEqual(["Código", "Producto", "Precio"]);
    expect(lista.rows[4]).toEqual(["A1", "Uno", 10.5]);
    expect(lista.rows[5][2]).toBe("1.234,50");
    expect(lista.merges).toEqual([{ r0: 3, c0: 0, r1: 3, c1: 2 }]);

    const analysis = analyzeStructure(sheets);
    expect(analysis.chosen?.sheetName).toBe("Lista");
    expect(analysis.chosen?.headerRow).toBe(2);
    expect(analysis.chosen?.dataRows.map((r) => r.divider)).toEqual(["MARCA X", "MARCA X"]);
  });

  test("un texto corto con hipervínculo (LINK) vale por su URL", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["Código", "Producto", "Precio", "Spec"], ["A1", "Uno", 10, "LINK"], ["A2", "Dos", 20, "LINK"]]);
    ws["D2"].l = { Target: "https://sentey.com/tm50" };
    XLSX.utils.book_append_sheet(wb, ws, "Lista");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const sheets = readGrid(buffer, "lista.xlsx");
    expect(sheets[0].rows[1][3]).toBe("https://sentey.com/tm50");
    expect(sheets[0].rows[2][3]).toBe("LINK");
  });

  test("lee un csv dejando los números como texto (los decimales con coma se resuelven después)", () => {
    const csv = Buffer.from('Codigo,Producto,Precio\nA1,Uno,"12,5"\nA2,Dos,20\n', "utf8");
    const sheets = readGrid(csv, "lista.csv");
    expect(sheets).toHaveLength(1);
    expect(sheets[0].rows[0]).toEqual(["Codigo", "Producto", "Precio"]);
    expect(sheets[0].rows[1]).toEqual(["A1", "Uno", "12,5"]);
    expect(analyzeStructure(sheets).chosen?.dataRows).toHaveLength(2);
  });

  test("archivo ilegible: error claro o ninguna tabla", () => {
    let chosen: unknown = "no-leido";
    try {
      chosen = analyzeStructure(readGrid(Buffer.from([0x00, 0x01, 0x02]), "raro.xlsx")).chosen;
    } catch (err) {
      expect(String((err as Error).message)).toMatch(/No se pudo leer|ninguna hoja/);
      return;
    }
    expect(chosen).toBeNull();
  });
});
