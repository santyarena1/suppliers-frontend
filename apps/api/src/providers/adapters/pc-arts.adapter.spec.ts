import {
  PC_ARTS_CATALOG_OP,
  PC_ARTS_STOCK_OP,
  fetchPcArtsCatalog,
  mapPcArtsProduct,
  parsePcArtsPage,
  type PcArtsFetch,
} from "./pc-arts.adapter";

const CATALOG = [
  {
    sku: "PA-NB-001",
    sku_desc: "Notebook Lenovo IdeaPad 3 15",
    category_desc: "Notebooks",
    brand: "Lenovo",
    images: [{ url: "https://cdn.pcarts.com/pa-nb-001.jpg" }],
  },
  { sku: "PA-MS-002", sku_desc: "Mouse Logitech G203", category_desc: "Mouses", brand: "Logitech", image_url: "https://cdn.pcarts.com/ms.jpg" },
  { sku: "PA-OLD-003", sku_desc: "Producto discontinuado", category_desc: "Varios" },
];
const STOCK = [
  { sku: "PA-NB-001", price: 450, stock: 4, tax_iva_rate: 10.5, tax_ii_rate: 0 },
  { sku: "PA-MS-002", price: 20, stock: 0, tax_iva_rate: 21, tax_ii_rate: 10 },
  { sku: "PA-NEW-004", price: 5, stock: 2, tax_iva_rate: 21 },
];

/** Simula la API paginando de a `pageSize` (más chico que el límite real para ejercitar el corte). */
function fakeApi(pageSize: number): { fetch: PcArtsFetch; calls: string[] } {
  const calls: string[] = [];
  const fetch: PcArtsFetch = async (operation, offset, limit) => {
    calls.push(`${operation}@${offset}/${limit}`);
    const all = operation === PC_ARTS_CATALOG_OP ? CATALOG : operation === PC_ARTS_STOCK_OP ? STOCK : [];
    const pageIndex = Math.floor(offset / limit);
    return { products: all.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize), total: Math.ceil(all.length / pageSize) * limit };
  };
  return { fetch, calls };
}

describe("parsePcArtsPage", () => {
  it("lee Products y Paging.total", () => {
    const page = parsePcArtsPage({ Products: [{ sku: "A" }, null, "x"], Paging: { total: "1200" } });
    expect(page.products).toEqual([{ sku: "A" }]);
    expect(page.total).toBe(1200);
  });

  it("sin JSON es error; sin lista es página vacía", () => {
    expect(() => parsePcArtsPage("<html>")).toThrow(/no es JSON/);
    expect(parsePcArtsPage({ error: "x" })).toEqual({ products: [], total: 0 });
  });
});

describe("fetchPcArtsCatalog", () => {
  it("recorre 1005 y 1004 y une por sku (stock/precio manda)", async () => {
    const { fetch, calls } = fakeApi(2);
    const merged = await fetchPcArtsCatalog(fetch, 0);
    expect(calls).toEqual(["1005@0/400", "1005@400/400", "1004@0/500", "1004@500/500"]);
    const bySku = Object.fromEntries(merged.map((m) => [m.sku as string, m]));
    expect(Object.keys(bySku).sort()).toEqual(["PA-MS-002", "PA-NB-001", "PA-NEW-004", "PA-OLD-003"]);
    expect(bySku["PA-NB-001"]).toMatchObject({ sku_desc: "Notebook Lenovo IdeaPad 3 15", price: 450, stock: 4 });
  });

  it("corta cuando una página viene vacía aunque Paging.total diga más", async () => {
    const calls: string[] = [];
    const fetch: PcArtsFetch = async (op, offset) => {
      calls.push(`${op}@${offset}`);
      return { products: offset === 0 ? [{ sku: "A" }] : [], total: 99_999 };
    };
    await fetchPcArtsCatalog(fetch, 0);
    expect(calls).toEqual(["1005@0", "1005@400", "1004@0", "1004@500"]);
  });
});

describe("mapPcArtsProduct", () => {
  it("mapea nombre, marca, categoría, imagen, neto USD, IVA y stock", async () => {
    const merged = await fetchPcArtsCatalog(fakeApi(10).fetch, 0);
    const p = mapPcArtsProduct(merged.find((m) => m.sku === "PA-NB-001")!)!;
    expect(p.externalId).toBe("PA-NB-001");
    expect(p.sku).toBe("PA-NB-001");
    expect(p.name).toBe("Notebook Lenovo IdeaPad 3 15");
    expect(p.brand).toBe("Lenovo");
    expect(p.category).toBe("Notebooks");
    expect(p.imageUrl).toBe("https://cdn.pcarts.com/pa-nb-001.jpg");
    expect(p.price).toBe(450);
    expect(p.currency).toBe("USD");
    expect(p.ivaPercent).toBe(10.5);
    expect(p.finalPrice).toBe(497.25);
    expect(p.stock).toBe(4);
  });

  it("los internos van al final, no al neto", () => {
    const p = mapPcArtsProduct({ ...CATALOG[1], ...STOCK[1] })!;
    expect(p.price).toBe(20);
    expect(p.finalPrice).toBe(26.2);
    expect(p.imageUrl).toBe("https://cdn.pcarts.com/ms.jpg");
  });

  it("solo en catálogo: sin precio ni stock inventados; sin nombre usa el sku", () => {
    const p = mapPcArtsProduct(CATALOG[2])!;
    expect(p.price).toBeUndefined();
    expect(p.currency).toBeUndefined();
    expect(p.stock).toBeUndefined();
    expect(mapPcArtsProduct(STOCK[2])!.name).toBe("PA-NEW-004");
    expect(mapPcArtsProduct({ price: 1 })).toBeNull();
  });
});
