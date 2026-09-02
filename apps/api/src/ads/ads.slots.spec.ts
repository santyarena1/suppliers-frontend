import { DEFAULT_AD_SLOTS } from "./ads.slots";

describe("DEFAULT_AD_SLOTS", () => {
  it("cada espacio tiene clave única y precio", () => {
    const keys = DEFAULT_AD_SLOTS.map((slot) => slot.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(DEFAULT_AD_SLOTS.every((slot) => slot.monthlyPriceUsd > 0)).toBe(true);
    expect(DEFAULT_AD_SLOTS.every((slot) => slot.maxConcurrent >= 1)).toBe(true);
  });

  it("descubrimiento y búsqueda cubren los lugares de la UI", () => {
    const byKey = Object.fromEntries(DEFAULT_AD_SLOTS.map((slot) => [slot.key, slot]));
    expect(byKey.discovery.placement).toBe("discovery");
    expect(byKey.search_sponsored.placement).toBe("search");
    expect(byKey.hero_main.placement).toBe("search");
    expect(byKey.strip.placement).toBe("search");
    expect(byKey.news_hero.placement).toBe("news");
    expect(byKey.news_hero.maxConcurrent).toBe(5);
  });
});
