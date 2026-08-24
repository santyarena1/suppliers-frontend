import {
  adjustedIvaPoints,
  applySchemeDiscount,
  computePurchaseUnit,
  ivaPoints,
} from "@nodo/shared";

describe("ivaPoints", () => {
  it("acepta 21 y 0.21 como 21 puntos", () => {
    expect(ivaPoints(21)).toBe(21);
    expect(ivaPoints(0.21)).toBe(21);
    expect(ivaPoints(10.5)).toBe(10.5);
    expect(ivaPoints(0)).toBe(0);
    expect(ivaPoints(null)).toBeNull();
  });
});

describe("adjustedIvaPoints", () => {
  it("REMOVE pone IVA en 0 aunque no haya alícuota original", () => {
    expect(adjustedIvaPoints(21, "REMOVE")).toEqual({ points: 0, missingIva: false });
    expect(adjustedIvaPoints(null, "REMOVE")).toEqual({ points: 0, missingIva: false });
  });

  it("HALF divide la alícuota y avisa si falta", () => {
    expect(adjustedIvaPoints(21, "HALF")).toEqual({ points: 10.5, missingIva: false });
    expect(adjustedIvaPoints(10.5, "HALF")).toEqual({ points: 5.25, missingIva: false });
    expect(adjustedIvaPoints(null, "HALF")).toEqual({ points: null, missingIva: true });
  });

  it("FLAT_10_5 ignora la alícuota original", () => {
    expect(adjustedIvaPoints(21, "FLAT_10_5")).toEqual({ points: 10.5, missingIva: false });
    expect(adjustedIvaPoints(null, "FLAT_10_5")).toEqual({ points: 10.5, missingIva: false });
  });
});

describe("computePurchaseUnit", () => {
  it("descuenta IVA y deja internos", () => {
    const r = computePurchaseUnit({
      net: 100,
      ivaPercent: 21,
      internosAmount: 5,
      iibbAmount: 2,
      ivaAdjustment: "REMOVE",
    });
    expect(r.net).toBe(100);
    expect(r.ivaAmount).toBe(0);
    expect(r.internosAmount).toBe(5);
    expect(r.iibbAmount).toBe(2);
    expect(r.gross).toBe(107);
    expect(r.missingIva).toBe(false);
  });

  it("deja la mitad del IVA sobre el neto", () => {
    const r = computePurchaseUnit({
      net: 200,
      ivaPercent: 21,
      ivaAdjustment: "HALF",
    });
    expect(r.ivaPercent).toBe(10.5);
    expect(r.ivaAmount).toBe(21);
    expect(r.gross).toBe(221);
  });

  it("normaliza a 10,5% aunque el producto sea 21", () => {
    const r = computePurchaseUnit({
      net: 100,
      ivaPercent: 21,
      ivaAdjustment: "FLAT_10_5",
    });
    expect(r.ivaPercent).toBe(10.5);
    expect(r.ivaAmount).toBe(10.5);
    expect(r.gross).toBe(110.5);
  });

  it("aplica el descuento de esquema sobre el neto y después el IVA", () => {
    const r = computePurchaseUnit({
      net: 100,
      ivaPercent: 21,
      ivaAdjustment: "REMOVE",
      schemeDiscountPercent: 10,
    });
    expect(applySchemeDiscount(100, 10)).toBe(90);
    expect(r.net).toBe(90);
    expect(r.ivaAmount).toBe(0);
    expect(r.gross).toBe(90);
    expect(r.schemeDiscountPercent).toBe(10);
  });

  it("en esquema con HALF: 10% off y mitad de 21%", () => {
    const r = computePurchaseUnit({
      net: 100,
      ivaPercent: 21,
      internosAmount: 4,
      ivaAdjustment: "HALF",
      schemeDiscountPercent: 10,
    });
    expect(r.net).toBe(90);
    expect(r.ivaPercent).toBe(10.5);
    expect(r.ivaAmount).toBe(9.45);
    expect(r.internosAmount).toBe(4);
    expect(r.gross).toBe(103.45);
  });

  it("HALF sin alícuota no inventa 21%", () => {
    const r = computePurchaseUnit({
      net: 50,
      ivaPercent: null,
      ivaAdjustment: "HALF",
    });
    expect(r.missingIva).toBe(true);
    expect(r.ivaAmount).toBeNull();
    expect(r.gross).toBe(50);
  });
});
