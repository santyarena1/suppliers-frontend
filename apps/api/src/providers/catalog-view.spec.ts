import { rawForViewer, toProductView } from "./catalog-view";
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
      precio: 999,
      "PRECIO FINAL": 1200,
      price: { finalPrice: 1200, percepcion: 3.5, iva: 21 },
      IVA: 21,
    },
    rawOwnerTenantId: "local-a",
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

describe("rawForViewer", () => {
  const raw = { precio: 10, IVA: 21, marca: "Logitech" };

  it("deja el raw de la cuenta que sincronizó", () => {
    expect(rawForViewer(raw, "local-a", "local-a")).toEqual(raw);
  });

  it("una ficha sin dueño sigue compartida hasta el próximo sync", () => {
    expect(rawForViewer(raw, null, "local-b")).toEqual(raw);
  });

  it("a otro local le saca importes y percepciones, no la ficha", () => {
    expect(rawForViewer(raw, "local-a", "local-b")).toEqual({ IVA: 21, marca: "Logitech" });
  });
});

describe("toProductView", () => {
  it("el precio que ve cada local es el de su oferta, no el raw del otro", () => {
    const product = ficha();
    const propio = toProductView(product, offer("local-a", 80));
    const ajeno = toProductView(product, offer("local-b", 55));

    expect(propio.price).toBe(80);
    expect(propio.raw).toMatchObject({ precio: 999, IVA: 21 });
    expect(ajeno.price).toBe(55);
    expect(ajeno.finalPrice).toBe(66.55);
    expect(ajeno.raw).toEqual({ nombre: "Mouse", IVA: 21 });
    expect(ajeno).not.toHaveProperty("rawOwnerTenantId");
  });
});
