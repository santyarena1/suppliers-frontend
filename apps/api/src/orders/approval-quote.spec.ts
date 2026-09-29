import { normalizeApprovalQuote } from "./approval-quote";

describe("normalizeApprovalQuote", () => {
  it("toma la forma común (Elit, Air, Solution Box)", () => {
    const quote = normalizeApprovalQuote({
      items: [{ code: "A1", name: "Mouse", qty: 2, price: 10.5, subtotal: 21 }],
      subtotal: 21,
      total: 25.41,
      currency: "USD",
    });
    expect(quote).toEqual({
      lines: [{ code: "A1", name: "Mouse", qty: 2, price: 10.5, subtotal: 21 }],
      subtotal: 21,
      total: 25.41,
      currency: "USD",
      problems: [],
    });
  });

  it("tolera nombres distintos y calcula el subtotal de la línea si falta", () => {
    const quote = normalizeApprovalQuote({
      items: [{ productId: 77, description: "SSD", quantity: 3, unitPrice: "12" }],
      subtotalUsd: 36,
      itemErrors: [{ code: "X9", message: "Sin stock" }],
    });
    expect(quote.lines[0]).toEqual({ code: "77", name: "SSD", qty: 3, price: 12, subtotal: 36 });
    expect(quote.subtotal).toBe(36);
    expect(quote.total).toBeNull();
    expect(quote.problems).toEqual([{ code: "X9", message: "Sin stock" }]);
  });

  it("un preview vacío no rompe", () => {
    expect(normalizeApprovalQuote(null)).toMatchObject({ lines: [], subtotal: null, currency: "USD" });
  });
});
