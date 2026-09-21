import { mapPolytechProduct, parsePolytechPercent, polytechMoney, polytechOrderableQty } from "../polytech-client";

const HIKSEMI = {
  source_id: "20484",
  title: "Disco Solido Ssd 256 Gb Nvme HikSemi PCI3",
  brand: "Hiksemi",
  internal_code: "HS-SSD-WAVE(P) 256G",
  vat: "10.50000000000000000000000000000000000000000000000000",
  description: "El HIKSEMI WAVE(P) es la variante de alto rendimiento.",
  share_link: "https://mallweb.page.link/3hKZ",
  search_terms: ["disco solido", "hiksemi"],
  category: [
    { name: "Almacenamiento", id: "323" },
    { name: "Disco de Estado Solido", id: "261" },
  ],
  ids: [
    { id_type: 1, id: "20484" },
    { id_type: 5, id: "HS-SSD-WAVE(P) 256G" },
    { id_type: 3, id: "6974202725709" },
  ],
  offers: [
    {
      stock: 10,
      restocking_quantity: 0,
      price_without_vat: { currency: "USD", amount: "47.47" },
      price: { currency: "USD", amount: "52.45" },
    },
  ],
  images: [
    {
      url: "https://storage.googleapis.com/mallweb/products/small.jpg",
      width: 96,
      thumbnails: [
        { url: "https://storage.googleapis.com/mallweb/products/small.jpg", width: 96 },
        { url: "https://storage.googleapis.com/mallweb/products/large.jpg", width: 1500 },
      ],
    },
  ],
  package_dimensions: {
    weight: { value: "0.02", unit: "kg" },
    width: { value: 8, unit: "cm" },
  },
};

describe("mapPolytechProduct", () => {
  it("mapea neto, IVA, EAN, categoría e imagen grande", () => {
    const product = mapPolytechProduct(HIKSEMI);
    expect(product).toMatchObject({
      externalId: "20484",
      sku: "HS-SSD-WAVE(P) 256G",
      partNumber: "HS-SSD-WAVE(P) 256G",
      ean: "6974202725709",
      name: "Disco Solido Ssd 256 Gb Nvme HikSemi PCI3",
      brand: "Hiksemi",
      category: "Almacenamiento",
      subcategory: "Disco de Estado Solido",
      price: 47.47,
      finalPrice: 52.45,
      currency: "USD",
      ivaPercent: 10.5,
      stock: 10,
      stockStatus: "in_stock",
      imageUrl: "https://storage.googleapis.com/mallweb/products/large.jpg",
      weight: 0.02,
      weightUnit: "kg",
      width: 8,
      tags: "disco solido, hiksemi",
    });
    const raw = product?.raw as { images?: { thumbnails?: unknown }[] };
    expect(raw.images?.[0]?.thumbnails).toBeUndefined();
  });

  it("descarta un ítem sin source_id", () => {
    expect(mapPolytechProduct({ title: "Sin id" })).toBeNull();
  });

  it("marca reingreso cuando no hay stock pero hay restocking", () => {
    const product = mapPolytechProduct({
      ...HIKSEMI,
      offers: [{ ...HIKSEMI.offers[0], stock: 0, restocking_quantity: 4 }],
    });
    expect(product?.stock).toBe(0);
    expect(product?.stockStatus).toBe("restocking");
  });
});

describe("parsePolytechPercent", () => {
  it("lee el porcentaje de percepción", () => {
    expect(parsePolytechPercent("3.00 %")).toBe(3);
    expect(parsePolytechPercent("")).toBeNull();
  });
});

describe("polytechMoney", () => {
  it("lee amount y moneda", () => {
    expect(polytechMoney({ currency: "USD", amount: "52.45" })).toEqual({ amount: 52.45, currency: "USD" });
  });
});

describe("polytechOrderableQty", () => {
  it("usa el stock, o hasta 10 del reingreso", () => {
    expect(polytechOrderableQty(10, 0)).toBe(10);
    expect(polytechOrderableQty(0, 4)).toBe(4);
    expect(polytechOrderableQty(0, 40)).toBe(10);
    expect(polytechOrderableQty(0, 0)).toBe(0);
  });
});
