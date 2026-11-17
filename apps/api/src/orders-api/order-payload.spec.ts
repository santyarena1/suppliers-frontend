import { buildOrderPayload, distributorCuit, isPublishable, orderState, payloadHash, validCuit, type OrderRow } from "./order-payload";

const base = (over: Partial<OrderRow>): OrderRow => ({
  id: "o1",
  number: 7,
  tenantId: "t1",
  provider: "ELIT",
  status: "CREATED",
  channel: "ONLINE",
  approvalStatus: "NOT_REQUIRED",
  invidOrderNumber: "A-123",
  invidWebOrderNumber: "A-123",
  paymentOption: "1",
  paymentLabel: "Cuenta corriente",
  deliveryOption: "2",
  deliveryLabel: "Retiro en depósito",
  notes: null,
  subtotal: 100,
  impuestos: 0,
  percepciones: 0,
  total: 100,
  items: [],
  addressSnapshot: {},
  draftInput: null,
  rejectionReason: null,
  approvalDecidedAt: null,
  storefrontStatus: null,
  trackingStage: null,
  trackingStatus: null,
  trackingInvoice: null,
  trackingNumber: null,
  trackingCarrier: null,
  trackingChangedAt: null,
  createdAt: new Date("2026-11-16T12:00:00Z"),
  createdBy: { id: "u1", username: "testuser1" },
  approvedBy: null,
  user: { id: "u1", username: "testuser1" },
  ...over,
});

const ctx = (over: Partial<Parameters<typeof buildOrderPayload>[1]> = {}) => ({
  version: 1,
  changedAt: new Date("2026-11-16T12:01:00Z"),
  distributor: { name: "Elit", cuit: null },
  catalog: () => null,
  ...over,
});

