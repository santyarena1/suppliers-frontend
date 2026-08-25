import { classifyFulfillment, computeOpsInsights, extractAddressLabel, extractShipping } from "./purchase-ops";

describe("extractShipping", () => {
  it("toma el flete de New Bytes como pesos, no como dólares", () => {
    expect(extractShipping({ provider: "NEW_BYTES", addressSnapshot: { quote: { total: 1749.86 } } })).toEqual({
      usd: 0,
      ars: 1749.86,
      known: true,
    });
  });

  it("toma un shippingCost chico de Elit/Invid como USD", () => {
    expect(extractShipping({ provider: "ELIT", addressSnapshot: { shippingCost: 12.5 } })).toEqual({
      usd: 12.5,
      ars: 0,
      known: true,
    });
  });

  it("no trata un shippingCost enorme como dólares", () => {
    expect(extractShipping({ provider: "INVID", addressSnapshot: { shippingCost: 1749.86 } })).toEqual({
      usd: 0,
      ars: 1749.86,
      known: true,
    });
  });

  it("no trata el IVA de Invid como envío", () => {
    const got = extractShipping({
      provider: "INVID",
      total: 130,
      subtotal: 100,
      impuestos: 10,
      percepciones: 2,
    });
    expect(got).toEqual({ usd: 0, ars: 0, known: false });
  });
});

describe("classifyFulfillment", () => {
  it("distingue retiro, envío y sin dato", () => {
    expect(classifyFulfillment({ addressSnapshot: { pickup: true } })).toBe("PICKUP");
    expect(classifyFulfillment({ deliveryLabel: "Envío a domicilio" })).toBe("SHIPPING");
    expect(classifyFulfillment({ deliveryLabel: "Retiro en sucursal" })).toBe("PICKUP");
    expect(classifyFulfillment({ channel: "OFFLINE", status: "OFFLINE" })).toBe("UNKNOWN");
  });
});

describe("extractAddressLabel", () => {
  it("arma la dirección de Invid y el retiro de New Bytes", () => {
    expect(
      extractAddressLabel({
        addressSnapshot: { Direccion: "Av. Rivadavia", NroPuerta: "1000", Localidad: "CABA", CodPostal: "1406" },
      })
    ).toBe("Av. Rivadavia, 1000, CABA, 1406");
    expect(extractAddressLabel({ addressSnapshot: { pickup: true, label: "Av. Jujuy 1039" } })).toBe("Av. Jujuy 1039");
  });
});

describe("computeOpsInsights", () => {
  it("cuenta envíos, pagos y direcciones sin mezclar pesos en USD", () => {
    const report = computeOpsInsights([
      {
        id: "1",
        provider: "INVID",
        status: "CREATED",
        channel: "ONLINE",
        createdAt: "2026-08-10T15:00:00.000Z",
        total: 120,
        subtotal: 100,
        impuestos: 10,
        percepciones: 2,
        paymentLabel: "Transferencia",
        deliveryLabel: "Envío expreso",
        addressSnapshot: { Direccion: "Mitre 12", Localidad: "Rosario" },
        createdBy: "ana",
      },
      {
        id: "2",
        provider: "NEW_BYTES",
        status: "CREATED",
        channel: "ONLINE",
        createdAt: "2026-08-11T18:00:00.000Z",
        total: 50,
        subtotal: 50,
        paymentLabel: "Efectivo",
        deliveryLabel: "Envío Andreani",
        addressSnapshot: { quote: { total: 1749.86 }, dropShipping: false },
        createdBy: "ana",
      },
    ]);
    expect(report.kpis.shippingOrders).toBe(2);
    expect(report.kpis.shippingUsd).toBe(0);
    expect(report.kpis.shippingArs).toBe(1749.86);
    expect(report.kpis.avgShippingArs).toBe(1749.86);
    expect(report.byDelivery.find((r) => r.label.includes("Andreani"))?.extraArs).toBe(1749.86);
    expect(report.kpis.uniquePayments).toBe(2);
    expect(report.byAddress[0].label).toContain("Mitre 12");
    expect(report.byBuyer[0]).toMatchObject({ key: "ana", orders: 2 });
  });
});
