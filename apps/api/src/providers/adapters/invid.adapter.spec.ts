import { extractDetailPatch } from "./invid.adapter";

describe("extractDetailPatch", () => {
  it("marca stock 0 si la ficha de la tienda dice out of stock", () => {
    const patch = extractDetailPatch(
      `<meta name="product:availability" content="out of stock">`
    );
    expect(patch.stockStatus).toBe("Sin stock (tienda)");
    expect(patch.stock).toBe(0);
  });

  it("no inventa cantidad si la ficha dice in stock", () => {
    const patch = extractDetailPatch(
      `<meta name="product:availability" content="in stock">`
    );
    expect(patch.stockStatus).toBe("Disponible (tienda)");
    expect(patch.stock).toBeUndefined();
  });
});
