import { applyPrice, normalizeBrandName, brandDiscountAppliesToClient } from "./catalog-view";

describe("applyPrice", () => {
  it("deja el crudo si no hay descuento ni markup", () => {
    expect(applyPrice(100, 0, 0, 0)).toBe(100);
  });

  it("aplica el descuento de cuenta antes del markup", () => {
    // 10% de cuenta sobre 100 = 90; 10% de markup = 99
    expect(applyPrice(100, 10, 0, 10)).toBe(99);
  });

  it("apila cuenta, marca y markup en ese orden", () => {
    // 10% cuenta → 90; 10% marca → 81; 10% markup → 89.1
    expect(applyPrice(100, 10, 10, 10)).toBe(89.1);
  });

  it("devuelve null si no hay precio", () => {
    expect(applyPrice(null, 10, 0, 0)).toBeNull();
  });
});

describe("brandDiscountAppliesToClient", () => {
  it("la lista general aplica a cualquier local", () => {
    expect(brandDiscountAppliesToClient(true, [], "local-a")).toBe(true);
  });

  it("si no es general, solo aplica a los locales asignados", () => {
    expect(brandDiscountAppliesToClient(false, ["local-a"], "local-a")).toBe(true);
    expect(brandDiscountAppliesToClient(false, ["local-a"], "local-b")).toBe(false);
  });
});
