import {
  catalogKey,
  computePurchaseInsights,
  extractOrderLines,
  UNKNOWN_BRAND,
  UNKNOWN_CATEGORY,
} from "./purchase-analytics";

describe("extractOrderLines", () => {
  it("lee ítems offline, Elit/Invid y Grupo Núcleo", () => {
    const offline = extractOrderLines({
      id: "o1",
      provider: "INVID",
      status: "OFFLINE",
      channel: "OFFLINE",
      createdAt: "2026-08-01T12:00:00.000Z",
      items: [{ externalId: "A1", name: "Mother", qty: 2, unitPrice: 10, lineTotal: 20 }],
    });
    expect(offline).toEqual([
      expect.objectContaining({ sku: "A1", qty: 2, spendUsd: 20, channel: "OFFLINE", provider: "INVID" }),
    ]);

    const elit = extractOrderLines({
      id: "o2",
      provider: "ELIT",
      status: "CREATED",
      createdAt: "2026-08-02T12:00:00.000Z",
      items: [{ code: "18636", qty: 1, name: "AP Cudy", price: 12.5, subtotal: 12.5 }],
    });
    expect(elit[0]).toMatchObject({ sku: "18636", spendUsd: 12.5, channel: "ONLINE" });

    const gn = extractOrderLines({
      id: "o3",
      provider: "GRUPO_NUCLEO",
      status: "CREATED",
      createdAt: "2026-08-03T12:00:00.000Z",
      items: [{ code: "1429", qty: 3, name: "Cable", priceUsd: 2.33 }],
    });
    expect(gn[0]).toMatchObject({ sku: "1429", qty: 3, spendUsd: 6.99 });
  });

  it("ignora ítems sin código o cantidad 0", () => {
    const lines = extractOrderLines({
      id: "o",
      provider: "AIR",
      status: "CREATED",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      items: [{ name: "sin id", qty: 1, price: 10 }, { code: "X", qty: 0, price: 10 }, null],
    });
    expect(lines).toHaveLength(0);
  });
});

describe("computePurchaseInsights", () => {
  const catalog = {
    [catalogKey("ELIT", "NB")]: {
      brand: "Asus",
      category: "Notebooks",
      subcategory: "Gaming",
      name: "ROG",
      imageUrl: null,
      currentPrice: 110,
      stock: 4,
    },
    [catalogKey("INVID", "MOU")]: {
      brand: "Logitech",
      category: "Periféricos",
      subcategory: "Mouse",
      name: "G203",
      imageUrl: null,
      currentPrice: 8,
      stock: 20,
    },
  };

  const orders = [
    {
      id: "a",
      provider: "ELIT",
      status: "CREATED",
      channel: "ONLINE",
      createdAt: "2026-07-10T15:00:00.000Z",
      total: 200,
      items: [{ code: "NB", qty: 2, name: "ROG", price: 100, subtotal: 200 }],
    },
    {
      id: "b",
      provider: "INVID",
      status: "OFFLINE",
      channel: "OFFLINE",
      createdAt: "2026-08-10T15:00:00.000Z",
      total: 24,
      items: [{ externalId: "MOU", name: "G203", qty: 3, unitPrice: 8, lineTotal: 24 }],
    },
    {
      id: "c",
      provider: "AIR",
      status: "CREATED",
      createdAt: "2026-08-12T15:00:00.000Z",
      items: [{ code: "UNK", qty: 1, name: "Algo", price: 50, subtotal: 50 }],
    },
  ];

  it("agrega spend, marcas, categorías y mix de canal de un solo lote", () => {
    const report = computePurchaseInsights(orders, catalog, {
      tenantName: "Local Centro",
      periodDays: 90,
      previousSpendUsd: 137,
      catalogStats: {
        skus: 400,
        inStock: 310,
        lastSyncAt: "2026-08-20T00:00:00.000Z",
        byProvider: [{ provider: "ELIT", skus: 200, inStock: 150, lastSyncAt: "2026-08-20T00:00:00.000Z" }],
        byBrand: [],
        byCategory: [],
      },
    });

    expect(report.tenantName).toBe("Local Centro");
    expect(report.kpis.spendUsd).toBe(274);
    expect(report.kpis.orders).toBe(3);
    expect(report.kpis.units).toBe(6);
    expect(report.kpis.uniqueSkus).toBe(3);
    expect(report.kpis.uniqueBrands).toBe(3);
    expect(report.kpis.catalogSkus).toBe(400);
    expect(report.kpis.spendDeltaPercent).toBe(100);

    const elit = report.byProvider.find((p) => p.provider === "ELIT");
    expect(elit?.spendUsd).toBe(200);
    expect(elit?.share).toBe(73);
    expect(elit?.catalogSkus).toBe(200);

    expect(report.byBrand[0]).toMatchObject({ key: "Asus", spendUsd: 200 });
    expect(report.byCategory.some((c) => c.key === "Notebooks")).toBe(true);
    expect(report.byCategory.some((c) => c.key === UNKNOWN_CATEGORY)).toBe(true);

    const unknown = report.topProducts.find((p) => p.sku === "UNK");
    expect(unknown?.brand).toBe(UNKNOWN_BRAND);
    expect(unknown?.category).toBe(UNKNOWN_CATEGORY);

    const rog = report.topProducts.find((p) => p.sku === "NB");
    expect(rog).toMatchObject({ brand: "Asus", lastPaidUsd: 100, currentUsd: 110, deltaPercent: 10, stock: 4 });

    expect(report.channelMix.find((c) => c.channel === "OFFLINE")?.spendUsd).toBe(24);
    expect(report.concentration.providers.top1).toBe(73);
    expect(report.brandProviders).toEqual(
      expect.arrayContaining([expect.objectContaining({ brand: "Asus", provider: "ELIT", spendUsd: 200 })])
    );
    expect(report.recentOrders[0].id).toBe("c");

    expect(report.byMonthDay).toHaveLength(31);
    expect(report.byMonthDay[9]).toMatchObject({ day: 10, spendUsd: 224, orders: 2 });
    expect(report.byMonthDay[11]).toMatchObject({ day: 12, spendUsd: 50, orders: 1 });
    expect(elit?.avgTicketUsd).toBe(200);
    expect(elit?.onlineSpendUsd).toBe(200);
    expect(elit?.uniqueSkus).toBe(1);
    expect(elit?.uniqueBrands).toBe(1);
    expect(elit?.firstBoughtAt).toBe("2026-07-10T15:00:00.000Z");
    expect(elit?.byMonth.some((m) => m.spendUsd === 200)).toBe(true);
  });

  it("compara el spend de una marca contra el período anterior", () => {
    const report = computePurchaseInsights(orders, catalog, {
      tenantName: "Local Centro",
      periodDays: 90,
      previousSpendBy: { brands: { Asus: 100 } },
    });
    const asus = report.byBrand.find((b) => b.key === "Asus");
    expect(asus?.previousSpendUsd).toBe(100);
    expect(asus?.spendDeltaPercent).toBe(100);
    expect(asus?.avgTicketUsd).toBe(200);
    expect(asus?.uniqueProviders).toBe(1);
    expect(asus?.byWeekday.some((d) => d.spendUsd > 0)).toBe(true);
  });

  it("un lote vacío no inventa compras de otro comercio", () => {
    const report = computePurchaseInsights([], {}, { tenantName: "Otro local", periodDays: 30 });
    expect(report.kpis.spendUsd).toBe(0);
    expect(report.kpis.orders).toBe(0);
    expect(report.topProducts).toEqual([]);
    expect(report.byProvider).toEqual([]);
    expect(report.tenantName).toBe("Otro local");
  });
});
