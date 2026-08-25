import { formatSellerOrderText, sellerOrderReference } from "@nodo/shared";

describe("formatSellerOrderText", () => {
  const now = new Date(2026, 7, 25, 21, 48, 3);

  it("arma un pedido online con alícuota visible y percepciones, sin jerga interna", () => {
    const text = formatSellerOrderText([
      {
        reference: sellerOrderReference(now),
        providerLabel: "Elit",
        clientName: "Arena Alejandro Pablo",
        sellerName: "Lautaro Soto",
        quoteRate: 1515,
        lines: [
          {
            qty: 1,
            description: "Fuente SFX 500W",
            ivaPercent: 21,
            internosPercent: 0,
            unitPriceUsd: 9.33,
            lineTotalUsd: 9.33,
          },
          {
            qty: 1,
            description: "Ryzen 5 7600X",
            ivaPercent: 10.5,
            internosPercent: 0,
            unitPriceUsd: 209.52,
            lineTotalUsd: 209.52,
          },
        ],
        netUsd: 218.85,
        extraCharges: [{ label: "Percepción AGIP 3%", usd: 6.57 }],
        finalUsd: 271.38,
      },
    ]);

    expect(text).toContain("Pedido 20260825-214803");
    expect(text).toContain("Cliente: Arena Alejandro Pablo");
    expect(text).toContain("Vendedor: Lautaro Soto");
    expect(text).toContain("Cotización: $ 1.515,00");
    expect(text).toContain("1 | Fuente SFX 500W | 21% | 0% | $ 9,33 | 9,33");
    expect(text).toContain("1 | Ryzen 5 7600X | 10.5% | 0% | $ 209,52 | 209,52");
    expect(text).toContain("Percepción AGIP 3%");
    expect(text).toMatch(/Total sin impuestos: u\$s 218,85 \| \$ /);
    expect(text).not.toMatch(/sin facturar/i);
    expect(text).not.toMatch(/portal/i);
    expect(text).not.toMatch(/offline/i);
    expect(text).not.toMatch(/mitad del IVA/i);
    expect(text).not.toMatch(/NODO/i);
  });

  it("en un pedido con IVA ya aplicado muestra 0% y el mismo total", () => {
    const text = formatSellerOrderText([
      {
        reference: "250825-120000",
        providerLabel: "Elit",
        clientName: "Arena Alejandro Pablo",
        quoteRate: 1510,
        lines: [
          {
            qty: 1,
            description: "Monitor gamer 24,5",
            ivaPercent: 0,
            internosPercent: 0,
            unitPriceUsd: 243.08,
            lineTotalUsd: 243.08,
          },
          {
            qty: 3,
            description: "Mother A520M",
            ivaPercent: 0,
            internosPercent: 0,
            unitPriceUsd: 48.05,
            lineTotalUsd: 144.15,
          },
        ],
        netUsd: 387.23,
        extraCharges: [],
        finalUsd: 387.23,
      },
    ]);

    expect(text).toContain("| 0% | 0% | $ 243,08 | 243,08");
    expect(text).toContain("3 | Mother A520M | 0% | 0% | $ 48,05 | 144,15");
    expect(text).toContain("Total sin impuestos: u$s 387,23");
    expect(text).toContain("Total: u$s 387,23");
    expect(text).not.toMatch(/sin facturar/i);
    expect(text).not.toMatch(/no se carga/i);
    expect(text).not.toMatch(/IVA offline/i);
    expect(text).not.toMatch(/Dejar la mitad/i);
  });
});
