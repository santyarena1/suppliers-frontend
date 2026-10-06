import { orderedLines, removeOrderedFromCart } from "./cart-order-reconcile";

const line = (externalId: string, qty: number, extra: Record<string, unknown> = {}) => ({
  provider: "ELIT",
  externalId,
  channel: "online",
  schemeId: null,
  qty,
  by: { ana: qty },
  ...extra,
});

describe("sacar del carrito lo que ya se pidió", () => {
  it("lee los ítems del pedido ({ code, qty })", () => {
    expect(orderedLines([{ code: "19922", qty: 2, name: "x" }, { code: "", qty: 1 }, { code: "1", qty: 0 }])).toEqual([
      { code: "19922", qty: 2 },
    ]);
  });

  it("saca la línea entera si se pidió todo", () => {
    const { items, changed } = removeOrderedFromCart([line("A", 2), line("B", 1)], "ELIT", [{ code: "A", qty: 2 }]);
    expect(changed).toBe(true);
    expect(items).toEqual([line("B", 1)]);
  });

  it("si se pidió menos de lo que hay, deja la diferencia", () => {
    const { items } = removeOrderedFromCart([line("A", 5, { by: { ana: 3, juan: 2 } })], "ELIT", [{ code: "A", qty: 2 }]);
    expect(items[0]).toMatchObject({ qty: 3 });
  });

  it("no toca otros distribuidores ni lo offline", () => {
    const cart = [line("A", 1, { provider: "NEW_BYTES" }), line("A", 1, { channel: "offline" })];
    const { items, changed } = removeOrderedFromCart(cart, "ELIT", [{ code: "A", qty: 1 }]);
    expect(changed).toBe(false);
    expect(items).toEqual(cart);
  });

  it("si el carrito ya no lo tenía (lo vació la PC que pidió), no cambia nada", () => {
    const { changed } = removeOrderedFromCart([line("B", 1)], "ELIT", [{ code: "A", qty: 1 }]);
    expect(changed).toBe(false);
  });

  it("reparte lo pedido entre líneas del mismo producto (esquemas)", () => {
    const cart = [line("A", 1), line("A", 2, { schemeId: "s1" })];
    const { items } = removeOrderedFromCart(cart, "ELIT", [{ code: "A", qty: 2 }]);
    expect(items).toEqual([expect.objectContaining({ schemeId: "s1", qty: 1 })]);
  });
});
