import { detectNumberFormat, normalizeRows, parseNumber } from "./row-normalizer";
import type { ImportProfileSpec, SheetAnalysis } from "./types";

function sheetOf(headers: string[], rows: (string | number | null)[][], dividers: (string | null)[] = []): SheetAnalysis {
  return {
    sheetIndex: 0,
    sheetName: "Hoja1",
    headerRow: 0,
    headers,
    normalizedHeaders: headers.map((h) => h.toLowerCase()),
    dataRows: rows.map((cells, i) => ({ index: i + 1, cells, divider: dividers[i] ?? null })),
    dividers: dividers.filter((d): d is string => Boolean(d)),
    rowsTotal: rows.length + 1,
    kinds: [],
  };
}

const baseProfile: ImportProfileSpec = {
  sheetIndex: 0,
  headerRow: 0,
  columnMap: { Código: "externalId", Producto: "name", Precio: "price", Marca: "brand" },
  currency: "ARS",
  priceIncludesIva: false,
  ivaPercent: null,
  numberFormat: "COMMA",
  dividerMeaning: "IGNORE",
};

describe("parseNumber", () => {
  test("formato con coma decimal", () => {
    expect(parseNumber("1.234,50", "COMMA")).toBe(1234.5);
    expect(parseNumber("$ 12,5", "COMMA")).toBe(12.5);
    expect(parseNumber("1234", "COMMA")).toBe(1234);
  });
  test("formato con punto decimal", () => {
    expect(parseNumber("1,234.50", "DOT")).toBe(1234.5);
    expect(parseNumber("USD 99.9", "DOT")).toBe(99.9);
  });
  test("números de Excel pasan tal cual; basura devuelve null", () => {
    expect(parseNumber(1500.25, "COMMA")).toBe(1500.25);
    expect(parseNumber("consultar", "COMMA")).toBeNull();
    expect(parseNumber(null, "COMMA")).toBeNull();
  });
});

describe("detectNumberFormat", () => {
  test("decide por el último separador", () => {
    expect(detectNumberFormat(["1.234,50", "99,00"])).toBe("COMMA");
    expect(detectNumberFormat(["1,234.50", "99.00"])).toBe("DOT");
    expect(detectNumberFormat([1234, 99])).toBe("COMMA");
  });
});

describe("normalizeRows", () => {
  test("mapea columnas, parsea precios y arma raw con el divisor", () => {
    const sheet = sheetOf(
      ["Código", "Producto", "Precio", "Marca"],
      [
        ["A1", "Mouse", "1.500,00", "Logitech"],
        ["A2", "Teclado", 2000, null],
      ],
      [null, "GENIUS"]
    );
    const { items, issues } = normalizeRows(sheet, { ...baseProfile, dividerMeaning: "BRAND" });
    expect(issues).toEqual([]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ externalId: "A1", name: "Mouse", price: 1500, brand: "Logitech", currency: "ARS" });
    expect(items[1]).toMatchObject({ externalId: "A2", brand: "GENIUS" });
    expect((items[1].raw as Record<string, unknown>)._divisor).toBe("GENIUS");
  });

  test("precio con IVA incluido: deriva el neto; precio neto con IVA conocido: deriva el final", () => {
    const sheet = sheetOf(["Código", "Producto", "Precio"], [["A1", "Algo", 121]]);
    const conIva = normalizeRows(sheet, { ...baseProfile, priceIncludesIva: true, ivaPercent: 21 }).items[0];
    expect(conIva.finalPrice).toBe(121);
    expect(conIva.price).toBe(100);
    const neto = normalizeRows(sheet, { ...baseProfile, ivaPercent: 21 }).items[0];
    expect(neto.price).toBe(121);
    expect(neto.finalPrice).toBeCloseTo(146.41, 2);
  });

  test("sin columna de código, genera uno estable a partir de nombre y marca", () => {
    const sheet = sheetOf(["Producto", "Precio", "Marca"], [["Mouse M185", 10, "Logitech"]]);
    const profile: ImportProfileSpec = { ...baseProfile, columnMap: { Producto: "name", Precio: "price", Marca: "brand" } };
    const first = normalizeRows(sheet, profile).items[0].externalId;
    const again = normalizeRows(sheet, profile).items[0].externalId;
    expect(first).toMatch(/^H-[0-9a-f]{16}$/);
    expect(again).toBe(first);
    const otherBrand = normalizeRows(sheetOf(["Producto", "Precio", "Marca"], [["Mouse M185", 10, "Genius"]]), profile).items[0].externalId;
    expect(otherBrand).not.toBe(first);
  });

  test("deja issues en vez de descartar en silencio", () => {
    const sheet = sheetOf(
      ["Código", "Producto", "Precio"],
      [
        ["A1", "Uno", "consultar"],
        ["A2", null, 10],
        ["A1", "Uno repetido", 20],
      ]
    );
    const { items, issues } = normalizeRows(sheet, baseProfile);
    expect(items.map((i) => i.externalId)).toEqual(["A1"]);
    expect(items[0].price).toBeUndefined();
    expect(issues.map((i) => i.row)).toEqual([2, 2, 3, 4]);
    expect(issues.some((i) => i.message.includes("repetido"))).toBe(true);
    expect(issues.some((i) => i.message.includes("sin nombre"))).toBe(true);
  });
});
