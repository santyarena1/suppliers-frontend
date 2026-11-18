import { IGNORED_CODES, matchByLines, type Lines, type OrderLines } from "./invoice-match";

const L = (o: Record<string, number>): Lines => new Map(Object.entries(o));
const day = (d: string) => new Date(`${d}T12:00:00-03:00`);
const order = (id: string, d: string, lines: Record<string, number>): OrderLines => ({ id, createdAt: day(d), lines: L(lines) });

describe("unir factura a pedido por productos", () => {
  const orders = [order("a", "2026-11-10", { "1": 1, "2": 2, "3": 1 }), order("b", "2026-11-12", { "9": 1, "2": 1 })];

  it("exacto, ignorando la línea del esquema de Air", () => {
    expect(matchByLines({ lines: L({ "42369": 1, "1": 1, "2": 2, "3": 1 }), date: day("2026-11-11") }, orders, { ignore: IGNORED_CODES.AIR })).toEqual({ orderId: "a", candidates: 1, how: "exacto" });
  });

  it("factura parcial: todos sus productos están en un solo pedido", () => {
    expect(matchByLines({ lines: L({ "1": 1, "2": 2 }), date: day("2026-11-11") }, orders)).toMatchObject({ orderId: "a", how: "parcial" });
  });

  it("dudosa (dos pedidos la contienen), con más cantidad que el pedido o fuera de fecha: no se une", () => {
    expect(matchByLines({ lines: L({ "2": 1 }), date: day("2026-11-12") }, orders)).toMatchObject({ orderId: null, candidates: 2 });
    expect(matchByLines({ lines: L({ "9": 2 }), date: day("2026-11-12") }, orders).orderId).toBeNull();
    expect(matchByLines({ lines: L({ "1": 1, "2": 2, "3": 1 }), date: day("2027-01-30") }, orders).orderId).toBeNull();
    // Solo la línea del esquema: no hay nada que comparar.
    expect(matchByLines({ lines: L({ "42369": 1 }), date: day("2026-11-11") }, orders, { ignore: IGNORED_CODES.AIR }).orderId).toBeNull();
  });
});
