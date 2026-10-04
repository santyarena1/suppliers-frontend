import { attributeCartItems, sharesOf, UNKNOWN_AUTHOR } from "./cart-attribution";

const line = (externalId: string, qty: number, extra: Record<string, unknown> = {}) => ({
  provider: "ELIT",
  externalId,
  channel: "online",
  schemeId: null,
  qty,
  ...extra,
});

describe("attributeCartItems", () => {
  it("lo nuevo queda a nombre de quien lo agrega", () => {
    const out = attributeCartItems([], [line("a", 2)], "ana");
    expect(out).toEqual([{ ...line("a", 2), by: { ana: 2 } }]);
  });

  it("al sumar unidades de algo ajeno, la diferencia va a quien suma", () => {
    const prev = [line("a", 2, { by: { juan: 2 } })];
    const out = attributeCartItems(prev, [line("a", 3, { by: { juan: 2, ana: 1 } })], "ana");
    expect(out[0]).toMatchObject({ qty: 3, by: { juan: 2, ana: 1 } });
  });

  it("no deja agrandar lo de otro integrante", () => {
    const prev = [line("a", 1, { by: { juan: 1 } })];
    const out = attributeCartItems(prev, [line("a", 5, { by: { juan: 5 } })], "ana");
    expect(out[0]).toMatchObject({ qty: 5, by: { juan: 1, ana: 4 } });
  });

  it("deja bajar lo de otro integrante", () => {
    const prev = [line("a", 3, { by: { juan: 2, ana: 1 } })];
    const out = attributeCartItems(prev, [line("a", 2, { by: { juan: 1, ana: 1 } })], "ana");
    expect(out[0]).toMatchObject({ qty: 2, by: { juan: 1, ana: 1 } });
  });

  it("al mover a otro esquema conserva el autor", () => {
    const prev = [line("a", 2, { by: { juan: 2 } })];
    const out = attributeCartItems(prev, [line("a", 2, { schemeId: "s1", by: { juan: 2 } })], "ana");
    expect(out[0]).toMatchObject({ schemeId: "s1", by: { juan: 2 } });
  });

  it("una web vieja sin `by` mantiene el reparto que tenía la línea", () => {
    const prev = [line("a", 2, { by: { juan: 2 } })];
    const out = attributeCartItems(prev, [line("a", 3)], "ana");
    expect(out[0]).toMatchObject({ by: { juan: 2, ana: 1 } });
  });

  it("lo guardado antes del registro de autor queda sin registrar", () => {
    const prev = [line("a", 2)];
    const out = attributeCartItems(prev, [line("a", 2)], "ana");
    expect(out[0]).toMatchObject({ by: { [UNKNOWN_AUTHOR]: 2 } });
  });

  it("no inventa un autor para otro producto", () => {
    const prev = [line("a", 2, { by: { juan: 2 } })];
    const out = attributeCartItems(prev, [line("b", 2, { by: { juan: 2 } })], "ana");
    expect(out[0]).toMatchObject({ by: { ana: 2 } });
  });
});

describe("sharesOf", () => {
  it("completa como sin registrar lo que no cierra", () => {
    expect(sharesOf(line("a", 3, { by: { juan: 1 } }))).toEqual({ juan: 1, [UNKNOWN_AUTHOR]: 2 });
  });
});
