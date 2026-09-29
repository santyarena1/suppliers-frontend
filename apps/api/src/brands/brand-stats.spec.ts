import { buildSkuIndex, monthKeys, summarizeBrandPurchases, type BrandLine } from "./brand-stats";

const line = (over: Partial<BrandLine>): BrandLine => ({
  tenantId: "shop-1",
  orderId: "o1",
  provider: "ELIT",
  createdAt: "2026-09-10T12:00:00.000Z",
  sku: "E1",
  name: "Mouse G203",
  qty: 1,
  spendUsd: 10,
  ...over,
});

describe("summarizeBrandPurchases", () => {
  const index = buildSkuIndex(
    [
      { provider: "ELIT", externalId: "E1", itemId: "item-mouse", itemName: "Mouse G203" },
      { provider: "AIR", externalId: "A1", itemId: "item-mouse", itemName: "Mouse G203" },
    ],
    [
      { provider: "ELIT", externalId: "E1" },
      { provider: "ELIT", externalId: "K9" },
    ]
  );
  const from = new Date("2026-07-01T00:00:00Z");
  const now = new Date("2026-09-29T00:00:00Z");

  it("solo cuenta líneas de la marca y junta el mismo producto de varios distribuidores", () => {
    const stats = summarizeBrandPurchases(
      [
        line({ orderId: "o1", sku: "E1", qty: 2, spendUsd: 20 }),
        line({ orderId: "o2", provider: "AIR", sku: "A1", qty: 1, spendUsd: 11, name: "LOGITECH MOUSE" }),
        line({ orderId: "o2", provider: "AIR", sku: "OTRA", qty: 5, spendUsd: 99 }),
        line({ orderId: "o3", sku: "K9", qty: 1, spendUsd: 30, name: "Teclado K120", createdAt: "2026-08-02T10:00:00.000Z" }),
      ],
      index,
      { from, now }
    );
    expect(stats.totals).toEqual({ spendUsd: 61, units: 4, orders: 3, accounts: 1 });
    expect(stats.topProducts[0]).toMatchObject({ key: "item-mouse", label: "Mouse G203", units: 3, spendUsd: 31, itemId: "item-mouse" });
    expect(stats.topProducts[1]).toMatchObject({ label: "Teclado K120", itemId: null });
    expect(stats.byProvider.map((p) => [p.key, p.share])).toEqual([
      ["ELIT", 82],
      ["AIR", 18],
    ]);
    expect(stats.monthly).toEqual([
      { month: "2026-07", spendUsd: 0, units: 0 },
      { month: "2026-08", spendUsd: 30, units: 1 },
      { month: "2026-09", spendUsd: 31, units: 3 },
    ]);
    expect(stats.byAccount).toEqual([]);
  });

  it("con nombres de cuentas arma el ranking de cuentas", () => {
    const stats = summarizeBrandPurchases(
      [line({ tenantId: "a", spendUsd: 5 }), line({ tenantId: "b", orderId: "o9", spendUsd: 50 })],
      index,
      { from, now, accountNames: new Map([["a", "Local A"], ["b", "Local B"]]) }
    );
    expect(stats.byAccount.map((r) => r.label)).toEqual(["Local B", "Local A"]);
  });
});

describe("monthKeys", () => {
  it("cruza el año", () => {
    expect(monthKeys(new Date("2025-11-15T00:00:00Z"), new Date("2026-01-02T00:00:00Z"))).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
  });
});
