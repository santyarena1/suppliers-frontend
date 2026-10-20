import * as XLSX from "xlsx";
import { readGrid } from "../list-import/grid-reader";
import { parseNumber } from "../list-import/row-normalizer";
import { SheetFetchError } from "./sheet-source";
import { missingTabMessage, SheetWorkbook, tabAsWorkbook, tabFileName, tabHash, tabsStateOf } from "./sheet-tabs";

const LISTA = [
  ["Codigo", "Nombre", "Precio", "Stock"],
  ["A1", "Mouse Logitech G203", 1234.5, 3],
  ["A2", "Teclado Redragon Kumara", 25000, 0],
  ["7791234567890", "Monitor 24 Samsung", 189999.99, 2],
  ["A4", "Fuente 650W", 52000, 5],
];
const CLIENTES = [
  ["Nombre", "Telefono", "Mail"],
  ["Juan", "1155555555", "juan@x.com"],
  ["Ana", "1144444444", "ana@x.com"],
  ["Luis", "1133333333", "luis@x.com"],
];

/** Una planilla como la que exporta Google: varias pestañas. */
function workbook(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("pestañas de la planilla", () => {
  const wb = SheetWorkbook.read(workbook({ Clientes: CLIENTES, Lista: LISTA, Notas: [["Pedir a Elit el martes"]] }));

  it("lista cada pestaña con sus filas de datos y elige la de más productos", () => {
    expect(wb.tabs.map((t) => t.name)).toEqual(["Clientes", "Lista", "Notas"]);
    expect(wb.tabs.find((t) => t.name === "Lista")?.rows).toBe(4);
    expect(wb.tabs.find((t) => t.name === "Notas")?.rows).toBe(0);
    expect(wb.bestTab()).toBe("Lista");
  });

  it("encuentra la pestaña por nombre, con o sin mayúsculas, y avisa si no está", () => {
    expect(wb.find("Lista")?.name).toBe("Lista");
    expect(wb.find("  lista ")?.name).toBe("Lista");
    expect(wb.find("Stock viejo")).toBeNull();
    expect(missingTabMessage("Stock viejo")).toMatch(/La pestaña «Stock viejo» ya no está en la planilla/);
  });

  it("reconoce qué pestaña es la del link comparando con el CSV que bajó Google", () => {
    const csv = Buffer.from("Codigo,Nombre,Precio,Stock\nA1,Mouse,\"1.234,50\",3\nA2,Teclado,25000,0\nA3,Monitor,10,2\nA4,Fuente,52000,5\n");
    expect(wb.matchCsv(csv)).toBe("Lista");
    expect(wb.matchCsv(Buffer.from("Otra,Cosa\n1,2\n3,4\n5,6\n"))).toBeNull();
  });

  it("una planilla que no se puede abrir es un error para el dueño", () => {
    expect(() => SheetWorkbook.read(Buffer.from("PK esto no es un xlsx"))).toThrow(SheetFetchError);
  });
});

describe("la pestaña elegida como archivo de una sola hoja", () => {
  const wb = SheetWorkbook.read(workbook({ Clientes: CLIENTES, Lista: LISTA }));
  const grid = wb.find("Lista")!;

  it("el importador ve una sola hoja, con los números como números", () => {
    const sheets = readGrid(tabAsWorkbook(grid), tabFileName("Lista"));
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe("Lista");
    expect(sheets[0].rows[1]).toEqual(["A1", "Mouse Logitech G203", 1234.5, 3]);
    // Con un CSV, "1234.5" leído con formato argentino daría 12345; como número no hay dudas.
    expect(parseNumber(sheets[0].rows[1][2], "COMMA")).toBe(1234.5);
    expect(parseNumber("1234.5", "COMMA")).toBe(12345);
    expect(sheets[0].rows[3][0]).toBe("7791234567890");
  });

  it("la huella cambia solo si cambia el contenido", () => {
    const again = SheetWorkbook.read(workbook({ Clientes: CLIENTES, Lista: LISTA })).find("Lista")!;
    expect(tabHash(again)).toBe(tabHash(grid));
    const edited = LISTA.map((r) => [...r]);
    edited[1][3] = 2;
    const changed = SheetWorkbook.read(workbook({ Lista: edited })).find("Lista")!;
    expect(tabHash(changed)).not.toBe(tabHash(grid));
  });

  it("nombre de archivo limpio para el historial de cargas", () => {
    expect(tabFileName("Lista")).toBe("Google Sheets - Lista.xlsx");
    expect(tabFileName('Stock/2025: "nuevo"')).toBe("Google Sheets - Stock 2025 nuevo.xlsx");
  });
});

describe("estado guardado de las pestañas", () => {
  it("tolera datos viejos o rotos", () => {
    expect(tabsStateOf(null)).toEqual({ tabs: [], linkTab: null, autoPicked: false });
    expect(tabsStateOf({ tabs: [{ name: "Lista", rows: "4" }, { rows: 3 }, null], linkTab: 5, autoPicked: "si" })).toEqual({
      tabs: [{ name: "Lista", rows: 4 }],
      linkTab: null,
      autoPicked: false,
    });
  });
});
