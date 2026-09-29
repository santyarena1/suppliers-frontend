import { BadRequestException } from "@nestjs/common";
import { assertPortalCartMatches, portalCartDifferences } from "./cart-match";

describe("portalCartDifferences", () => {
  it("sin diferencias cuando el portal tiene exactamente lo pedido", () => {
    expect(portalCartDifferences([{ code: "A", qty: 2 }, { code: "B", qty: 1 }], [{ code: "B", qty: 1 }, { code: "A", qty: 2 }])).toEqual([]);
  });

  it("detecta cantidad aceptada menor, producto que no entró y producto de más", () => {
    const diffs = portalCartDifferences(
      [{ code: "A", qty: 5, name: "Mouse" }, { code: "B", qty: 1 }],
      [{ code: "A", qty: 2 }, { code: "C", qty: 1 }]
    );
    expect(diffs).toEqual([
      { code: "A", name: "Mouse", requested: 5, loaded: 2 },
      { code: "B", requested: 1, loaded: 0 },
      { code: "C", requested: 0, loaded: 1 },
    ]);
  });

  it("suma líneas repetidas del mismo código (un portal puede partirlas por depósito)", () => {
    expect(portalCartDifferences([{ code: "A", qty: 3 }], [{ code: "A", qty: 1 }, { code: "A", qty: 2 }])).toEqual([]);
  });

  it("compara códigos sin espacios ni ceros a la izquierda de más", () => {
    expect(portalCartDifferences([{ code: " 00123 ", qty: 1 }], [{ code: "123", qty: 1 }])).toEqual([]);
  });
});

describe("assertPortalCartMatches", () => {
  it("corta el envío y explica qué no coincide", () => {
    expect(() =>
      assertPortalCartMatches("Elit", [{ code: "A", qty: 5, name: "Mouse" }], [{ code: "A", qty: 2 }])
    ).toThrow(BadRequestException);
    expect(() =>
      assertPortalCartMatches("Elit", [{ code: "A", qty: 5, name: "Mouse" }], [{ code: "A", qty: 2 }])
    ).toThrow(/Mouse: pediste 5, Elit aceptó 2/);
  });

  it("deja pasar si coincide", () => {
    expect(() => assertPortalCartMatches("Air", [{ code: "A", qty: 1 }], [{ code: "A", qty: 1 }])).not.toThrow();
  });
});

describe("assertPortalCartMatches · ignoreExtras", () => {
  it("un renglón de más no bloquea, pero un producto con menos cantidad sí", () => {
    expect(() =>
      assertPortalCartMatches("Air", [{ code: "A", qty: 1 }], [{ code: "A", qty: 1 }, { code: "FLETE", qty: 1 }], { ignoreExtras: true })
    ).not.toThrow();
    expect(() =>
      assertPortalCartMatches("Air", [{ code: "A", qty: 3 }], [{ code: "A", qty: 1 }, { code: "FLETE", qty: 1 }], { ignoreExtras: true })
    ).toThrow(/pediste 3, Air aceptó 1/);
  });
});
