import { actionProgress, sumMatchingLines } from "./brand-measure";

describe("sumMatchingLines", () => {
  const orders = [
    {
      provider: "ELIT",
      items: [
        { code: "A", qty: 2, price: 10, subtotal: 20, brand: "Asus" },
        { code: "B", qty: 1, price: 5, brand: "Logitech" },
      ],
    },
    {
      provider: "NEW_BYTES",
      items: [{ externalId: "C", qty: 3, unitPrice: 8, lineTotal: 24, displayBrand: "ASUS" }],
    },
  ];

  it("cuenta unidades y USD de la marca, sin inventar si no hay brand", () => {
    expect(sumMatchingLines(orders, { brandNames: ["Asus"] })).toEqual({ qty: 5, spendUsd: 44 });
  });

  it("filtra por distribuidor", () => {
    expect(sumMatchingLines(orders, { brandNames: ["Asus"], providers: ["ELIT"] })).toEqual({
      qty: 2,
      spendUsd: 20,
    });
  });

  it("filtra por SKU de un proveedor", () => {
    expect(
      sumMatchingLines(orders, { brandNames: ["Asus"], productKeys: ["NEW_BYTES:C"] })
    ).toEqual({ qty: 3, spendUsd: 24 });
  });
});

describe("actionProgress", () => {
  it("rebate y qty usan el mismo tope de unidades", () => {
    const p = actionProgress({
      kind: "REBATE",
      targetQty: 10,
      targetAmountUsd: null,
      qty: 4,
      spendUsd: 80,
    });
    expect(p.ratio).toBeCloseTo(0.4);
    expect(p.met).toBe(false);
  });

  it("compra en USD se mide por importe", () => {
    const p = actionProgress({
      kind: "PURCHASE_AMOUNT",
      targetQty: null,
      targetAmountUsd: 100,
      qty: 1,
      spendUsd: 100,
    });
    expect(p.met).toBe(true);
  });
});
