import { type CatalogRow, type SourceProduct, matchContent } from "./content-match";

const KNOWN = new Set(["ELIT", "NEW_BYTES", "AIR", "INVID", "GRUPO_NUCLEO"]);

const row = (provider: string, externalId: string, extra: Partial<CatalogRow> = {}): CatalogRow => ({
  provider,
  externalId,
  sku: null,
  partNumber: null,
  ...extra,
});

const product = (id: string, supplierCodes: SourceProduct["supplierCodes"] = []): SourceProduct => ({ id, supplierCodes });

describe("matchContent", () => {
  it("un producto agrupado en AcuStock repite su contenido en la ficha de cada distribuidor", () => {
    const catalog = [
      row("ELIT", "19984", { partNumber: "AMDPROR5-8600G" }),
      row("NEW_BYTES", "104844", { partNumber: "100-100001237BOX" }),
      row("AIR", "213065"),
    ];
    const source = [
      product("1", [
        { supplier: "ELIT", code: "AMDPROR5-8600G" },
        { supplier: "NEW_BYTES", code: "100-100001237BOX" },
        { supplier: "AIR", code: "213065" },
      ]),
    ];

    const { links, stats } = matchContent(source, catalog, KNOWN);

    expect(links.map((l) => `${l.provider}:${l.externalId}`).sort()).toEqual(["AIR:213065", "ELIT:19984", "NEW_BYTES:104844"]);
    expect(links.every((l) => l.contentId === "1")).toBe(true);
    expect(stats.byProvider).toEqual({ ELIT: 1, NEW_BYTES: 1, AIR: 1 });
  });

  it("no suma fichas de otros distribuidores que AcuStock no agrupó, aunque compartan EAN o número de parte", () => {
    const catalog = [
      row("ELIT", "19984", { partNumber: "AMDPROR5-8600G" }),
      row("INVID", "X1", { partNumber: "AMDPROR5-8600G" }),
    ];
    const source = [product("1", [{ supplier: "ELIT", code: "AMDPROR5-8600G" }])];

    const { links } = matchContent(source, catalog, KNOWN);

    expect(links.map((l) => l.provider)).toEqual(["ELIT"]);
  });

  it("si el código coincide con el id de una ficha, gana sobre otra cuyo código coincide", () => {
    const catalog = [row("GRUPO_NUCLEO", "67360"), row("GRUPO_NUCLEO", "99999", { sku: "67360" })];

    const { links } = matchContent([product("1", [{ supplier: "GRUPO_NUCLEO", code: "67360" }])], catalog, KNOWN);

    expect(links.map((l) => l.externalId)).toEqual(["67360"]);
  });

  it("no vincula una ficha que dos productos reclaman", () => {
    const catalog = [row("AIR", "500")];
    const source = [product("1", [{ supplier: "AIR", code: "500" }]), product("2", [{ supplier: "AIR", code: "500" }])];

    const { links, stats } = matchContent(source, catalog, KNOWN);

    expect(links).toHaveLength(0);
    expect(stats.ambiguous).toBe(1);
  });

  it("cuenta los productos sin códigos y los distribuidores que NODO no conoce", () => {
    const source = [product("1"), product("2", [{ supplier: "MAYORISTA_X", code: "1" }])];

    const { stats } = matchContent(source, [], KNOWN);

    expect(stats.sourceWithoutCodes).toBe(1);
    expect(stats.unknownSuppliers).toEqual({ MAYORISTA_X: 1 });
    expect(stats.sourceUnmatched).toBe(2);
  });
});
