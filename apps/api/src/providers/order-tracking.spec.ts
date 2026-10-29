import { advances, bestUpdate, findPortalRow, stageFromText, trackingFromPortal, trackingNotice } from "./order-tracking";

describe("stageFromText", () => {
  it.each([
    ["Pendiente", "SENT"],
    ["Abierto", "SENT"],
    ["Pedido", "SENT"],
    ["En preparación", "CONFIRMED"],
    ["Armando", "CONFIRMED"],
    ["in_process", "CONFIRMED"],
    ["Facturado", "INVOICED"],
    ["REMITIDO Y FACTURADO", "SHIPPED"],
    ["Despachado", "SHIPPED"],
    ["Entregado Cobrado", "DELIVERED"],
    // Textos reales vistos en producción (29/10).
    ["No preparado", "SENT"],
    ["Remitido", "SHIPPED"],
    ["Armado Finalizado", "CONFIRMED"],
    ["Entregado. Acreditacion parcial", "DELIVERED"],
    ["Cerrado", "CONFIRMED"],
    ["Vencido", "CANCELLED"],
    ["Sin despachar", "SENT"],
    ["Anulado", "CANCELLED"],
    ["Cancelado", "CANCELLED"],
  ])("«%s» → %s", (text, stage) => {
    expect(stageFromText(text)).toBe(stage);
  });
});

describe("trackingFromPortal", () => {
  it("una factura cargada lo pasa a Facturado aunque el estado diga Pendiente", () => {
    const u = trackingFromPortal({ numbers: ["1"], status: "Pendiente", invoice: "A 0003-00018422" });
    expect(u.stage).toBe("INVOICED");
    expect(u.invoice).toBe("A 0003-00018422");
  });

  it("un número de seguimiento lo pasa a Despachado", () => {
    const u = trackingFromPortal({ numbers: ["1"], status: "En preparación", trackingNumber: "AND123", carrier: "Andreani" });
    expect(u.stage).toBe("SHIPPED");
    expect(u.carrier).toBe("Andreani");
  });

  it("«Adjuntar» o «-» en la columna de factura no es una factura", () => {
    expect(trackingFromPortal({ numbers: ["1"], status: "Pedido", invoice: "Adjuntar" }).stage).toBe("SENT");
    expect(trackingFromPortal({ numbers: ["1"], status: "Pedido", invoice: "-" }).invoice).toBeNull();
  });

  it("anulado gana aunque tenga factura", () => {
    expect(trackingFromPortal({ numbers: ["1"], status: "Anulado", invoice: "A 1" }).stage).toBe("CANCELLED");
  });

  it("toma la etapa que ya da el portal (Polytech)", () => {
    expect(trackingFromPortal({ numbers: ["1"], stage: "SHIPPED" }).stage).toBe("SHIPPED");
  });
});

describe("findPortalRow", () => {
  const rows = [
    { numbers: ["111", "W-1"], status: "Pendiente" },
    { numbers: ["222", "1-222"], status: "Facturado" },
  ];

  it("cruza por cualquiera de los números que guardó NODO", () => {
    expect(findPortalRow({ invidOrderNumber: "222", invidWebOrderNumber: "x" }, rows)?.status).toBe("Facturado");
    expect(findPortalRow({ invidOrderNumber: null, invidWebOrderNumber: "W-1" }, rows)?.status).toBe("Pendiente");
  });

  it("Grupo Núcleo guarda varios números separados por coma", () => {
    expect(findPortalRow({ invidOrderNumber: "9", invidWebOrderNumber: "9, 222" }, rows)?.status).toBe("Facturado");
  });

  it("sin números no cruza nada", () => {
    expect(findPortalRow({ invidOrderNumber: null, invidWebOrderNumber: "" }, rows)).toBeUndefined();
  });
});

describe("advances", () => {
  it("solo avanza", () => {
    expect(advances(null, "SENT")).toBe(false);
    expect(advances(null, "CONFIRMED")).toBe(true);
    expect(advances("INVOICED", "CONFIRMED")).toBe(false);
    expect(advances("INVOICED", "CANCELLED")).toBe(true);
    expect(advances("DELIVERED", "CANCELLED")).toBe(false);
    expect(advances("CANCELLED", "DELIVERED")).toBe(false);
  });
});

describe("trackingNotice", () => {
  it("arma el aviso como en el video", () => {
    const n = trackingNotice("Air", "4410", {
      stage: "INVOICED",
      status: "Facturado",
      invoice: "A 0003-00018422",
      trackingNumber: null,
      carrier: null,
    });
    expect(n.title).toBe("Air facturó tu pedido");
    expect(n.body).toBe("Pedido 4410 · Factura A 0003-00018422 · En el portal: «Facturado»");
  });
});

describe("bestUpdate", () => {
  it("de la orden de compra y el pedido del mismo número toma el más avanzado y junta la factura", () => {
    const u = bestUpdate({ invidOrderNumber: "77", invidWebOrderNumber: "1-77" }, [
      { numbers: ["77"], status: "En preparación", invoice: "B 0001-00000009" },
      { numbers: ["1-77"], status: "Despachado" },
      { numbers: ["88"], status: "Entregado" },
    ]);
    expect(u?.stage).toBe("SHIPPED");
    expect(u?.invoice).toBe("B 0001-00000009");
  });
});
