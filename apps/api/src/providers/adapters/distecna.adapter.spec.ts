import { DistecnaAdapter } from "./distecna.adapter";
import {
  DistecnaClient,
  applyDistecnaDetail,
  cleanDistecnaCode,
  detailPatchFromDistecna,
  distecnaTaxPoints,
  hasDistecnaCatalogAccess,
  hasDistecnaOrderAccess,
  mapDistecnaListProduct,
  normalizeDistecnaCurrency,
  parseDistecnaCredentials,
  productTypeFromRaw,
  shouldRetryDistecna,
  distecnaErrorMessage,
  resolveDistecnaFetchVia,
  resolveDistecnaEgress,
} from "../distecna-client";

const LIST = {
  code: "LOG939-001553",
  sku: "939-001553",
  stock: 17,
  currency: "U$S",
  price: 286.85,
  iva: 0.21,
  ii: 0,
};

const DETAIL = {
  name: "OptiPlex Micro Form Factor (7020)",
  brand: "Dell Technologies",
  subBrand: "Dell - Enterprise",
  category: "Computadoras de Escritorio",
  code: "DEL3000182761879-1",
  sku: "3000182761879-1",
  ean: ".",
  upc: ".",
  description: null,
  fullDescription: null,
  attributes: [],
  images: [
    "https://docs.distecna.com/articles/DEL3000182761879-1/DEL3000182761879-1·p.jpg",
  ],
  stock: 0,
  currency: "U$S",
  price: 0,
  iva: 0.105,
  ii: 0,
};

describe("mapDistecnaListProduct", () => {
  it("convierte IVA 0.21 a puntos y U$S a USD, con nombre placeholder", () => {
    const p = mapDistecnaListProduct(LIST);
    expect(p.externalId).toBe("LOG939-001553");
    expect(p.sku).toBe("939-001553");
    expect(p.name).toBe("939-001553");
    expect(p.price).toBe(286.85);
    expect(p.currency).toBe("USD");
    expect(p.ivaPercent).toBe(21);
    expect(p.stock).toBe(17);
    expect(p.raw).toEqual(LIST);
  });

  it("deja el type en raw cuando viene del listado V2", () => {
    const p = mapDistecnaListProduct({ ...LIST, type: "NWOTRO", currency: "USD" });
    expect(productTypeFromRaw(p.raw)).toBe("NWOTRO");
    expect(p.currency).toBe("USD");
  });
});

describe("detailPatchFromDistecna", () => {
  it("completa nombre, marca, categoría y foto; ignora ean '.'", () => {
    const patch = detailPatchFromDistecna(DETAIL);
    expect(patch.name).toBe("OptiPlex Micro Form Factor (7020)");
    expect(patch.brand).toBe("Dell Technologies");
    expect(patch.category).toBe("Computadoras de Escritorio");
    expect(patch.tags).toBe("Línea: Dell - Enterprise");
    expect(patch.imageUrl).toMatch(/·p\.jpg$/);
    expect(patch.ean).toBeUndefined();
    expect(patch.ivaPercent).toBe(10.5);
    expect(patch.currency).toBe("USD");
    expect(patch.price).toBeUndefined();
    expect(patch.stock).toBeUndefined();
  });

  it("conserva type del detalle V2 para armar el pedido", () => {
    const patch = detailPatchFromDistecna({ ...DETAIL, type: "NWOTRO", ean: "7790000000000" });
    expect(productTypeFromRaw(patch.raw)).toBe("NWOTRO");
    expect(patch.ean).toBe("7790000000000");
  });

  it("no pisa precio/stock del listado con ceros de la ficha", () => {
    const base = mapDistecnaListProduct(LIST);
    const merged = applyDistecnaDetail(base, DETAIL);
    expect(merged.name).toBe("OptiPlex Micro Form Factor (7020)");
    expect(merged.brand).toBe("Dell Technologies");
    expect(merged.imageUrl).toMatch(/·p\.jpg$/);
    expect(merged.price).toBe(286.85);
    expect(merged.stock).toBe(17);
  });
});

describe("distecnaTaxPoints / currency / credentials", () => {
  it("normaliza tasas 0.21 y 0.105, e II 0.105", () => {
    expect(distecnaTaxPoints(0.21)).toBe(21);
    expect(distecnaTaxPoints(0.105)).toBe(10.5);
    expect(distecnaTaxPoints(21)).toBe(21);
    expect(distecnaTaxPoints(0)).toBe(0);
    expect(distecnaTaxPoints(undefined)).toBeUndefined();
  });

  it("unifica U$S y USD", () => {
    expect(normalizeDistecnaCurrency("U$S")).toBe("USD");
    expect(normalizeDistecnaCurrency("USD")).toBe("USD");
  });

  it("toma api_key o token, y user/pass juntos para pedidos", () => {
    const a = parseDistecnaCredentials({ token: "abc", user: "u", password: "p", environment: "qa" });
    expect(a.apiKey).toBe("abc");
    expect(a.environment).toBe("qa");
    expect(hasDistecnaCatalogAccess(a)).toBe(true);
    expect(hasDistecnaOrderAccess(a)).toBe(true);
    const b = parseDistecnaCredentials({ api_key: "k" });
    expect(hasDistecnaCatalogAccess(b)).toBe(true);
    expect(hasDistecnaOrderAccess(b)).toBe(false);
    expect(cleanDistecnaCode(".")).toBeUndefined();
    const both = DistecnaClient.fromCredentials({ api_key: "k", user: "u", password: "p" });
    expect(both.usesV2Catalog).toBe(false);
  });
});

