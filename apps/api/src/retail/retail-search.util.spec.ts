import {
  coerceStoredRetailPrice,
  detectPriceDivisor,
  isSaneRetailPrice,
  normalizeExternalPrice,
} from "./retail-price.util";
import {
  extractSearchTokens,
  normalizeSearchText,
  passesRelevanceGate,
  scoreRetailMatch,
} from "./retail-search.util";

describe("normalizeExternalPrice", () => {
  it("aplica divisor de tienda (centavos)", () => {
    expect(normalizeExternalPrice(37384476, 100)).toBeCloseTo(373844.76, 2);
    expect(normalizeExternalPrice(1218600000, 100)).toBe(12186000);
  });

  it("fallback enteros ≥25M sin divisor", () => {
    expect(normalizeExternalPrice(37384476)).toBeCloseTo(373844.76, 2);
  });

  it("deja floats de pesos intactos", () => {
    expect(normalizeExternalPrice(138148.78)).toBeCloseTo(138148.78, 2);
    expect(normalizeExternalPrice(15105)).toBe(15105);
  });

  it("no doble-divide precios ya normalizados en DB", () => {
    expect(coerceStoredRetailPrice(373844.76, 100)).toBeCloseTo(373844.76, 2);
    expect(coerceStoredRetailPrice(37384476, 100)).toBeCloseTo(373844.76, 2);
  });

  it("detecta divisor por mediana absurda", () => {
    expect(detectPriceDivisor([1.2e9, 1.1e9, 1.0e9, 9e8, 8e8])).toBe(100);
    expect(detectPriceDivisor([15000, 18000, 22000, 19000, 21000])).toBe(1);
  });

  it("sanidad", () => {
    expect(isSaneRetailPrice(373844.76)).toBe(true);
    expect(isSaneRetailPrice(50_000_000)).toBe(false);
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
      tokens
    );
    const fan = scoreRetailMatch(
      normalizeSearchText("FAN Cooler RAPTOR Frost Slim Ring 120MM"),
      tokens
    );
    const master = scoreRetailMatch(
      normalizeSearchText("COOLER GABINETE COOLER MASTER SIKLEFLOW 120 ARGB"),
      tokens
    );

    expect(passesRelevanceGate(exact, tokens)).toBe(true);
    expect(passesRelevanceGate(fan, tokens)).toBe(false);
    expect(passesRelevanceGate(master, tokens)).toBe(false);
    expect(exact.score).toBeGreaterThan(fan.score);
  });

  it("acepta coincidencia con un fuerte + cobertura (no exige todos)", () => {
    const tokens = extractSearchTokens(q);
    // Título real sin "95w" explícito
    const partial = scoreRetailMatch(
      normalizeSearchText("CPU Cooler Raptor Cryo RGB Potencia Max AMD Intel"),
      tokens
    );
    expect(partial.strongHits).toBeGreaterThanOrEqual(1);
    expect(passesRelevanceGate(partial, tokens)).toBe(true);
  });
});
