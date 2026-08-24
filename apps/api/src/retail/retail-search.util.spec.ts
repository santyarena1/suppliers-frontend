import {
  catalogLooksFalselyDivided,
  coerceStoredRetailPrice,
  detectPriceDivisor,
  isCentsBasedStore,
  isSaneRetailPrice,
  normalizeExternalPrice,
  repairImplausibleRetailPrice,
  repairPricesAgainstPeers,
  resolvePriceDivisor,
} from "./retail-price.util";
import {
  extractSearchTokens,
  normalizeSearchText,
  passesRelevanceGate,
  scoreRetailMatch,
} from "./retail-search.util";

describe("centavos: solo Multiplo", () => {
  it("reconoce Multiplo y nadie más", () => {
    expect(isCentsBasedStore("Multiplo", 31)).toBe(true);
    expect(isCentsBasedStore("MULTIPLO HARDWARE", 99)).toBe(true);
    expect(isCentsBasedStore("The Gamer Shop", 14)).toBe(false);
    expect(isCentsBasedStore("Gorila Games", 5)).toBe(false);
    expect(isCentsBasedStore("Gaming Point", 39)).toBe(false);
    expect(isCentsBasedStore("Bracatech", 37)).toBe(false);
    expect(isCentsBasedStore("SCP Hardstore", 18)).toBe(false);
  });

  it("resolvePriceDivisor ignora basura en DB", () => {
    expect(resolvePriceDivisor("Multiplo", 31)).toBe(100);
    expect(resolvePriceDivisor("The Gamer Shop", 14)).toBe(1);
  });
});

describe("API real: gabinete 4500X", () => {
  // Valores tomados de api.preciolider.com.ar (pesos, no centavos)
  const LIVE = {
    gamerShop: 340500,
    gorila: 357700,
    gamingPoint: 377700,
    bracatech: 330463,
    crosshair: 350717,
    espacioTek: 365000,
  };

  it("al ingerir sin divisor se guardan pesos intactos", () => {
    for (const precio of Object.values(LIVE)) {
      expect(normalizeExternalPrice(precio, 1)).toBe(precio);
    }
  });

  it("NO destruir pesos mid-range aunque el divisor de tienda diga 100", () => {
    // Escenario bug: tienda mal marcada priceDivisor=100, precio ya en pesos en DB
    expect(
      coerceStoredRetailPrice(340500, 100, { storeName: "The Gamer Shop", storeExternalId: 14 })
    ).toBe(340500);
    expect(
      coerceStoredRetailPrice(357700, 100, { storeName: "Gorila Games", storeExternalId: 5 })
    ).toBe(357700);
  });

  it("Multiplo crudo sí se divide; pesos Multiplo no se vuelven a dividir", () => {
    expect(normalizeExternalPrice(37384476, 100)).toBeCloseTo(373844.76, 2);
    expect(normalizeExternalPrice(1218600000, 100)).toBe(12186000);
    expect(
      coerceStoredRetailPrice(37384476, 100, { storeName: "Multiplo", storeExternalId: 31 })
    ).toBeCloseTo(373844.76, 2);
    expect(
      coerceStoredRetailPrice(373844.76, 100, { storeName: "Multiplo", storeExternalId: 31 })
    ).toBeCloseTo(373844.76, 2);
    expect(
      coerceStoredRetailPrice(340500, 100, { storeName: "Multiplo", storeExternalId: 31 })
    ).toBe(340500);
  });
});

describe("reparación de catálogos ÷100 falsos", () => {
  it("detecta top-mediana corrupta", () => {
    // Tras falso ÷100: gabinetes ~3.4k, notebooks ~26k
    const corrupt = [56970, 46610, 43755, 41970, 38405, 3405, 3577, 3777, 12000, 8500];
    expect(catalogLooksFalselyDivided(corrupt)).toBe(true);

    // Catálogo sano (API real page1)
    const sane = [5697000, 4661000, 4375500, 4197000, 3840500, 340500, 357700, 377700];
    expect(catalogLooksFalselyDivided(sane)).toBe(false);
  });

  it("peer-repair ×100 a outliers baratos", () => {
    const items = [
      { price: 3405, centsStore: false }, // Gamer Shop corrupto
      { price: 3577, centsStore: false }, // Gorila corrupto
      { price: 330463, centsStore: false }, // Bracatech ok
      { price: 350717, centsStore: false }, // Crosshair ok
      { price: 365000, centsStore: false }, // EspacioTek ok
    ];
    const out = repairPricesAgainstPeers(items);
    expect(out[0]).toBe(340500);
    expect(out[1]).toBe(357700);
    expect(out[2]).toBe(330463);
    expect(out[3]).toBe(350717);
    expect(out[4]).toBe(365000);
  });

  it("repair vs costo", () => {
    expect(repairImplausibleRetailPrice(3405, 296_000)).toBe(340500);
    expect(repairImplausibleRetailPrice(340500, 296_000)).toBe(340500);
  });

  it("detectPriceDivisor no marca catálogos ARS normales", () => {
    expect(detectPriceDivisor([340500, 380000, 410000, 290000, 355000])).toBe(1);
    expect(detectPriceDivisor([1.2e9, 1.1e9, 1.0e9, 9e8, 8e8])).toBe(100);
  });

  it("sanidad", () => {
    expect(isSaneRetailPrice(340500)).toBe(true);
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
