import { nbCtaSummary, nbCtaSummaryCards, type NbComprobanteLike } from "@nodo/shared";

function factura(over: Partial<NbComprobanteLike> = {}): NbComprobanteLike {
  return { invoiceType: "A-0005", invoiceLabel: "FACTURA", totalUsd: 100, ...over };
}

describe("nbCtaSummary", () => {
  it("separa lo facturado de lo acreditado", () => {
    const summary = nbCtaSummary([
      factura({ totalUsd: 654.04 }),
      factura({ totalUsd: 458.15 }),
      factura({ invoiceLabel: "NOTA DE CREDITO", totalUsd: 100 }),
    ]);
    expect(summary).toMatchObject({ invoiced: 1112.19, credits: 100, net: 1012.19, count: 3 });
  });

  it("reconoce la nota de crédito como la nombre el portal", () => {
    for (const label of ["NOTA DE CREDITO", "Nota de Crédito A", "N/C 0005", "NC A-0005"]) {
      const summary = nbCtaSummary([factura({ invoiceLabel: label, totalUsd: 50 })]);
      expect(summary?.credits).toBe(50);
      expect(summary?.invoiced).toBe(0);
    }
  });

  it("no confunde una factura con una nota de crédito", () => {
    const summary = nbCtaSummary([factura({ invoiceLabel: "FACTURA ELECTRONICA" })]);
    expect(summary?.invoiced).toBe(100);
    expect(summary?.credits).toBe(0);
  });

  it("acumula las percepciones aunque vengan con signo", () => {
    const summary = nbCtaSummary([
      factura({ perceptions: 12.5 }),
      factura({ perceptions: -7.5 }),
    ]);
    expect(summary?.perceptions).toBe(20);
  });

  it("el total del portal puede venir con signo: el tipo decide, no el signo", () => {
    const summary = nbCtaSummary([factura({ invoiceLabel: "NOTA DE CREDITO", totalUsd: -80 })]);
    expect(summary?.credits).toBe(80);
    expect(summary?.net).toBe(-80);
  });

  it("sin comprobantes no hay resumen que mostrar", () => {
    expect(nbCtaSummary([])).toBeNull();
  });

  it("tolera comprobantes sin importe", () => {
    const summary = nbCtaSummary([factura({ totalUsd: undefined })]);
    expect(summary).toMatchObject({ invoiced: 0, net: 0, count: 1 });
  });
});

describe("nbCtaSummaryCards", () => {
  it("oculta las tarjetas en cero, salvo facturado y neto", () => {
    const summary = nbCtaSummary([factura()])!;
    expect(nbCtaSummaryCards(summary).map((c) => c.label)).toEqual([
      "Facturado",
      "Neto del período",
    ]);
  });

  it("muestra créditos y percepciones cuando los hay", () => {
    const summary = nbCtaSummary([
      factura({ perceptions: 5 }),
      factura({ invoiceLabel: "NOTA DE CREDITO", totalUsd: 20 }),
    ])!;
    expect(nbCtaSummaryCards(summary).map((c) => c.label)).toEqual([
      "Facturado",
      "Notas de crédito",
      "Percepciones",
      "Neto del período",
    ]);
  });
});
