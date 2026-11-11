import { buildLastPurchaseIndex, normalizeProductText, searchPurchaseHistory } from "./purchase-history";
import type { OrderForAnalytics } from "./purchase-analytics";

function order(id: string, provider: string, createdAt: string, items: unknown[]): OrderForAnalytics {
  return { id, provider, status: "CREATED", channel: "ONLINE", items, createdAt };
}

const orders: OrderForAnalytics[] = [
  order("o3", "ELIT", "2026-03-02T15:00:00.000Z", [
    { externalId: "E-1", name: "Procesador AMD Ryzen 5 5600G AM4", qty: 2, unitPrice: 120 },
  ]),
  order("o2", "NEW_BYTES", "2026-01-10T13:00:00.000Z", [
    { externalId: "NB-77", name: "MICRO AMD RYZEN 5 5600G C/VIDEO", qty: 1, unitPrice: 118 },
    { externalId: "NB-80", name: "Mouse Trust Carve", qty: 3, unitPrice: 9 },
  ]),
  order("o1", "NEW_BYTES", "2025-11-20T13:00:00.000Z", [
    { externalId: "NB-77", name: "MICRO AMD RYZEN 5 5600G C/VIDEO", qty: 4, unitPrice: 130 },
  ]),
];

describe("normalizeProductText", () => {
  it("ignora mayúsculas, acentos y signos", () => {
    expect(normalizeProductText("RYZEN-5 5600G, Cámara")).toBe("ryzen 5 5600g camara");
  });
});

describe("searchPurchaseHistory", () => {
  it("encuentra todas las compras del producto, la más nueva primero", () => {
    const r = searchPurchaseHistory(orders, "5600g");
    expect(r.total).toBe(3);
    expect(r.lines.map((l) => l.orderId)).toEqual(["o3", "o2", "o1"]);
    expect(r.lastByProvider.map((p) => [p.provider, p.createdAt.slice(0, 10)])).toEqual([
      ["ELIT", "2026-03-02"],
      ["NEW_BYTES", "2026-01-10"],
    ]);
  });

  it("pide todas las palabras y acepta el código", () => {
    expect(searchPurchaseHistory(orders, "ryzen mouse").total).toBe(0);
    expect(searchPurchaseHistory(orders, "nb-80").lines[0].name).toBe("Mouse Trust Carve");
    expect(searchPurchaseHistory(orders, "5600 g").total).toBe(3);
  });

  it("no busca con menos de dos letras", () => {
    expect(searchPurchaseHistory(orders, "5").total).toBe(0);
    expect(searchPurchaseHistory(orders, "  ").lines).toEqual([]);
  });
});

describe("buildLastPurchaseIndex", () => {
  it("guarda la última compra por proveedor y código, y por nombre", () => {
    const idx = buildLastPurchaseIndex(orders);
    expect(idx.bySku["NEW_BYTES::NB-77"]).toMatchObject({ at: "2026-01-10T13:00:00.000Z", qty: 1 });
    expect(idx.byName[normalizeProductText("Procesador AMD Ryzen 5 5600G AM4")].provider).toBe("ELIT");
    // Nombres cortos no se indexan por nombre: juntarían productos distintos.
    expect(idx.byName[normalizeProductText("Mouse")]).toBeUndefined();
  });
});
