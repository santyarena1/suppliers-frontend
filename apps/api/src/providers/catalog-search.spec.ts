import { scoreCatalogMatch, searchTokens } from "./catalog-search";

describe("searchTokens", () => {
  it("parte la consulta en palabras", () => {
    expect(searchTokens("monitor msi")).toEqual(["monitor", "msi"]);
  });

  it("ignora acentos, signos y espacios de más", () => {
    expect(searchTokens("  Monitor   27''  MSI  ")).toEqual(["monitor", "27", "msi"]);
    expect(searchTokens("i7-12700")).toEqual(["i7", "12700"]);
    expect(searchTokens("teclado mecánico")).toEqual(["teclado", "mecanico"]);
  });

  it("no repite la misma palabra ni devuelve nada cuando no hay texto", () => {
    expect(searchTokens("msi msi")).toEqual(["msi"]);
    expect(searchTokens("   ")).toEqual([]);
    expect(searchTokens("!!!")).toEqual([]);
  });

  it("corta a un máximo para no armar consultas infinitas", () => {
    expect(searchTokens("a b c d e f g h i j").length).toBe(8);
  });
});

describe("scoreCatalogMatch", () => {
  const q = "monitor msi";
  const tokens = searchTokens(q);

  it("pone primero el que dice la frase tal cual", () => {
    const exacto = { name: "MONITOR MSI PRO MP223", brand: "MSI" };
    // Es el caso que motivó todo: Air lo nombra con el tamaño en el medio.
    const intercalado = { name: "MONITOR 24 MSI PRO MP243", brand: "MSI" };
    expect(scoreCatalogMatch(exacto, q, tokens)).toBeGreaterThan(
      scoreCatalogMatch(intercalado, q, tokens),
    );
  });

  it("igual puntúa al que tiene todas las palabras aunque estén separadas", () => {
    const intercalado = { name: "MONITOR 24 MSI PRO MP243", brand: "MSI" };
    expect(scoreCatalogMatch(intercalado, q, tokens)).toBeGreaterThan(0);
  });

  it("prefiere las palabras en el nombre antes que solo en la marca", () => {
    const enNombre = { name: "MONITOR MSI G274F", brand: "MSI" };
    const soloMarca = { name: "MONITOR G274F", brand: "MSI" };
    expect(scoreCatalogMatch(enNombre, q, tokens)).toBeGreaterThan(
      scoreCatalogMatch(soloMarca, q, tokens),
    );
  });

  it("no se cae con productos sin nombre", () => {
    expect(scoreCatalogMatch({ name: null, brand: "MSI" }, q, tokens)).toBe(0);
    expect(scoreCatalogMatch({}, q, tokens)).toBe(0);
  });
});

describe("buscar por código (SKU, part number, EAN)", () => {
  const product = { name: "Placa de video ASUS Dual RTX 4060", brand: "ASUS", sku: "ELI-19922", partNumber: "DUAL-RTX4060-O8G", ean: "4711081976386", externalId: "19922" };

  it("el código exacto va primero, aunque se escriba sin guiones o en minúsculas", () => {
    const exact = scoreCatalogMatch(product, "dual-rtx4060-o8g", searchTokens("dual-rtx4060-o8g"));
    const loose = scoreCatalogMatch(product, "dualrtx4060o8g", searchTokens("dualrtx4060o8g"));
    const byName = scoreCatalogMatch({ name: "Placa de video MSI RTX 4060 Ventus" }, "rtx 4060", searchTokens("rtx 4060"));
    expect(exact).toBeGreaterThanOrEqual(1000);
    expect(loose).toBeGreaterThanOrEqual(1000);
    expect(exact).toBeGreaterThan(byName);
  });

  it("también por EAN o por el código del distribuidor", () => {
    expect(scoreCatalogMatch(product, "4711081976386", searchTokens("4711081976386"))).toBeGreaterThanOrEqual(1000);
    expect(scoreCatalogMatch(product, "19922", searchTokens("19922"))).toBeGreaterThanOrEqual(1000);
  });

  it("un pedazo del código suma, pero menos que el código entero", () => {
    const part = scoreCatalogMatch(product, "rtx4060", searchTokens("rtx4060"));
    expect(part).toBeGreaterThanOrEqual(200);
    expect(part).toBeLessThan(1000);
  });
});