describe("shouldRetryDistecna", () => {
  const http = (status: number) => ({ response: { status } });

  it("reintenta 429/503 una vez y no reintenta 401 ni 500", () => {
    expect(shouldRetryDistecna(http(429), 0)).toBe(true);
    expect(shouldRetryDistecna(http(503), 1)).toBe(true);
    expect(shouldRetryDistecna(http(429), 2)).toBe(false);
    expect(shouldRetryDistecna(http(401), 0)).toBe(false);
    expect(shouldRetryDistecna(http(500), 0)).toBe(false);
  });

  it("no reintenta canceled/timeout: el front tiene que ver el error, no colgarse", () => {
    expect(shouldRetryDistecna({ code: "ERR_CANCELED", message: "canceled" }, 0)).toBe(false);
    expect(shouldRetryDistecna(new Error("timeout of 20000ms exceeded"), 0)).toBe(false);
    expect(distecnaErrorMessage({ code: "ERR_CANCELED", message: "canceled" }, "x")).toMatch(/8096/);
    expect(distecnaErrorMessage({ code: "ERR_CANCELED", message: "canceled" }, "x")).not.toMatch(/canceled/i);
  });
});

describe("resolveDistecnaFetchVia / egress", () => {
  const keys = [
    "DISTECNA_FETCH_VIA_URL",
    "RETAIL_HG_FETCH_VIA_URL",
    "CORS_ORIGIN",
    "WEB_ORIGIN",
    "FRONTEND_URL",
    "RAILWAY_ENVIRONMENT",
    "RAILWAY_PROJECT_ID",
    "DISTECNA_PROXY_URL",
    "NEW_TREE_PROXY_URL",
  ];
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it("arma /api/distecna-fetch desde el fetch de HardGamers", () => {
    process.env.RETAIL_HG_FETCH_VIA_URL = "https://app.example.com/api/retail-fetch";
    expect(resolveDistecnaFetchVia()).toBe("https://app.example.com/api/distecna-fetch");
  });

  it("en Railway usa el front (CORS) para salir a :8096", () => {
    process.env.RAILWAY_ENVIRONMENT = "production";
    process.env.CORS_ORIGIN = "https://nodo.example.com";
    const e = resolveDistecnaEgress();
    expect(e.mode).toBe("via");
    expect(e.via).toBe("https://nodo.example.com/api/distecna-fetch");
  });
});

describe("DistecnaAdapter.syncAll", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("avisa expectedTotal del listado antes de persistir la primera página", async () => {
    const adapter = new DistecnaAdapter();
    const order: string[] = [];
    jest.spyOn(DistecnaClient, "fromCredentials").mockReturnValue({
      listProducts: jest
        .fn()
        .mockResolvedValueOnce({ total: 3197, offset: 0, products: [LIST] })
        .mockResolvedValue({ total: 3197, offset: 150, products: [] }),
      getDetail: jest.fn().mockResolvedValue(DETAIL),
    } as unknown as DistecnaClient);

    await adapter.syncAll(
      { api_key: "k" },
      async (items) => {
        order.push(`page:${items.length}`);
      },
      async (meta) => {
        if (meta.expectedTotal) order.push(`total:${meta.expectedTotal}`);
      }
    );

    expect(order[0]).toBe("total:3197");
    expect(order[1]).toBe("page:1");
  });

  it("persiste nombre y foto de la ficha en la misma tanda, no el SKU", async () => {
    const adapter = new DistecnaAdapter();
    const pages: { name: string; imageUrl?: string; price?: number }[][] = [];
    jest.spyOn(DistecnaClient, "fromCredentials").mockReturnValue({
      listProducts: jest
        .fn()
        .mockResolvedValueOnce({ total: 1, offset: 0, products: [LIST] })
        .mockResolvedValue({ total: 1, offset: 150, products: [] }),
      getDetail: jest.fn().mockResolvedValue(DETAIL),
    } as unknown as DistecnaClient);

    await adapter.syncAll({ api_key: "k" }, async (items) => {
      pages.push(items.map((p) => ({ name: p.name, imageUrl: p.imageUrl, price: p.price })));
    });

    expect(pages[0][0]).toEqual({
      name: "OptiPlex Micro Form Factor (7020)",
      imageUrl: DETAIL.images[0],
      price: 286.85,
    });
  });
});