describe("pedido para la API", () => {
  it("Elit: IVA, internos, percepciones y envío separados; el desglose cuadra con el total", () => {
    const p = buildOrderPayload(
      base({
        subtotal: 100,
        impuestos: 33.5,
        percepciones: 2,
        total: 143.5,
        items: [{ externalId: "E1", name: "Mouse", qty: 2, price: 50, ivaPercent: 21, subtotal: 100 }],
        addressSnapshot: { vat: 21, internalTax: 10.5, perceptions: 2, shippingCost: 10 },
      }),
      ctx()
    );
    expect(p).toMatchObject({
      numero: "NODO-7",
      estado: "enviado",
      canal: "online",
      subtotal_neto: 100,
      iva: 21,
      iva_21: 21,
      iva_105: 0,
      impuestos_internos: 10.5,
      percepciones: 2,
      envio: { monto: 10, moneda: "USD" },
      total: 143.5,
      desglose_cuadra: true,
      numero_pedido_distribuidor: "A-123",
      numero_pedido_web_distribuidor: null,
      creado_por: { id: "u1", usuario: "testuser1" },
    });
    expect(p.renglones[0]).toMatchObject({ codigo_distribuidor: "E1", cantidad: 2, precio_unitario_neto: 50, total_linea: 100, iva_porcentaje: 21, descuento: null });
  });

  it("Air: IVA ya viene separado por alícuota", () => {
    const p = buildOrderPayload(
      base({ provider: "AIR", subtotal: 200, total: 236.75, addressSnapshot: { iva21: 21, iva105: 10.5, ii: 5.25 } }),
      ctx()
    );
    expect(p).toMatchObject({ iva: 31.5, iva_21: 21, iva_105: 10.5, impuestos_internos: 5.25, desglose_cuadra: true });
  });

  it("Invid: el IVA del renglón vino como monto y se reconoce la alícuota", () => {
    const p = buildOrderPayload(
      base({ provider: "INVID", items: [{ externalId: "I1", name: "Disco", qty: 3, price: 10, subtotal: 30, iva: 3.15 }], addressSnapshot: { vat: 3.15 }, subtotal: 30, total: 33.15 }),
      ctx()
    );
    expect(p.renglones[0].iva_porcentaje).toBe(10.5);
    expect(p).toMatchObject({ iva: 3.15, iva_105: 3.15, iva_21: 0, desglose_cuadra: true });
  });

  it("Solution Box: internos por diferencia, percepciones con jurisdicción y cotización", () => {
    const p = buildOrderPayload(
      base({
        provider: "SOLUTION_BOX",
        subtotal: 100,
        impuestos: 30,
        percepciones: 4,
        total: 130,
        addressSnapshot: { vat: 21, exchange: 1450, perceptionLines: [{ label: "Perc. IIBB CABA", amount: 3 }, { label: "Perc. IVA", amount: 1 }] },
      }),
      ctx()
    );
    expect(p).toMatchObject({ iva: 21, impuestos_internos: 5, percepciones: 4, cotizacion: 1450, desglose_cuadra: true });
    expect(p.percepciones_detalle).toEqual([
      { concepto: "Perc. IIBB CABA", jurisdiccion: "CABA", monto: 3 },
      { concepto: "Perc. IVA", jurisdiccion: null, monto: 1 },
    ]);
  });

  it("New Bytes: el envío viene en pesos y no entra en la cuenta en dólares", () => {
    const p = buildOrderPayload(base({ provider: "NEW_BYTES", subtotal: 100, impuestos: 21, total: 121, addressSnapshot: { vat: 21, quote: { id: "x", label: "Andreani", total: 15000 } } }), ctx());
    expect(p).toMatchObject({ envio: { monto: 15000, moneda: "ARS" }, desglose_cuadra: true });
  });

  it("offline: IVA e internos de cada renglón, cotización del pedido", () => {
    const p = buildOrderPayload(
      base({
        provider: "LIST_AULA",
        status: "OFFLINE",
        channel: "OFFLINE",
        subtotal: 100,
        impuestos: 2,
        total: 123,
        items: [{ externalId: "A1", sku: "S1", name: "Teclado", qty: 1, unitPrice: 100, lineTotal: 100, ivaPercent: 21, internosAmount: 2, internosPercent: 2 }],
        draftInput: { quoteRate: 1430 },
      }),
      ctx()
    );
    expect(p).toMatchObject({ estado: "creado", canal: "offline", iva: 21, impuestos_internos: 2, cotizacion: 1430, desglose_cuadra: true });
    expect(p.renglones[0].impuestos_internos).toEqual({ porcentaje: 2, monto: 2 });
  });

  it("Grupo Núcleo: alícuotas desde los impuestos del renglón", () => {
    const p = buildOrderPayload(
      base({ provider: "GRUPO_NUCLEO", subtotal: 50, total: 50, items: [{ externalId: "G1", name: "Fuente", qty: 1, price: 50, taxes: [{ desc: "IVA", percent: 10.5 }] }], addressSnapshot: { usdExchange: 1440 } }),
      ctx()
    );
    expect(p).toMatchObject({ iva: 5.25, iva_105: 5.25, cotizacion: 1440 });
    expect(p.renglones[0].iva_porcentaje).toBe(10.5);
  });

  it("sin dato no inventa: alícuota desconocida queda en null y el desglose no cuadra", () => {
    const p = buildOrderPayload(base({ provider: "NEW_TREE", impuestos: null, total: 121, items: [{ externalId: "N1", name: "X", qty: 1, price: 100 }] }), ctx());
    expect(p.renglones[0].iva_porcentaje).toBeNull();
    expect(p.iva).toBeNull();
    expect(p.desglose_cuadra).toBe(false);
  });

  it("completa sku, ean, marca, garantía y producto de NODO desde el catálogo", () => {
    const p = buildOrderPayload(
      base({ items: [{ externalId: "E1", name: "Mouse", qty: 1, price: 10 }] }),
      ctx({ catalog: (code) => (code === "E1" ? { sku: "SKU1", partNumber: "PN1", ean: "7790000000001", brand: "Logitech", warranty: "12 meses", productId: "prd_x" } : null) })
    );
    expect(p.renglones[0]).toMatchObject({ sku: "SKU1", part_number: "PN1", ean: "7790000000001", marca: "Logitech", garantia: "12 meses", producto_nodo: "prd_x" });
  });

  it("el hash no cambia por la versión ni la fecha de cambio", () => {
    const a = buildOrderPayload(base({}), ctx());
    const b = buildOrderPayload(base({}), ctx({ version: 3, changedAt: new Date() }));
    expect(payloadHash(a)).toBe(payloadHash(b));
    expect(payloadHash(buildOrderPayload(base({ trackingStage: "INVOICED" }), ctx()))).not.toBe(payloadHash(a));
  });
});

