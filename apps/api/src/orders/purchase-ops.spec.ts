import { classifyFulfillment, computeOpsInsights, extractAddressLabel, extractShippingUsd } from "./purchase-ops";

describe("extractShippingUsd", () => {
  it("usa el costo explícito del snapshot", () => {
    expect(extractShippingUsd({ addressSnapshot: { shippingCost: 12.5 } })).toEqual({ amount: 12.5, known: true });
    expect(extractShippingUsd({ addressSnapshot: { quote: { total: 8 } } })).toEqual({ amount: 8, known: true });
  });

  it("estima el envío como resto del total cuando está guardado", () => {
    const got = extractShippingUsd({ total: 130, subtotal: 100, impuestos: 21, percepciones: 2 });
    expect(got).toEqual({ amount: 7, known: true });
  });

  it("no inventa envío si el resto es absurdo o no hay totales", () => {
    expect(extractShippingUsd({ total: 100, subtotal: 10 }).known).toBe(false);
    expect(extractShippingUsd({ total: 100 }).known).toBe(false);
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
  it("cuenta envíos, pagos y direcciones del mismo lote", () => {
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
        deliveryLabel: "Retiro Av. Jujuy 1039",
        addressSnapshot: { pickup: true, label: "Av. Jujuy 1039" },
        createdBy: "ana",
      },
    ]);
    expect(report.kpis.shippingOrders).toBe(1);
    expect(report.kpis.pickupOrders).toBe(1);
    expect(report.kpis.shippingUsd).toBe(8);
    expect(report.kpis.uniquePayments).toBe(2);
    expect(report.byAddress[0].label).toContain("Mitre 12");
    expect(report.byBuyer[0]).toMatchObject({ key: "ana", orders: 2 });
    expect(report.shippingByMonth.some((m) => m.shippedOrders === 1 && m.pickupOrders === 1)).toBe(true);
  });
});
