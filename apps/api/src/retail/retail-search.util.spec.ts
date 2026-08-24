import {
  normalizeExternalPrice,
  isSaneRetailPrice,
} from "./retail-price.util";
import {
  extractSearchTokens,
  normalizeSearchText,
  passesRelevanceGate,
  scoreRetailMatch,
} from "./retail-search.util";

describe("normalizeExternalPrice", () => {
  it("divide centavos enteros absurdo (Multiplo)", () => {
    expect(normalizeExternalPrice(37384476)).toBeCloseTo(373844.76, 2);
    expect(normalizeExternalPrice(1218600000)).toBe(12186000);
  });

  it("deja floats de pesos intactos", () => {
    expect(normalizeExternalPrice(138148.78)).toBeCloseTo(138148.78, 2);
    expect(normalizeExternalPrice(15105)).toBe(15105);
  });

  it("sanidad", () => {
    expect(isSaneRetailPrice(373844.76)).toBe(true);
    expect(isSaneRetailPrice(50_000_000)).toBe(false);
    expect(isSaneRetailPrice(0)).toBe(false);
  });
});

describe("retail search relevance", () => {
  const q = "CPU Cooler Raptor Cryo RGB Potencia Max 95W";

  it("extrae tokens fuertes de marca/modelo", () => {
    const tokens = extractSearchTokens(q);
    const strong = tokens.filter((t) => t.strong).map((t) => t.t);
    expect(strong).toEqual(expect.arrayContaining(["raptor", "cryo"]));
    expect(strong).not.toContain("cooler");
    expect(strong).not.toContain("rgb");
  });

  it("prioriza el producto exacto sobre fans genéricos", () => {
    const tokens = extractSearchTokens(q);
    const exact = scoreRetailMatch(
      normalizeSearchText("CPU Cooler Raptor Cryo RGB Potencia Max 95W p AMD Intel"),
      tokens,
    );
    const fan = scoreRetailMatch(
      normalizeSearchText("FAN Cooler RAPTOR Frost Slim Ring 120MM"),
      tokens,
    );
    const master = scoreRetailMatch(
      normalizeSearchText("COOLER GABINETE COOLER MASTER SIKLEFLOW 120 ARGB"),
      tokens,
    );

    expect(passesRelevanceGate(exact, tokens)).toBe(true);
    expect(passesRelevanceGate(fan, tokens)).toBe(false);
    expect(passesRelevanceGate(master, tokens)).toBe(false);
    expect(exact.score).toBeGreaterThan(fan.score);
    expect(exact.score).toBeGreaterThan(master.score);
  });
});
