import { detectKnownBrand, productsMatchingBrand, suggestBrands } from "./brand-suggestions";

const sentey = [
  { externalId: "1", name: "KIT Sentey TM50 c/Fuente LNZ FB600-LX, Formato MICRO ATX, front mesh" },
  { externalId: "2", name: "Gabinete KIT Sentey TM10 c/Fuente LNZ, gabinete vidrio templado" },
  { externalId: "3", name: "Fuente Lnz SX550-TS - (CABLES LARGOS COLOR METAL ) OEM BULK" },
  { externalId: "4", name: "Fuente Lnz SX700-TS - BOX RETAIL, 2xPCI-E 6+2, 35Amp" },
  { externalId: "5", name: "Gabinete Sentey Gamer M-ATX vidrio templado, 3 coolers A-RGB, garantia 12 meses" },
  { externalId: "6", name: "Gabinete Sentey Mesh ATX, filtro anti polvo, garantia 12 meses" },
  { externalId: "7", name: "Cooler Sentey 120mm A-RGB PWM, garantia 12 meses" },
];

describe("suggestBrands", () => {
  test("detecta la palabra repetida que parece marca y descarta las genéricas del rubro", () => {
    const out = suggestBrands(sentey, new Set());
    const brands = out.map((c) => c.brand);
    expect(brands[0]).toBe("Sentey");
    expect(brands).toContain("LNZ");
    expect(brands).not.toContain("Gabinete");
    expect(brands).not.toContain("Garantia");
    expect(brands).not.toContain("Fuente");
    const s = out.find((c) => c.brand === "Sentey")!;
    expect(s.count).toBe(5);
    expect(s.externalIds).toEqual(["1", "2", "5", "6", "7"]);
  });

  test("una marca conocida sube aunque aparezca poco, y conserva su grafía", () => {
    const products = [
      { externalId: "a", name: "Mouse Evolabs EVO-100 gamer" },
      { externalId: "b", name: "Teclado mecanico Redragon K552" },
      { externalId: "c", name: "Auricular Redragon H510" },
    ];
    const out = suggestBrands(products, new Set(["evolabs", "redragon"]));
    expect(out.map((c) => c.brand)).toEqual(expect.arrayContaining(["Evolabs", "Redragon"]));
    expect(out.find((c) => c.brand === "Evolabs")?.known).toBe(true);
  });

  test("los códigos de modelo no son marcas", () => {
    const products = Array.from({ length: 5 }, (_, i) => ({ externalId: String(i), name: `Fuente Lnz SX550-TS v${i}` }));
    const out = suggestBrands(products, new Set());
    expect(out.map((c) => c.normalized)).not.toContain("sx550-ts");
  });

  test("la marca también puede venir en tags o categoría", () => {
    const products = Array.from({ length: 4 }, (_, i) => ({ externalId: String(i), name: `Producto ${i}`, extra: ["Evolabs"] }));
    const out = suggestBrands(products, new Set());
    expect(out[0].brand).toBe("Evolabs");
  });

  test("productsMatchingBrand compara por palabra entera", () => {
    expect(productsMatchingBrand(sentey, "LNZ")).toEqual(["1", "2", "3", "4"]);
    expect(productsMatchingBrand(sentey, "sen")).toEqual([]);
  });
});

describe("detectKnownBrand", () => {
  const known = new Map([["sentey", "Sentey"], ["lnz", "LNZ"], ["evolabs", "Evolabs"]]);
  test("devuelve la primera marca conocida que aparece en el nombre, con su nombre canónico", () => {
    expect(detectKnownBrand({ externalId: "1", name: "KIT Sentey TM50 c/Fuente LNZ" }, known)).toBe("Sentey");
    expect(detectKnownBrand({ externalId: "2", name: "Fuente Lnz SX550-TS" }, known)).toBe("LNZ");
    expect(detectKnownBrand({ externalId: "3", name: "Gabinete generico", extra: ["EVOLABS"] }, known)).toBe("Evolabs");
    expect(detectKnownBrand({ externalId: "4", name: "Mouse Redragon" }, known)).toBeNull();
  });
});

