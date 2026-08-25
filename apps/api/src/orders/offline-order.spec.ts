import { normalizeOfflineItems, snapshotOfflineOrder } from "./offline-order";

describe("offline-order", () => {
  it("normaliza cantidades y recalcula importes", () => {
    const items = normalizeOfflineItems([
      { externalId: "A1", name: "Mother", qty: 3, unitPrice: 48.05, internosAmount: 1.2 },
      { externalId: "", name: "basura", qty: 1, unitPrice: 10 },
      { name: "sin id", qty: 1, unitPrice: 10 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].lineTotal).toBe(144.15);
    expect(items[0].internosAmount).toBe(1.2);

    const snap = snapshotOfflineOrder(items);
    expect(snap.netUsd).toBe(144.15);
    expect(snap.internosUsd).toBe(3.6);
    expect(snap.totalUsd).toBe(147.75);
  });

  it("descarta qty 0 y deja notas recortadas", () => {
    const items = normalizeOfflineItems([{ externalId: "X", name: "SSD", qty: 0, unitPrice: 10 }]);
    expect(items).toHaveLength(0);
    const snap = snapshotOfflineOrder(
      [{ externalId: "X", sku: null, name: "SSD", qty: 1, unitPrice: 10, lineTotal: 10, internosAmount: 0, ivaPercent: 0, internosPercent: 0 }],
      "  hola  ",
      1510.123
    );
    expect(snap.notes).toBe("hola");
    expect(snap.quoteRate).toBe(1510.12);
  });
});
