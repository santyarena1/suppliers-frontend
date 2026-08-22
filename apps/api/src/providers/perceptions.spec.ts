import { mapProviderPerceptions, perceptionDisplayLabel } from "./perceptions";

describe("perceptions", () => {
  it("si nombra IIBB deja esa etiqueta; si no, Percepciones", () => {
    expect(perceptionDisplayLabel("Percep. II.BB. C.A.B.A")).toBe("Percep. II.BB. C.A.B.A");
    expect(perceptionDisplayLabel("Percepción")).toBe("Percepciones");
    expect(perceptionDisplayLabel("")).toBe("Percepciones");
  });

  it("lee total.perceptions de Elit con detalle", () => {
    const mapped = mapProviderPerceptions({
      total: 1.5,
      details: [{ name: "Percep. II.BB. C.A.B.A", amount: 1.5 }],
    });
    expect(mapped.total).toBe(1.5);
    expect(mapped.lines).toEqual([{ label: "Percep. II.BB. C.A.B.A", amount: 1.5 }]);
  });

  it("si solo viene un número, lo etiqueta Percepciones y lo suma", () => {
    expect(mapProviderPerceptions(1.5)).toEqual({
      total: 1.5,
      lines: [{ label: "Percepciones", amount: 1.5 }],
    });
  });

  it("si es array sin nombre, no inventa IIBB", () => {
    const mapped = mapProviderPerceptions([{ amount: 0.8 }, { total: 0.7 }]);
    expect(mapped.total).toBe(1.5);
    expect(mapped.lines.every((l) => l.label === "Percepciones")).toBe(true);
  });
});
