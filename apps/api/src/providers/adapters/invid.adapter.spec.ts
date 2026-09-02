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

  it("saca categoría/subcategoría del breadcrumb con tildes", () => {
    const patch = extractDetailPatch(
      `breadcrumb"><a href="/electrodomesticos--prod--10">Electrodomésticos</a> / <a href="/heladeras">Heladeras</a> / <li>LG`
    );
    expect(patch.category).toBe("Electrodomésticos");
    expect(patch.subcategory).toBe("Heladeras");
  });

  it("reconstruye la categoría si vino con �", () => {
    const patch = extractDetailPatch(
      `breadcrumb"><a href="/x">Electrodom\uFFFDsticos</a> / <a>Micr\uFFFDfonos</a> / <li>X`
    );
    expect(patch.category).toBe("Electrodomésticos");
    expect(patch.subcategory).toBe("Micrófonos");
  });
});
