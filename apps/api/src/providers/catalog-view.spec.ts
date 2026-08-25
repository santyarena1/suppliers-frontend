import { applyPrice, normalizeBrandName } from "./catalog-view";

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

describe("normalizeBrandName", () => {
  it("compara marcas sin importar mayúsculas ni espacios", () => {
    expect(normalizeBrandName("  gigabyte ")).toBe(normalizeBrandName("Gigabyte"));
  });
});
