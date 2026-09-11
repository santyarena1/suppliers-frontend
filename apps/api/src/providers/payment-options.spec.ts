import {
  applyPaymentOption,
  mergeLearnedPaymentOptions,
  parsePaymentOptions,
  paymentOptionId,
  type PaymentOption,
} from "@nodo/shared";

function opcion(over: Partial<PaymentOption> = {}): PaymentOption {
  return {
    id: "transferencia",
    label: "Transferencia",
    percent: 5,
    kind: "DISCOUNT",
    source: "manual",
    at: null,
    ...over,
  };
}

describe("applyPaymentOption", () => {
  it("un descuento baja el precio", () => {
    expect(applyPaymentOption(1000, { percent: 10, kind: "DISCOUNT" })).toBe(900);
  });

  it("un recargo lo sube", () => {
    expect(applyPaymentOption(1000, { percent: 10, kind: "SURCHARGE" })).toBe(1100);
  });

  it("0% deja el precio como está", () => {
    expect(applyPaymentOption(1000, { percent: 0, kind: "SURCHARGE" })).toBe(1000);
  });
});

describe("parsePaymentOptions", () => {
  it("descarta lo que no se puede usar en vez de mostrarlo roto", () => {
    const parsed = parsePaymentOptions([
      { label: "Transferencia", percent: 5, kind: "DISCOUNT" },
      { label: "  ", percent: 5, kind: "DISCOUNT" },
      { label: "Sin porcentaje" },
      { label: "Imposible", percent: 150, kind: "SURCHARGE" },
      "basura",
    ]);
    expect(parsed.map((o) => o.label)).toEqual(["Transferencia"]);
  });

  it("completa el id a partir del nombre y asume descuento si no dicen", () => {
    const [o] = parsePaymentOptions([{ label: "3 Cuotas sin interés", percent: 0 }]);
    expect(o.id).toBe("3-cuotas-sin-interes");
    expect(o.kind).toBe("DISCOUNT");
    expect(o.source).toBe("manual");
  });

  it("no deja dos filas con el mismo id", () => {
    const parsed = parsePaymentOptions([
      { label: "Transferencia", percent: 5, kind: "DISCOUNT" },
      { label: "transferencia", percent: 8, kind: "SURCHARGE" },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].percent).toBe(5);
  });

  it("devuelve vacío con cualquier cosa que no sea lista", () => {
    expect(parsePaymentOptions(null)).toEqual([]);
    expect(parsePaymentOptions({ label: "x" })).toEqual([]);
  });
});

describe("mergeLearnedPaymentOptions", () => {
  it("actualiza lo aprendido cuando el portal cotiza distinto", () => {
    const previo = [opcion({ id: "tarjeta", label: "Tarjeta", percent: 10, source: "cart" })];
    const nuevo = [opcion({ id: "tarjeta", label: "Tarjeta", percent: 12, kind: "SURCHARGE", source: "cart" })];
    const [merged] = mergeLearnedPaymentOptions(previo, nuevo);
    expect(merged.percent).toBe(12);
    expect(merged.kind).toBe("SURCHARGE");
  });

  it("no pisa lo que el comercio cargó a mano", () => {
    const previo = [opcion({ id: "tarjeta", label: "Tarjeta", percent: 10, source: "manual" })];
    const nuevo = [opcion({ id: "tarjeta", label: "Tarjeta", percent: 12, source: "cart" })];
    const [merged] = mergeLearnedPaymentOptions(previo, nuevo);
    expect(merged.percent).toBe(10);
    expect(merged.source).toBe("manual");
  });

  it("agrega las que no estaban", () => {
    const merged = mergeLearnedPaymentOptions([], [opcion({ source: "cart" })]);
    expect(merged).toHaveLength(1);
  });
});

describe("paymentOptionId", () => {
  it("es estable aunque cambie mayúsculas, acentos o signos", () => {
    expect(paymentOptionId("Tarjeta  de  Crédito!")).toBe(paymentOptionId("tarjeta de credito"));
  });

  it("nunca queda vacío", () => {
    expect(paymentOptionId("!!!")).toBe("opcion");
  });
});
