import {
  coerceStoredRetailPrice,
  detectPriceDivisor,
  isCentsBasedStore,
  isSaneRetailPrice,
  normalizeExternalPrice,
  repairImplausibleRetailPrice,
} from "./retail-price.util";
import {
  extractSearchTokens,
  normalizeSearchText,
  passesRelevanceGate,
  scoreRetailMatch,
} from "./retail-search.util";

describe("Multiplo centavos (últimos 2 dígitos)", () => {
  it("reconoce Multiplo", () => {
    expect(isCentsBasedStore("Multiplo", 31)).toBe(true);
    expect(isCentsBasedStore("SCP Hardstore", 18)).toBe(false);
  });

  it("÷100 al ingerir", () => {
    expect(normalizeExternalPrice(37384476, 100)).toBeCloseTo(373844.76, 2);
    expect(normalizeExternalPrice(1500000, 100)).toBe(15000);
    expect(normalizeExternalPrice(1218600000, 100)).toBe(12186000);
  });

  it("corrige solo crudos enormes, no pesos mid-range", () => {
    expect(coerceStoredRetailPrice(37384476, 100)).toBeCloseTo(373844.76, 2);
    // Gabinete ya en pesos: NO dividir (antes → 3405)
    expect(coerceStoredRetailPrice(340500, 100)).toBe(340500);
    expect(coerceStoredRetailPrice(15000, 100)).toBe(15000);
    expect(coerceStoredRetailPrice(373844.76, 100)).toBeCloseTo(373844.76, 2);
    expect(coerceStoredRetailPrice(12186000, 100)).toBe(12186000);
  });

  it("detecta divisor solo con mediana absurda", () => {
    expect(detectPriceDivisor([1.2e9, 1.1e9, 1.0e9, 9e8, 8e8])).toBe(100);
    expect(detectPriceDivisor([15000, 18000, 22000, 19000, 21000])).toBe(1);
    // Catálogo ARS normal (≥100k) NO es centavos
    expect(detectPriceDivisor([340500, 380000, 410000, 290000, 355000])).toBe(1);
  });

  it("repara falso ÷100 vs costo", () => {
    expect(repairImplausibleRetailPrice(3405, 296_000)).toBe(340500);
    expect(repairImplausibleRetailPrice(340500, 296_000)).toBe(340500);
    expect(repairImplausibleRetailPrice(15000, 12000)).toBe(15000);
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
    expect(passesRelevanceGate(exact, tokens)).toBe(true);
    expect(passesRelevanceGate(fan, tokens)).toBe(false);
    expect(exact.score).toBeGreaterThan(fan.score);
  });
});
