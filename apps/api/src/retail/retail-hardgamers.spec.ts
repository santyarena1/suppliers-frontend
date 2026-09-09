import { hardgamersExternalId } from "./retail-hardgamers.client";

/**
 * El id de esta fuente convive en la misma columna que el del agregador
 * principal, que siempre usa positivos. Lo único que no se puede romper es esa
 * separación: si un id cayera en positivo, pisaría un producto de la otra
 * fuente.
 */
describe("hardgamersExternalId", () => {
  it("siempre da un entero negativo", () => {
    for (const key of ["liontech:btk8r4", "store:hardcore", "maximus:zzz", "", "a"]) {
      const id = hardgamersExternalId(key);
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeLessThan(0);
    }
  });

  it("entra en el rango de un Int de Postgres", () => {
    for (let i = 0; i < 5000; i++) {
      const id = hardgamersExternalId(`tienda${i}:producto${i * 7}`);
      expect(id).toBeGreaterThanOrEqual(-2_147_483_648);
      expect(id).toBeLessThanOrEqual(2_147_483_647);
    }
  });

  it("es determinístico: la misma clave da siempre el mismo id", () => {
    expect(hardgamersExternalId("liontech:btk8r4")).toBe(hardgamersExternalId("liontech:btk8r4"));
  });

  it("separa tiendas de productos y tiendas entre sí", () => {
    expect(hardgamersExternalId("store:hardcore")).not.toBe(hardgamersExternalId("hardcore"));
    expect(hardgamersExternalId("store:hardcore")).not.toBe(hardgamersExternalId("store:maximus"));
  });

  it("no colisiona en un volumen realista de catálogo", () => {
    const seen = new Set<number>();
    let collisions = 0;
    for (let s = 0; s < 20; s++) {
      for (let p = 0; p < 1000; p++) {
        const id = hardgamersExternalId(`tienda${s}:art${p}`);
        if (seen.has(id)) collisions++;
        seen.add(id);
      }
    }
    // 20k claves sobre 2e9 valores: una colisión ya sería sospechosa.
    expect(collisions).toBe(0);
  });
});
