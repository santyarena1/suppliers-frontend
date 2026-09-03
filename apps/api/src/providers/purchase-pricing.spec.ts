import {
  adjustedIvaPoints,
  applySchemeDiscount,
  computePurchaseUnit,
  ivaPoints,
  parsePurchasePolicy,
  providerHasIvaRate,
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

describe("providerHasIvaRate", () => {
  it("habilita solo proveedores que informan alícuota", () => {
    expect(providerHasIvaRate("NEW_BYTES")).toBe(true);
    expect(providerHasIvaRate("ELIT")).toBe(true);
    expect(providerHasIvaRate("CEVEN")).toBe(false);
    expect(providerHasIvaRate("NEW_TREE")).toBe(false);
  });
});

describe("adjustedIvaPoints", () => {
  it("sin alícuota original no inventa REMOVE ni FLAT", () => {
    expect(adjustedIvaPoints(null, "REMOVE")).toEqual({ points: null, missingIva: true });
    expect(adjustedIvaPoints(null, "FLAT_10_5")).toEqual({ points: null, missingIva: true });
    expect(adjustedIvaPoints(null, "HALF")).toEqual({ points: null, missingIva: true });
  });

  it("REMOVE pone IVA en 0 cuando hay alícuota", () => {
    expect(adjustedIvaPoints(21, "REMOVE")).toEqual({ points: 0, missingIva: false });
  });

  it("HALF divide la alícuota", () => {
    expect(adjustedIvaPoints(21, "HALF")).toEqual({ points: 10.5, missingIva: false });
    expect(adjustedIvaPoints(10.5, "HALF")).toEqual({ points: 5.25, missingIva: false });
  });

  it("FLAT_10_5 normaliza cuando hay alícuota original", () => {
    expect(adjustedIvaPoints(21, "FLAT_10_5")).toEqual({ points: 10.5, missingIva: false });
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

  it("en esquema suma IIBB sobre el neto ya descontado", () => {
    const r = computePurchaseUnit({
      net: 100,
      ivaPercent: 21,
      iibbPercent: 3,
      ivaAdjustment: "REMOVE",
      schemeDiscountPercent: 10,
    });
    expect(r.net).toBe(90);
    expect(r.iibbAmount).toBe(2.7);
    expect(r.gross).toBe(92.7);
  });

  it("offline no suma IIBB aunque venga alícuota o monto", () => {
    const r = computePurchaseUnit({
      net: 100,
      ivaPercent: 21,
      internosAmount: 5,
      iibbAmount: 8,
      iibbPercent: 3,
      ivaAdjustment: "REMOVE",
      dropPerceptions: true,
    });
    expect(r.internosAmount).toBe(5);
    expect(r.iibbAmount).toBe(0);
    expect(r.gross).toBe(105);
  });

  it("sin alícuota, el monto de IIBB se proporcionaliza al descuento de esquema", () => {
    const r = computePurchaseUnit({
      net: 100,
      ivaPercent: 21,
      iibbAmount: 3,
      ivaAdjustment: "REMOVE",
      schemeDiscountPercent: 10,
    });
    expect(r.net).toBe(90);
    expect(r.iibbAmount).toBe(2.7);
    expect(r.gross).toBe(92.7);
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

  it("sin alícuota no inventa IVA ni con REMOVE ni con FLAT", () => {
    for (const mode of ["REMOVE", "HALF", "FLAT_10_5"] as const) {
      const r = computePurchaseUnit({
        net: 50,
        ivaPercent: null,
        ivaAdjustment: mode,
        iibbAmount: 3,
      });
      expect(r.missingIva).toBe(true);
      expect(r.ivaAmount).toBeNull();
      expect(r.gross).toBe(53);
    }
  });
});

describe("parsePurchasePolicy", () => {
  it("separa IVA de offline y de esquema", () => {
    const p = parsePurchasePolicy({
      acceptsOffline: true,
      acceptsScheme: true,
      offlineIvaAdjustment: "REMOVE",
      schemeIvaAdjustment: "HALF",
      schemeDiscountPercent: 8,
    });
    expect(p.offlineIvaAdjustment).toBe("REMOVE");
    expect(p.schemeIvaAdjustment).toBe("HALF");
    expect(p.schemeDiscountPercent).toBe(8);
  });

  it("si llega el campo viejo, lo copia a los dos", () => {
    const p = parsePurchasePolicy({
      acceptsOffline: true,
      ivaAdjustment: "FLAT_10_5",
    });
    expect(p.offlineIvaAdjustment).toBe("FLAT_10_5");
    expect(p.schemeIvaAdjustment).toBe("FLAT_10_5");
  });
});
