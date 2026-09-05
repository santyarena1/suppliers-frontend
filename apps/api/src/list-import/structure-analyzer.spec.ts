import { analyzeSheet, analyzeStructure, columnLetter, looksNumeric } from "./structure-analyzer";
import type { CellValue, GridSheet } from "./types";

function sheet(rows: CellValue[][], merges: GridSheet["merges"] = [], index = 0, name = "Hoja1"): GridSheet {
  return { index, name, rows, merges };
}

describe("analyzeSheet", () => {
  test("encuentra el encabezado debajo de un logo y un título", () => {
    const s = sheet([
      [null, null, null],
      ["ACME DISTRIBUIDORA S.A.", null, null],
      ["Lista de precios vigente al 01/09/2026", null, null],
      [],
      ["Código", "Descripción", "Precio"],
      ["A1", "Mouse inalámbrico", 1500],
      ["A2", "Teclado mecánico", 8900.5],
      ["A3", "Monitor 24", 120000],
    ]);
    const a = analyzeSheet(s);
    expect(a.headerRow).toBe(4);
    expect(a.headers).toEqual(["Código", "Descripción", "Precio"]);
    expect(a.dataRows.map((r) => r.cells[0])).toEqual(["A1", "A2", "A3"]);
    expect(a.kinds.slice(0, 4)).toEqual(["PREAMBLE", "PREAMBLE", "PREAMBLE", "PREAMBLE"]);
  });

  test("detecta divisores por marca (una sola celda) y los hereda a las filas", () => {
    const s = sheet([
      ["Código", "Producto", "Precio"],
      ["LOGITECH", null, null],
      ["L1", "Mouse M185", 1000],
      ["L2", "Teclado K120", 2000],
      ["GENIUS", null, null],
      ["G1", "Mouse DX-110", 500],
    ]);
    const a = analyzeSheet(s);
    expect(a.dividers).toEqual(["LOGITECH", "GENIUS"]);
    expect(a.dataRows.map((r) => r.divider)).toEqual(["LOGITECH", "LOGITECH", "GENIUS"]);
    expect(a.kinds[1]).toBe("DIVIDER");
  });

  test("una celda unificada a lo ancho con texto es un divisor aunque la fila tenga otras celdas vacías", () => {
    const s = sheet(
      [
        ["Código", "Producto", "Precio", "Stock"],
        ["NOTEBOOKS", null, null, null],
        ["N1", "Lenovo IdeaPad", 500000, 3],
        ["N2", "HP Pavilion", 450000, 1],
      ],
      [{ r0: 1, c0: 0, r1: 1, c1: 3 }]
    );
    const a = analyzeSheet(s);
    expect(a.kinds[1]).toBe("DIVIDER");
    expect(a.dataRows[0].divider).toBe("NOTEBOOKS");
  });

  test("las filas sueltas después del último dato son pie de página, no divisores", () => {
    const s = sheet([
      ["Código", "Producto", "Precio"],
      ["A1", "Algo", 10],
      ["A2", "Otra cosa", 20],
      [],
      ["Precios sin IVA. Válidos hasta agotar stock.", null, null],
      ["Consultas: ventas@acme.com", null, null],
    ]);
    const a = analyzeSheet(s);
    expect(a.kinds[4]).toBe("FOOTER");
    expect(a.kinds[5]).toBe("FOOTER");
    expect(a.dividers).toEqual([]);
  });

  test("salta el encabezado repetido por página", () => {
    const s = sheet([
      ["Código", "Producto", "Precio"],
      ["A1", "Uno", 10],
      ["Código", "Producto", "Precio"],
      ["A2", "Dos", 20],
    ]);
    const a = analyzeSheet(s);
    expect(a.kinds[2]).toBe("HEADER");
    expect(a.dataRows).toHaveLength(2);
  });

  test("columnas con datos pero sin título reciben un nombre por letra", () => {
    const s = sheet([
      ["Código", "Producto", null],
      ["A1", "Uno", 10],
      ["A2", "Dos", 20],
    ]);
    const a = analyzeSheet(s);
    expect(a.headers).toEqual(["Código", "Producto", "Columna C"]);
  });

  test("sin filas con números debajo, no hay encabezado", () => {
    const s = sheet([
      ["Solo", "texto"],
      ["más", "texto"],
    ]);
    const a = analyzeSheet(s);
    expect(a.headerRow).toBeNull();
    expect(a.dataRows).toEqual([]);
  });
});

describe("encabezado en dos filas", () => {
  test("las columnas sin título toman el texto de la fila de arriba (caso Sentey)", () => {
    const s = sheet([
      ["", "CÓDIGO", "DESCRIPCIÓN", "PRECIO USD", null, null, null],
      ["GABINETES KIT (calidad DELL)", null, null, null, "IVA", "SPEC", "CANTIDAD"],
      ["", "TM50", "KIT Sentey TM50", 24, 0.105, "LINK", 0],
      ["", "TM10", "KIT Sentey TM10", 27, 0.105, "LINK", 0],
    ]);
    const a = analyzeSheet(s);
    expect(a.headerRow).toBe(1);
    expect(a.headers).toEqual(["GABINETES KIT (calidad DELL)", "CÓDIGO", "DESCRIPCIÓN", "PRECIO USD", "IVA", "SPEC", "CANTIDAD"]);
  });
});

describe("analyzeStructure", () => {
  test("elige la hoja con más datos y la huella depende de los encabezados", () => {
    const portada = sheet([["Bienvenidos", null], ["a la lista", null]], [], 0, "Portada");
    const datos = sheet(
      [
        ["Código", "Producto", "Precio"],
        ["A1", "Uno", 10],
        ["A2", "Dos", 20],
      ],
      [],
      1,
      "Datos"
    );
    const a = analyzeStructure([portada, datos]);
    expect(a.chosen?.sheetName).toBe("Datos");
    const b = analyzeStructure([portada, sheet(datos.rows, [], 1, "Otra")]);
    expect(b.fingerprint).toBe(a.fingerprint);
    const c = analyzeStructure([
      portada,
      sheet([["Código", "Producto", "Precio USD"], ["A1", "Uno", 10], ["A2", "Dos", 20]], [], 1, "Datos"),
    ]);
    expect(c.fingerprint).not.toBe(a.fingerprint);
  });
});

describe("helpers", () => {
  test("looksNumeric reconoce formatos argentinos y con moneda", () => {
    expect(looksNumeric("1.234,50")).toBe(true);
    expect(looksNumeric("$ 1234.5")).toBe(true);
    expect(looksNumeric("USD 12")).toBe(true);
    expect(looksNumeric("AB-12")).toBe(false);
    expect(looksNumeric("Mouse")).toBe(false);
  });

  test("columnLetter", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
  });
});
