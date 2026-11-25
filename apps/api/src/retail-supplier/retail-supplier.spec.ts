import { compragamerImageUrl } from "../retail/retail-compragamer.client";
import { listDiscountKey, listDiscountPercent, NO_RULES, type OfferRules } from "../providers/catalog-view";
import { compragamerCartUrl } from "./retail-supplier.service";

describe("Descuentos sobre la lista de un local", () => {
  const rules: OfferRules = {
    ...NO_RULES,
    baseListDiscountPercent: 5,
    listDiscountRules: {
      byBrand: { [listDiscountKey("BRAND", "Logitech G")]: 12 },
      byCategory: { [listDiscountKey("CATEGORY", "Placas de Video")]: 8 },
    },
  };

  it("gana la marca, después la categoría, después el general", () => {
    expect(listDiscountPercent(rules, "LOGITECH-G", "Placas de video")).toBe(12);
    expect(listDiscountPercent(rules, "Asus", "placas  de vídeo")).toBe(8);
    expect(listDiscountPercent(rules, "Asus", "Monitores")).toBe(5);
    expect(listDiscountPercent(rules, null, null)).toBe(5);
  });

  it("una regla en 0 % también gana (excluye esa marca del general)", () => {
    const zero: OfferRules = { ...rules, listDiscountRules: { byBrand: { asus: 0 }, byCategory: {} } };
    expect(listDiscountPercent(zero, "ASUS", "Monitores")).toBe(0);
  });

  it("sin reglas queda el general", () => {
    expect(listDiscountPercent({ ...NO_RULES, baseListDiscountPercent: 3 }, "Asus", "x")).toBe(3);
    expect(listDiscountPercent(NO_RULES, "Asus", "x")).toBe(0);
  });
});

describe("Carrito de Compra Gamer por link", () => {
  it("arma listado_prod cantidad-id", () => {
    expect(compragamerCartUrl([{ compragamerId: 12345, qty: 2 }, { compragamerId: 678, qty: 1 }])).toBe(
      "https://compragamer.com/carro-compras?listado_prod=2-12345%2C1-678"
    );
  });

  it("sin id de algún producto no arma un carrito incompleto", () => {
    expect(compragamerCartUrl([{ compragamerId: 1, qty: 1 }, { compragamerId: null, qty: 1 }])).toBeNull();
    expect(compragamerCartUrl([])).toBeNull();
  });
});

describe("compragamerImageUrl", () => {
  it("usa la foto de menor orden en tamaño original", () => {
    expect(
      compragamerImageUrl([
        { nombre: "1228_Estab_240ffe5a", orden: 2 },
        { nombre: "1226_Estab_63a535eb", orden: 1 },
      ])
    ).toBe("https://imagenes.compragamer.com/productos/compragamer_Imganen_general_1226_Estab_63a535eb.jpg");
  });
  it("sin fotos devuelve null", () => {
    expect(compragamerImageUrl([])).toBeNull();
    expect(compragamerImageUrl(undefined)).toBeNull();
  });
});
