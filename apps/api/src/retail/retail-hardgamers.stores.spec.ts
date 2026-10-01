import {
  HARDGAMERS_FALLBACK_SLUGS,
  mergeHardgamersSlugs,
  parseHardgamersStoreSlugs,
  storesMatch,
} from "./retail-hardgamers.stores";

describe("parseHardgamersStoreSlugs", () => {
  it("saca slugs de href relativos y absolutos", () => {
    const html = `
      <a href="/stores/rocketHard">Rocket Hard</a>
      <a href="https://www.hardgamers.com.ar/stores/bracatech?utm=1">Bracatech</a>
      <a href="/stores/thegamershop">The Gamer Shop</a>
    `;
    expect(parseHardgamersStoreSlugs(html).sort()).toEqual([
      "bracatech",
      "rocketHard",
      "thegamershop",
    ]);
  });

  it("no inventa slugs de otras rutas", () => {
    expect(parseHardgamersStoreSlugs('<a href="/products/rocketHard">x</a>')).toEqual([]);
  });
});

describe("storesMatch", () => {
  it("iguala el nombre del agregador con el slug de HardGamers", () => {
    expect(storesMatch("The Gamer Shop", "thegamershop")).toBe(true);
    expect(storesMatch("Bracatech", "bracatech")).toBe(true);
    expect(storesMatch("SCP Hardstore", "scpHardStore")).toBe(true);
    expect(storesMatch("Vertex Retail", "vertexRetail")).toBe(true);
  });

  it("reconoce Rodk como Rocket Hard", () => {
    expect(storesMatch("Rodk", "rocketHard")).toBe(true);
    expect(storesMatch("Rodk", "Rocket Hard")).toBe(true);
  });

  it("no mezcla locales distintos", () => {
    expect(storesMatch("HardCore", "hardloots")).toBe(false);
    expect(storesMatch("Bracatech", "katech")).toBe(false);
    expect(storesMatch("Mexx", "maximus")).toBe(false);
  });
});

describe("mergeHardgamersSlugs", () => {
  it("une descubiertos con el respaldo sin repetir", () => {
    const merged = mergeHardgamersSlugs(["rocketHard", "nuevoLocal"], HARDGAMERS_FALLBACK_SLUGS);
    expect(merged[0]).toBe("rocketHard");
    expect(merged).toContain("nuevoLocal");
    expect(merged).toContain("bracatech");
    expect(merged.filter((s) => s === "rocketHard")).toHaveLength(1);
  });
});