describe("datos guardados desde la etapa 1b", () => {
  it("Elit trae cada percepción; Invid el porcentaje; New Bytes la cotización y la etiqueta", () => {
    const elit = buildOrderPayload(base({ percepciones: 3, addressSnapshot: { vat: 21, perceptions: 3, perceptionLines: [{ label: "Percepción IIBB ARBA", amount: 3 }] } }), ctx());
    expect(elit.percepciones_detalle).toEqual([{ concepto: "Percepción IIBB ARBA", jurisdiccion: "Buenos Aires", monto: 3 }]);
    const invid = buildOrderPayload(base({ provider: "INVID", percepciones: 3, addressSnapshot: { vat: 21, perceptionPercent: 3, shippingCost: 11.19 } }), ctx());
    expect(invid).toMatchObject({ envio: { monto: 11.19, moneda: "USD" }, percepciones_detalle: [{ concepto: "Percepciones 3 %", jurisdiccion: null, monto: 3 }] });
    const nb = buildOrderPayload(base({ provider: "NEW_BYTES", percepciones: 2, addressSnapshot: { vat: 21, exchangeRate: 1455, perceptionLabel: "Percepción IIBB CABA" } }), ctx());
    expect(nb).toMatchObject({ cotizacion: 1455, percepciones_detalle: [{ concepto: "Percepción IIBB CABA", jurisdiccion: "CABA", monto: 2 }] });
  });

  it("Solution Box: envío en dólares", () => {
    const sb = buildOrderPayload(base({ provider: "SOLUTION_BOX", addressSnapshot: { vat: 21, shippingCost: 8 } }), ctx());
    expect(sb.envio).toEqual({ monto: 8, moneda: "USD" });
  });
});

describe("estado del pedido", () => {
  it("traduce aprobación, seguimiento y tienda", () => {
    const o = { status: "CREATED", approvalStatus: "NOT_REQUIRED", storefrontStatus: null, trackingStage: null, channel: "ONLINE" };
    expect(orderState(o)).toBe("enviado");
    expect(orderState({ ...o, trackingStage: "CANCELLED" })).toBe("cancelado");
    expect(orderState({ ...o, status: "PENDING_APPROVAL", approvalStatus: "PENDING_APPROVAL" })).toBe("pendiente_aprobacion");
    expect(orderState({ ...o, approvalStatus: "REJECTED" })).toBe("rechazado");
    expect(orderState({ ...o, status: "OFFLINE", channel: "OFFLINE" })).toBe("creado");
    expect(orderState({ ...o, status: "FAILED" })).toBe("fallido");
  });

  it("un intento de compra que falló o se está mandando no se publica", () => {
    expect(isPublishable({ status: "FAILED", approvalStatus: "NOT_REQUIRED" })).toBe(false);
    expect(isPublishable({ status: "PENDING", approvalStatus: "NOT_REQUIRED" })).toBe(false);
    expect(isPublishable({ status: "CREATED", approvalStatus: "NOT_REQUIRED" })).toBe(true);
    expect(isPublishable({ status: "PENDING_APPROVAL", approvalStatus: "PENDING_APPROVAL" })).toBe(true);
  });
});

describe("CUIT", () => {
  it("valida el dígito verificador y solo publica los confirmados", () => {
    expect(validCuit("30-70933244-5")).toBe(true);
    expect(validCuit("30-70933244-4")).toBe(false);
    expect(distributorCuit("GRUPO_NUCLEO")).toBe("30-70933244-5");
    expect(distributorCuit("ELIT")).toBeNull();
  });
});
