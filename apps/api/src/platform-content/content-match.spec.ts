import { type CatalogRow, type SourceProduct, matchContent, normalizeEan, normalizePartNumber } from "./content-match";

const KNOWN = new Set(["ELIT", "NEW_BYTES", "AIR", "INVID", "GRUPO_NUCLEO"]);

const row = (provider: string, externalId: string, extra: Partial<CatalogRow> = {}): CatalogRow => ({
  provider,
  externalId,
  sku: null,
  partNumber: null,
  ean: null,
  brand: null,
  ...extra,
});

const product = (id: string, extra: Partial<SourceProduct> = {}): SourceProduct => ({
  id,
  brand: null,
  ean: null,
  partNumber: null,
  supplierCodes: [],
  ...extra,
});

describe("normalizers", () => {
  it("UPC-12 y EAN-13 del mismo producto coinciden", () => {
    expect(normalizeEan("097855199966")).toBe(normalizeEan("0097855199966"));
  });

  it("descarta EAN demasiado cortos", () => {
    expect(normalizeEan("1234")).toBeNull();
  });

  it("ignora guiones y espacios en números de parte y descarta los cortos", () => {
    expect(normalizePartNumber("GV-N5060WF2MAX OC-8GD")).toBe("GVN5060WF2MAXOC8GD");
    expect(normalizePartNumber("K380")).toBeNull();
  });
});

describe("matchContent", () => {
  it("vincula un producto unificado con la ficha de cada distribuidor por su código", () => {
    const catalog = [
      row("ELIT", "19984", { partNumber: "AMDPROR5-8600G" }),
      row("NEW_BYTES", "104844", { partNumber: "100-100001237BOX" }),
      row("AIR", "213065"),
    ];
    const source = [
      product("1", {
        supplierCodes: [
          { supplier: "ELIT", code: "AMDPROR5-8600G" },
          { supplier: "NEW_BYTES", code: "100-100001237BOX" },
          { supplier: "AIR", code: "213065" },
        ],
      }),
    ];

    const { links, stats } = matchContent(source, catalog, KNOWN);

    expect(links).toHaveLength(3);
    expect(links.every((l) => l.matchedBy === "SUPPLIER_CODE" && l.contentId === "1")).toBe(true);
    expect(stats.byProvider).toEqual({ ELIT: 1, NEW_BYTES: 1, AIR: 1 });
    expect(stats.sourceMatched).toBe(1);
  });

  it("el código del distribuidor prefiere la ficha cuyo id coincide antes que otra cuyo código coincide", () => {
    const catalog = [row("GRUPO_NUCLEO", "67360"), row("GRUPO_NUCLEO", "99999", { sku: "67360" })];
    const source = [product("1", { supplierCodes: [{ supplier: "GRUPO_NUCLEO", code: "67360" }] })];

    const { links } = matchContent(source, catalog, KNOWN);

    expect(links.map((l) => l.externalId)).toEqual(["67360"]);
  });

  it("cae a EAN y a número de parte cuando no hay código del distribuidor", () => {
    const catalog = [
      row("INVID", "A1", { ean: "0730143316163" }),
      row("ELIT", "E1", { partNumber: "GV-N5060WF2MAX OC-8GD", brand: "GIGABYTE" }),
    ];
    const source = [
      product("1", { ean: "730143316163" }),
      product("2", { partNumber: "GV-N5060WF2MAXOC-8GD", brand: "Gigabyte" }),
    ];

    const { links, stats } = matchContent(source, catalog, KNOWN);

    expect(links).toEqual(
      expect.arrayContaining([
        { contentId: "1", provider: "INVID", externalId: "A1", matchedBy: "EAN" },
        { contentId: "2", provider: "ELIT", externalId: "E1", matchedBy: "PART_NUMBER" },
      ])
    );
    expect(stats.byKind).toEqual({ SUPPLIER_CODE: 0, EAN: 1, PART_NUMBER: 1 });
  });

  it("no cruza por número de parte si las marcas no coinciden", () => {
    const catalog = [row("ELIT", "E1", { partNumber: "ABC12345", brand: "Logitech" })];
    const source = [product("1", { partNumber: "ABC12345", brand: "Genius" })];

    expect(matchContent(source, catalog, KNOWN).links).toHaveLength(0);
  });

  it("el código del distribuidor le gana al EAN de otro contenido", () => {
    const catalog = [row("AIR", "500", { ean: "4719331356699" })];
    const source = [
      product("bueno", { supplierCodes: [{ supplier: "AIR", code: "500" }] }),
      product("otro", { ean: "4719331356699" }),
    ];

    const { links, stats } = matchContent(source, catalog, KNOWN);

    expect(links).toEqual([{ contentId: "bueno", provider: "AIR", externalId: "500", matchedBy: "SUPPLIER_CODE" }]);
    expect(stats.ambiguous).toBe(0);
  });

  it("no vincula una ficha que dos contenidos reclaman con la misma prioridad", () => {
    const catalog = [row("INVID", "A1", { ean: "4719331356699" })];
    const source = [product("1", { ean: "4719331356699" }), product("2", { ean: "4719331356699" })];

    const { links, stats } = matchContent(source, catalog, KNOWN);

    expect(links).toHaveLength(0);
    expect(stats.ambiguous).toBe(1);
  });

  it("cuenta los distribuidores que NODO no conoce sin romper el cruce", () => {
    const source = [product("1", { supplierCodes: [{ supplier: "MAYORISTA_X", code: "1" }] })];

    const { stats } = matchContent(source, [], KNOWN);

    expect(stats.unknownSuppliers).toEqual({ MAYORISTA_X: 1 });
    expect(stats.sourceUnmatched).toBe(1);
  });
});
