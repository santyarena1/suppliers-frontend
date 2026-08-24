import { ivaPercentFromGnTaxes } from "./grupo-nucleo.adapter";

describe("ivaPercentFromGnTaxes", () => {
  it("toma solo la línea de IVA y deja afuera internos", () => {
    expect(
      ivaPercentFromGnTaxes([
        { imp_desc: "IVA", imp_porcentaje: 21 },
        { imp_desc: "Imp. internos", imp_porcentaje: 8.26 },
      ])
    ).toBe(21);
  });

  it("no suma IIBB ni percepciones", () => {
    expect(
      ivaPercentFromGnTaxes([
        { imp_desc: "IVA 10.5", imp_porcentaje: 10.5 },
        { imp_desc: "Percepción IIBB", imp_porcentaje: 3 },
      ])
    ).toBe(10.5);
  });

  it("devuelve undefined si no hay línea de IVA", () => {
    expect(ivaPercentFromGnTaxes([{ imp_desc: "Impuesto interno", imp_porcentaje: 8 }])).toBeUndefined();
    expect(ivaPercentFromGnTaxes([])).toBeUndefined();
  });
});
