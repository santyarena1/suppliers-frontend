import { extractDetailPatch, invidIvaPercent } from "./invid.adapter";

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

describe("invidIvaPercent", () => {
  it("acepta la alícuota cuando la planilla manda el porcentaje", () => {
    expect(invidIvaPercent(100, 21)).toBe(21);
    expect(invidIvaPercent(100, 10.5)).toBe(10.5);
    expect(invidIvaPercent(100, 0)).toBe(0);
  });

  it("deriva la alícuota cuando manda el importe", () => {
    expect(invidIvaPercent(1000, 210)).toBe(21);
    expect(invidIvaPercent(1000, 105)).toBe(10.5);
  });

  it("descarta lo que no puede ser un IVA en vez de inventarlo", () => {
    // El caso real: la columna venía corrida y traía 80 veces el neto.
    expect(invidIvaPercent(3.29, 263.67)).toBeUndefined();
    expect(invidIvaPercent(100, 8014.3)).toBeUndefined();
    expect(invidIvaPercent(undefined, 8014.3)).toBeUndefined();
    expect(invidIvaPercent(0, 500)).toBeUndefined();
  });

  it("sin dato no devuelve nada", () => {
    expect(invidIvaPercent(100, undefined)).toBeUndefined();
    expect(invidIvaPercent(100, Number.NaN)).toBeUndefined();
    expect(invidIvaPercent(100, -5)).toBeUndefined();
  });
});
