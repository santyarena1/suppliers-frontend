import { pickRealDemo, type RealDemoCandidate } from "./onboarding-demo-real";

function offer(partial: Partial<RealDemoCandidate>): RealDemoCandidate {
  return {
    provider: "ELIT",
    externalId: Math.random().toString(36).slice(2),
    sku: "SKU",
    partNumber: null,
    ean: null,
    name: "Producto",
    brand: "Marca",
    category: "Periféricos",
    subcategory: null,
    description: null,
    longDescription: null,
    imageUrl: "https://img/x.jpg",
    warranty: null,
    price: 100,
    finalPrice: 100,
    ivaPercent: 21,
    stock: 10,
    currency: "USD",
    ...partial,
  };
}

const catalog: RealDemoCandidate[] = [
  offer({ provider: "ELIT", externalId: "e1", ean: "7790001234567", name: "Mouse Logitech G203", brand: "Logitech", price: 20, stock: 30 }),
  offer({ provider: "NEW_BYTES", externalId: "n1", ean: "7790001234567", name: "MOUSE LOGITECH G203 NEGRO", brand: "LOGITECH", price: 22, stock: 5 }),
  offer({ provider: "ELIT", name: "Monitor Samsung 24", brand: "Samsung", category: "Monitores" }),
  offer({ provider: "AIR", name: "SSD Kingston NV2 1TB", brand: "Kingston", category: "Almacenamiento" }),
  offer({ provider: "INVID", name: "Teclado Redragon Kumara", brand: "Redragon" }),
  offer({ provider: "ELIT", name: "Notebook Lenovo V15", brand: "Lenovo", category: "Notebooks" }),
  offer({ provider: "AIR", name: "Router TP-Link Archer", brand: "TP-Link", category: "Redes" }),
  offer({ provider: "ELIT", name: "Auriculares HyperX Cloud", brand: "HyperX" }),
  offer({ provider: "ELIT", name: "Monitor sin foto", imageUrl: null }),
  offer({ provider: "ELIT", name: "Monitor sin stock", stock: 0 }),
];

describe("pickRealDemo", () => {
  it("pone el mismo producto real en los dos distros demo con sus precios reales", () => {
    const demo = pickRealDemo(catalog)!;
    const pair = demo.products.filter((p) => p.ean === "7790001234567");
    expect(pair.map((p) => p.provider).sort()).toEqual(["LIST_DEMO_NORTE", "LIST_DEMO_SUR"]);
    expect(pair.map((p) => p.price).sort()).toEqual([20, 22]);
    expect(demo.comparisonQuery.toLowerCase()).toBe("logitech");
  });

  it("solo usa productos con foto, precio y stock", () => {
    const demo = pickRealDemo(catalog)!;
    expect(demo.products.some((p) => p.name.includes("sin foto") || p.name.includes("sin stock"))).toBe(false);
    expect(demo.products.every((p) => p.imageUrl && p.stock > 0 && p.price > 0)).toBe(true);
  });

  it("reparte el resto entre los dos distros y cubre varias categorías", () => {
    const demo = pickRealDemo(catalog)!;
    const names = demo.products.map((p) => p.name.toLowerCase()).join(" | ");
    for (const word of ["monitor", "ssd", "teclado", "notebook", "router"]) expect(names).toContain(word);
    const providers = new Set(demo.products.map((p) => p.provider));
    expect(providers).toEqual(new Set(["LIST_DEMO_NORTE", "LIST_DEMO_SUR"]));
  });

  it("los ids demo son únicos y estables", () => {
    const a = pickRealDemo(catalog)!.products.map((p) => p.externalId);
    expect(new Set(a).size).toBe(a.length);
    expect(pickRealDemo(catalog)!.products.map((p) => p.externalId)).toEqual(a);
  });

  it("sin un producto en dos distribuidores o con poco catálogo, no arma demo real", () => {
    expect(pickRealDemo(catalog.filter((c) => c.ean !== "7790001234567"))).toBeNull();
    expect(pickRealDemo(catalog.slice(0, 3))).toBeNull();
  });
});

describe("pickRealDemo · qué se compara", () => {
  it("prefiere un producto vistoso a un pendrive para la comparación", () => {
    const withPendrive = [
      offer({ provider: "ELIT", ean: "7790009999999", name: "Pen Drive Lexar 32GB", brand: "LEXAR", stock: 99 }),
      offer({ provider: "AIR", ean: "7790009999999", name: "Lexar V40 32GB", brand: "Lexar", stock: 50 }),
      ...catalog,
    ];
    expect(pickRealDemo(withPendrive)!.comparisonQuery.toLowerCase()).toBe("logitech");
  });
});
