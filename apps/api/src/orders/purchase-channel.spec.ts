import { providerHasIvaRate, providerPricesFromList } from "@nodo/shared";

describe("canal de compra según el proveedor", () => {
  it.each(["ASHIR", "GC", "HDC"])("%s no tiene integración: siempre por lista aunque la config diga API", (provider) => {
    expect(providerPricesFromList(provider, "API")).toBe(true);
    expect(providerPricesFromList(provider, null)).toBe(true);
    expect(providerHasIvaRate(provider, "API")).toBe(true);
  });

  it("un proveedor con integración respeta el canal guardado", () => {
    expect(providerPricesFromList("ELIT", "API")).toBe(false);
    expect(providerPricesFromList("ELIT", "LIST")).toBe(true);
  });

  it("las listas propias (LIST_*) son siempre por lista", () => {
    expect(providerPricesFromList("LIST_SENTEY", "API")).toBe(true);
  });
});
