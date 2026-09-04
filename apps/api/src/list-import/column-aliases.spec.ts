import { countAliasHits, guessColumnMap, normalizeHeader } from "./column-aliases";

describe("guessColumnMap", () => {
  test("mapea encabezados típicos en español, ignorando acentos y mayúsculas", () => {
    const map = guessColumnMap(["CÓDIGO", "Descripción", "Precio USD", "Marca", "Stock", "Notas internas"]);
    expect(map).toEqual({
      CÓDIGO: "externalId",
      Descripción: "name",
      "Precio USD": "price",
      Marca: "brand",
      Stock: "stock",
      "Notas internas": null,
    });
  });

  test("cada campo se asigna una sola vez y el SKU hace de código si no hay otro", () => {
    const map = guessColumnMap(["SKU", "Producto", "Precio", "Precio Final"]);
    expect(map.SKU).toBe("externalId");
    expect(map.Producto).toBe("name");
    expect(map.Precio).toBe("price");
    expect(map["Precio Final"]).toBe("finalPrice");
  });

  test("countAliasHits y normalizeHeader", () => {
    expect(normalizeHeader("  Precio c/IVA ")).toBe("preciociva");
    expect(countAliasHits(["Código", "Precio", "Lo que sea"])).toBe(2);
  });
});
