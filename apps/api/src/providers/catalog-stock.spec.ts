import {
  catalogStockWhere,
  displayedStock,
  hidesZeroStockFromCatalog,
  isDisplayedInStock,
  parseIncludeOutOfStock,
} from "./catalog-stock";

describe("displayedStock", () => {
  it("deja el stock tal cual si no hay umbral", () => {
    expect(displayedStock(0, 0)).toBe(0);
    expect(displayedStock(4, 0)).toBe(4);
    expect(displayedStock(null, 0)).toBeNull();
  });

  it("trata como 0 lo que está en o debajo del umbral", () => {
    expect(displayedStock(1, 1)).toBe(0);
    expect(displayedStock(5, 5)).toBe(0);
    expect(displayedStock(6, 5)).toBe(6);
  });
});

describe("isDisplayedInStock", () => {
  it("el stock desconocido se muestra: no es lo mismo que 0", () => {
    expect(isDisplayedInStock(null, 0)).toBe(true);
    expect(isDisplayedInStock(undefined, 5)).toBe(true);
  });

  it("oculta 0 y lo que el umbral convierte en 0", () => {
    expect(isDisplayedInStock(0, 0)).toBe(false);
    expect(isDisplayedInStock(2, 2)).toBe(false);
    expect(isDisplayedInStock(3, 2)).toBe(true);
  });
});

describe("hidesZeroStockFromCatalog", () => {
  it("KEEP (o sin config) deja ver stock 0", () => {
    expect(hidesZeroStockFromCatalog("KEEP")).toBe(false);
    expect(hidesZeroStockFromCatalog(null)).toBe(false);
    expect(hidesZeroStockFromCatalog(undefined)).toBe(false);
    expect(hidesZeroStockFromCatalog("")).toBe(false);
  });

  it("HIDE y DELETE no listan stock 0", () => {
    expect(hidesZeroStockFromCatalog("HIDE")).toBe(true);
    expect(hidesZeroStockFromCatalog("DELETE")).toBe(true);
  });
});

describe("catalogStockWhere", () => {
  it("sin filtro si piden ver sin stock o la config es mostrar igual", () => {
    expect(catalogStockWhere(true, 5, "HIDE")).toEqual({});
    expect(catalogStockWhere(false, 5, "KEEP")).toEqual({});
    expect(catalogStockWhere(false, 5)).toEqual({});
  });

  it("con HIDE deja pasar null o stock por encima del umbral", () => {
    expect(catalogStockWhere(false, 0, "HIDE")).toEqual({
      OR: [{ stock: null }, { stock: { gt: 0 } }],
    });
    expect(catalogStockWhere(false, 5, "DELETE")).toEqual({
      OR: [{ stock: null }, { stock: { gt: 5 } }],
    });
  });
});

describe("parseIncludeOutOfStock", () => {
  it("acepta true/1", () => {
    expect(parseIncludeOutOfStock("true")).toBe(true);
    expect(parseIncludeOutOfStock("1")).toBe(true);
    expect(parseIncludeOutOfStock(["true"])).toBe(true);
  });

  it("cualquier otra cosa es false", () => {
    expect(parseIncludeOutOfStock()).toBe(false);
    expect(parseIncludeOutOfStock("false")).toBe(false);
    expect(parseIncludeOutOfStock("")).toBe(false);
  });
});
