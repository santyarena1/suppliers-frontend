import { fichaRaw, toProductView } from "./catalog-view";
import type { ProviderSyncCache, TenantProductOffer } from "@prisma/client";

function ficha(overrides: Partial<ProviderSyncCache> = {}): ProviderSyncCache {
  return {
    id: "ficha-1",
    provider: "ELIT",
    externalId: "SKU-1",
    sku: "SKU-1",
    partNumber: null,
    ean: null,
    name: "Mouse",
    brand: "Logitech",
    category: null,
    subcategory: null,
    description: null,
    longDescription: null,
    imageUrl: null,
    productUrl: null,
    locationAir: null,
    warranty: null,
    weight: null,
    weightUnit: null,
    height: null,
    width: null,
    length: null,
    dimensionsUnit: null,
    volume: null,
    tags: null,
    raw: {
      nombre: "Mouse",
      marca: "Logitech",
      precio: 999,
      "PRECIO FINAL": 1200,
      price: { finalPrice: 1200, percepcion: 3.5, iva: 21 },
      IVA: 21,
    },
    syncedAt: new Date("2026-09-23T12:00:00Z"),
    updatedAt: new Date("2026-09-23T12:00:00Z"),
    ...overrides,
  };
}

function offer(tenantId: string, price: number): TenantProductOffer {
  return {
    id: `offer-${tenantId}`,
    tenantId,
    provider: "ELIT",
    externalId: "SKU-1",
    price: price as unknown as TenantProductOffer["price"],
    finalPrice: (price * 1.21) as unknown as TenantProductOffer["finalPrice"],
    currency: "USD",
    ivaPercent: 21 as unknown as TenantProductOffer["ivaPercent"],
    stock: 4,
    stockStatus: "IN_STOCK",
    active: true,
    needsResync: false,
    source: "SYNC",
    syncedAt: new Date("2026-09-23T12:00:00Z"),
    updatedAt: new Date("2026-09-23T12:00:00Z"),
  };
}

describe("fichaRaw", () => {
  it("deja nombre y alícuota, y saca los importes de la ficha", () => {
    expect(
      fichaRaw("ELIT", {
        nombre: "Mouse",
        IVA: 21,
        precio: 999,
        "PRECIO FINAL": 1200,
        price: { finalPrice: 1200 },
      })
    ).toEqual({ nombre: "Mouse", IVA: 21 });
  });

  it("en Invid vacía las columnas de precio y deja la alícuota", () => {
    const row = ["1", "Mouse", "Logi", "PN", "EAN", "US$", 80, 21, 0, 96.8, "", "ok"];
    const raw = fichaRaw("INVID", row) as unknown[];
    expect(raw[1]).toBe("Mouse");
    expect(raw[6]).toBeNull();
    expect(raw[7]).toBe(21);
    expect(raw[9]).toBeNull();
  });
});

describe("toProductView", () => {
  it("los dos locales ven la misma ficha y cada uno su precio", () => {
    const product = ficha();
    const localA = toProductView(product, offer("local-a", 80));
    const localB = toProductView(product, offer("local-b", 55));

    expect(localA.name).toBe("Mouse");
    expect(localB.name).toBe("Mouse");
    expect(localA.raw).toEqual(localB.raw);
    expect(localA.raw).toEqual({ nombre: "Mouse", marca: "Logitech", IVA: 21 });
    expect(localA.price).toBe(80);
    expect(localA.finalPrice).toBe(96.8);
    expect(localB.price).toBe(55);
    expect(localB.finalPrice).toBe(66.55);
  });
});
