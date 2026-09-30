import {
  learnShippingHabits,
  parseShippingMethods,
  resolveShippingEstimate,
  shippingShare,
  type ObservedDelivery,
  type ShippingMethod,
} from "@nodo/shared";

function pedido(over: Partial<ObservedDelivery> = {}): ObservedDelivery {
  return { label: "Moto (Capital Federal)", pickup: false, amount: 10000, currency: "ARS", at: "2026-09-10T12:00:00Z", ...over };
}

function metodo(over: Partial<ShippingMethod> = {}): ShippingMethod {
  return { id: "moto", label: "Moto", amount: 12000, currency: "ARS", habitual: false, ...over };
}

describe("parseShippingMethods", () => {
  it("descarta filas sin nombre o con monto inválido y deja una sola habitual", () => {
    const out = parseShippingMethods([
      { label: "Moto", amount: 10000, currency: "ARS", habitual: true },
      { label: "", amount: 5 },
      { label: "Expreso", amount: -1 },
      { label: "Expreso", amount: 25, currency: "USD", habitual: true },
      { label: "moto", amount: 1 },
    ]);
    expect(out).toEqual([
      { id: "moto", label: "Moto", amount: 10000, currency: "ARS", habitual: true },
      { id: "expreso", label: "Expreso", amount: 25, currency: "USD", habitual: false },
    ]);
  });

  it("sin moneda válida asume pesos", () => {
    expect(parseShippingMethods([{ label: "Flete", amount: 3 }])[0].currency).toBe("ARS");
  });

  it("no rompe con basura", () => {
    expect(parseShippingMethods(null)).toEqual([]);
    expect(parseShippingMethods({})).toEqual([]);
  });
});

describe("learnShippingHabits", () => {
  it("la más usada queda primera y recuerda el último costo conocido", () => {
    const learned = learnShippingHabits([
      pedido({ amount: 9000, at: "2026-08-01T00:00:00Z" }),
      pedido({ amount: 10000, at: "2026-09-20T00:00:00Z" }),
      pedido({ label: "Retiro", pickup: true, amount: null, currency: null, at: "2026-09-25T00:00:00Z" }),
    ]);
    expect(learned.orders).toBe(3);
    expect(learned.methods[0]).toMatchObject({ id: "moto-capital-federal", orders: 2, lastAmount: 10000, currency: "ARS" });
    expect(learned.methods[1]).toMatchObject({ id: "retiro", pickup: true, orders: 1 });
  });

  it("si el último pedido no informó costo usa el anterior que sí", () => {
    const learned = learnShippingHabits([
      pedido({ amount: 8000, at: "2026-08-01T00:00:00Z" }),
      pedido({ amount: null, currency: null, at: "2026-09-20T00:00:00Z" }),
    ]);
    expect(learned.methods[0].lastAmount).toBe(8000);
  });

  it("empate: gana la más reciente", () => {
    const learned = learnShippingHabits([
      pedido({ label: "Expreso", at: "2026-08-01T00:00:00Z" }),
      pedido({ label: "Moto", at: "2026-09-01T00:00:00Z" }),
    ]);
    expect(learned.methods[0].id).toBe("moto");
  });
});

describe("resolveShippingEstimate", () => {
  const historia = learnShippingHabits([pedido({ label: "Moto" }), pedido({ label: "Moto" }), pedido({ label: "Expreso", amount: 30 })]);

  it("la habitual marcada a mano le gana a los pedidos", () => {
    const est = resolveShippingEstimate([metodo({ id: "expreso", label: "Expreso", amount: 20, currency: "USD", habitual: true })], historia);
    expect(est).toMatchObject({ label: "Expreso", amount: 20, currency: "USD", source: "manual" });
  });

  it("sin habitual marcada usa la más pedida con su último costo", () => {
    expect(resolveShippingEstimate([], historia)).toMatchObject({ id: "moto", amount: 10000, source: "history", orders: 2, ofOrders: 3 });
  });

  it("si el comercio le cargó valor a la forma aprendida, manda su valor", () => {
    expect(resolveShippingEstimate([metodo()], historia)).toMatchObject({ id: "moto", amount: 12000, source: "manual", orders: 2 });
  });

  it("retiro habitual: sin costo de envío", () => {
    const est = resolveShippingEstimate([], learnShippingHabits([pedido({ label: "Retiro en Jujuy", pickup: true, amount: null })]));
    expect(est).toMatchObject({ pickup: true, amount: 0 });
  });

  it("sin pedidos usa la primera forma cargada a mano", () => {
    expect(resolveShippingEstimate([metodo()], { orders: 0, methods: [] })).toMatchObject({ id: "moto", amount: 12000 });
  });

  it("sin nada no estima", () => {
    expect(resolveShippingEstimate([], { orders: 0, methods: [] })).toBeNull();
  });
});

describe("shippingShare", () => {
  const base = { cost: 10000, cartUnits: 0, cartValue: 0, inCartQty: 0, unitPrice: 100 };

  it("por unidades: con el carrito vacío el producto carga todo el envío", () => {
    expect(shippingShare({ ...base, split: "units" })).toEqual({ perUnit: 10000, basis: "unit" });
  });

  it("por unidades: se reparte a medida que se agregan productos", () => {
    expect(shippingShare({ ...base, split: "units", cartUnits: 3, cartValue: 300 }).perUnit).toBe(2500);
    expect(shippingShare({ ...base, split: "units", cartUnits: 4, cartValue: 400, inCartQty: 1 }).perUnit).toBe(2500);
  });

  it("por valor: el producto caro carga más", () => {
    const share = shippingShare({ ...base, split: "value", cartUnits: 1, cartValue: 300, unitPrice: 100 });
    expect(share.perUnit).toBe(2500);
  });

  it("por pedido: el primero carga el envío entero y el resto no suma", () => {
    expect(shippingShare({ ...base, split: "order" })).toEqual({ perUnit: 10000, basis: "order" });
    expect(shippingShare({ ...base, split: "order", cartUnits: 2, inCartQty: 2 })).toEqual({ perUnit: 5000, basis: "order" });
    expect(shippingShare({ ...base, split: "order", cartUnits: 3, inCartQty: 1 })).toEqual({ perUnit: 0, basis: "in_cart" });
  });

  it("sin costo no suma nada", () => {
    expect(shippingShare({ ...base, cost: 0, split: "units" }).perUnit).toBe(0);
  });
});
