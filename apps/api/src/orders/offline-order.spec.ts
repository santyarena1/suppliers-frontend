import { normalizeOfflineItems, snapshotOfflineOrder, isOrderItemEditable } from "./offline-order";

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

  it("lee price/subtotal de checkouts online", () => {
    const items = normalizeOfflineItems([
      { code: "18636", qty: 2, name: "AP Cudy", price: 12.5, subtotal: 25 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].externalId).toBe("18636");
    expect(items[0].unitPrice).toBe(12.5);
    expect(items[0].lineTotal).toBe(25);
  });

  it("conserva marca de editado y final de línea", () => {
    const items = normalizeOfflineItems([
      {
        externalId: "X",
        name: "SSD",
        qty: 1,
        unitPrice: 10,
        finalLineUsd: 11.5,
        edited: true,
        editedAt: "2026-08-25T12:00:00.000Z",
        originalUnitPrice: 12,
        pricingMode: "scheme",
      },
    ]);
    expect(items[0].finalLineUsd).toBe(11.5);
    expect(items[0].edited).toBe(true);
    expect(items[0].pricingMode).toBe("scheme");
    expect(items[0].originalUnitPrice).toBe(12);
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

  it("marca editables offline y creados online", () => {
    expect(isOrderItemEditable({ channel: "OFFLINE", approvalStatus: "APPROVED", status: "OFFLINE" })).toBe(true);
    expect(isOrderItemEditable({ channel: "ONLINE", approvalStatus: "APPROVED", status: "CREATED" })).toBe(true);
    expect(isOrderItemEditable({ channel: "ONLINE", approvalStatus: "PENDING_APPROVAL", status: "PENDING_APPROVAL" })).toBe(false);
    expect(isOrderItemEditable({ channel: "OFFLINE", approvalStatus: "REJECTED", status: "OFFLINE" })).toBe(false);
  });
});
