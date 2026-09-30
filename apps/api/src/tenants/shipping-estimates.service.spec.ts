import { observeDelivery } from "./shipping-estimates.service";

const base = {
  provider: "NEW_BYTES",
  status: "CREATED",
  channel: "ONLINE",
  createdAt: new Date("2026-09-20T12:00:00Z"),
  deliveryOption: "7",
  deliveryLabel: "Moto (Capital Federal) (24 hs)",
  addressSnapshot: { id: "a1", quote: { label: "Moto (Capital Federal)", total: 10000 } },
  draftInput: null,
};

describe("observeDelivery", () => {
  it("New Bytes: toma el nombre de la cotización (sin plazo) y el costo en pesos", () => {
    expect(observeDelivery(base)).toEqual({
      label: "Moto (Capital Federal)",
      pickup: false,
      amount: 10000,
      currency: "ARS",
      at: "2026-09-20T12:00:00.000Z",
    });
  });

  it("retiro: sin costo", () => {
    const got = observeDelivery({ ...base, deliveryOption: "pickup", addressSnapshot: { pickup: true } });
    expect(got).toMatchObject({ label: "Retiro", pickup: true, amount: null });
  });

  it("Elit: costo en dólares del snapshot", () => {
    const got = observeDelivery({
      ...base,
      provider: "ELIT",
      deliveryLabel: "Envío a domicilio",
      addressSnapshot: { shipping: true, shippingCost: 18.5 },
    });
    expect(got).toMatchObject({ label: "Envío a domicilio", amount: 18.5, currency: "USD" });
  });

  it("envío sin costo informado: se aprende la forma igual", () => {
    const got = observeDelivery({ ...base, provider: "AIR", deliveryLabel: "Expreso Cruz del Sur", addressSnapshot: { shipping: true } });
    expect(got).toMatchObject({ label: "Expreso Cruz del Sur", amount: null, currency: null });
  });

  it("los pedidos offline no cuentan", () => {
    expect(observeDelivery({ ...base, channel: "OFFLINE", status: "OFFLINE" })).toBeNull();
  });
});
