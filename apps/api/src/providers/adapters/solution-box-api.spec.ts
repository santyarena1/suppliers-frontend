import { SolutionBoxAdapter, mapSolutionBoxApiArticles } from "./solution-box.adapter";
import { apiCurrency, mapSolutionBoxApiArticle } from "../solution-box.parser";
import { SolutionBoxApiClient } from "../solution-box-api-client";
import { SolutionBoxWebClient } from "../solution-box-web-client";
import type { NormalizedProduct } from "../types";

/** Artículo con los campos que lee AcuStock de GET /api/listas/articulos. */
const MONITOR = {
  Alias: "SBMON27",
  Numero_de_Parte: "27G2SP",
  Descripcion: "Monitor AOC 27 165Hz",
  Detalle: "Panel IPS 27 pulgadas, 165 Hz, 1 ms.",
  Precio: "180.50",
  Moneda: "USD",
  Cotizacion: 1450,
  Tasa_IVA: 10.5,
  Tasa_Impuestos_Internos: 10.5,
  Stock: 12,
  Marca: "AOC",
  Categorias: "Monitores > Gamer",
};

describe("mapSolutionBoxApiArticle", () => {
  it("mapea un artículo con IVA e impuestos internos", () => {
    const item = mapSolutionBoxApiArticle(MONITOR)!;
    expect(item).toMatchObject({
      externalId: "SBMON27",
      sku: "SBMON27",
      partNumber: "27G2SP",
      name: "Monitor AOC 27 165Hz",
      brand: "AOC",
      category: "Monitores",
      subcategory: "Gamer",
      description: "Panel IPS 27 pulgadas, 165 Hz, 1 ms.",
      price: 180.5,
      currency: "USD",
      ivaPercent: 10.5,
      stock: 12,
      productUrl: "https://www.solutionbox.com.ar/detalle?sku=SBMON27",
    });
    // 180,50 × (1 + 10,5 % + 10,5 %)
    expect(item.finalPrice).toBe(218.405);
    expect(item.longDescription).toBeUndefined();
    expect(item.imageUrl).toBeUndefined();
  });

  it("sin internos no inventa precio final; sin precio no hay moneda", () => {
    const sinInternos = mapSolutionBoxApiArticle({ ...MONITOR, Tasa_Impuestos_Internos: 0 })!;
    expect(sinInternos.finalPrice).toBeUndefined();
    expect(sinInternos.ivaPercent).toBe(10.5);
    const sinPrecio = mapSolutionBoxApiArticle({ ...MONITOR, Precio: 0, Stock: 0 })!;
    expect(sinPrecio.price).toBeUndefined();
    expect(sinPrecio.currency).toBeUndefined();
    expect(sinPrecio.finalPrice).toBeUndefined();
    expect(sinPrecio.stock).toBe(0);
  });

  it("sin Alias usa el número de parte; sin nombre se descarta", () => {
    const porParte = mapSolutionBoxApiArticle({ ...MONITOR, Alias: "" })!;
    expect(porParte.externalId).toBe("27G2SP");
    expect(porParte.partNumber).toBeUndefined();
    expect(mapSolutionBoxApiArticle({ ...MONITOR, Descripcion: " " })).toBeNull();
    expect(mapSolutionBoxApiArticle("basura")).toBeNull();
  });

  it("categoría simple y stock negativo", () => {
    const item = mapSolutionBoxApiArticle({ ...MONITOR, Categorias: "Monitores", Stock: -3 })!;
    expect(item.category).toBe("Monitores");
    expect(item.subcategory).toBeUndefined();
    expect(item.stock).toBe(0);
  });

  it("moneda: vacía es USD (como AcuStock), pesos es ARS, lo raro queda sin informar", () => {
    expect(apiCurrency("")).toBe("USD");
    expect(apiCurrency("u$s")).toBe("USD");
    expect(apiCurrency("DOLARES")).toBe("USD");
    expect(apiCurrency("$")).toBe("ARS");
    expect(apiCurrency("PESOS")).toBe("ARS");
    expect(apiCurrency("EUR")).toBeUndefined();
  });
});

describe("mapSolutionBoxApiArticles", () => {
  it("descarta repetidos e inválidos", () => {
    const items = mapSolutionBoxApiArticles([MONITOR, { ...MONITOR, Precio: 1 }, { Alias: "X" }, null]);
    expect(items.map((i) => i.externalId)).toEqual(["SBMON27"]);
    expect(items[0].price).toBe(180.5);
  });
});

describe("SolutionBoxAdapter con API oficial", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sincroniza desde la API y no toca el portal", async () => {
    const listArticles = jest.fn().mockResolvedValue([MONITOR, { ...MONITOR, Alias: "SB2", Descripcion: "Otro" }]);
    jest.spyOn(SolutionBoxApiClient, "fromCredentials").mockReturnValue({ listArticles } as unknown as SolutionBoxApiClient);
    const login = jest.spyOn(SolutionBoxWebClient, "login").mockRejectedValue(new Error("no debería loguear al portal"));
    const pages: NormalizedProduct[][] = [];
    const onMeta = jest.fn().mockResolvedValue(undefined);
    await new SolutionBoxAdapter().syncAll(
      { sb_api_user: "acme", sb_api_password: "x", email: "a@b.com", password: "y" },
      async (items) => {
        pages.push(items);
      },
      onMeta
    );
    expect(listArticles).toHaveBeenCalledTimes(1);
    expect(login).not.toHaveBeenCalled();
    expect(onMeta).toHaveBeenCalledWith({ expectedTotal: 2 });
    expect(pages.flat().map((i) => i.externalId)).toEqual(["SBMON27", "SB2"]);
  });

  it("sin datos de API sigue por el portal", async () => {
    const fromCredentials = jest.spyOn(SolutionBoxApiClient, "fromCredentials");
    jest.spyOn(SolutionBoxWebClient, "login").mockRejectedValue(new Error("portal"));
    await expect(new SolutionBoxAdapter().syncAll({ email: "a@b.com", password: "y" }, async () => undefined)).rejects.toThrow("portal");
    expect(fromCredentials).not.toHaveBeenCalled();
  });

  it("un listado vacío es error, no un catálogo vacío", async () => {
    jest.spyOn(SolutionBoxApiClient, "fromCredentials").mockReturnValue({
      listArticles: jest.fn().mockResolvedValue([]),
    } as unknown as SolutionBoxApiClient);
    await expect(
      new SolutionBoxAdapter().syncAll({ sb_api_user: "acme", sb_api_password: "x" }, async () => undefined)
    ).rejects.toThrow(/no devolvió artículos/);
  });

  it("con API sola no pide fichas al portal", async () => {
    const login = jest.spyOn(SolutionBoxWebClient, "login");
    const onItem = jest.fn();
    await new SolutionBoxAdapter().enrichDetails({ sb_api_user: "acme", sb_api_password: "x" }, ["SB1"], onItem);
    expect(login).not.toHaveBeenCalled();
    expect(onItem).not.toHaveBeenCalled();
  });
});
