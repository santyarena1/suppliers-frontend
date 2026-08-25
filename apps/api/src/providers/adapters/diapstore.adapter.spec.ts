import { mapDiapstoreProduct } from "./diapstore.adapter";

describe("mapDiapstoreProduct", () => {
  it("mapea la vista pública de api.cumar.com.ar y no inventa precio si viene null", () => {
    const p = mapDiapstoreProduct({
      id: "12bed98a-81e7-4f24-b4b3-361e4d18dcbb",
      sku: "AIS16GD556",
      name: 'AIMERICAN® "TELEPATHY" 16GB DDR5 5600MHZ SODIMM',
      description: 'AIMERICAN® "Telepathy" 16G DDR5 5600MHZ SODIMM',
      category: "Memorias RAM",
      subcategory: null,
      unit_price: null,
      currency: null,
      tax_rate: null,
      stock_quantity: 6,
      image_url: "https://www.cumar.com.ar/cdn/diapstore/AIS16GD556.png",
      thumbnail_url: "",
      status: "active",
    });
    expect(p.externalId).toBe("12bed98a-81e7-4f24-b4b3-361e4d18dcbb");
    expect(p.sku).toBe("AIS16GD556");
    expect(p.category).toBe("Memorias RAM");
    expect(p.stock).toBe(6);
    expect(p.price).toBeUndefined();
    expect(p.currency).toBeUndefined();
    expect(p.imageUrl).toMatch(/AIS16GD556\.png$/);
  });

  it("copia unit_price solo si es número", () => {
    const p = mapDiapstoreProduct({
      id: "1",
      name: "X",
      unit_price: 12.5,
      currency: "ARS",
    });
    expect(p.price).toBe(12.5);
    expect(p.currency).toBe("ARS");
  });

  it("copia tax_rate como alícuota de IVA si es número", () => {
    const p = mapDiapstoreProduct({
      id: "1",
      name: "X",
      unit_price: 100,
      tax_rate: 21,
    });
    expect(p.ivaPercent).toBe(21);
  });
});
