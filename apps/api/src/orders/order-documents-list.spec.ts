import { OrderApprovalService } from "./order-approval.service";

describe("pedidos con sus comprobantes", () => {
  it("cada pedido trae las facturas y remitos guardados, solo del comercio de la sesión", async () => {
    const order = (id: string) => ({ id, provider: "ELIT", status: "CREATED", approvalStatus: "APPROVED", items: [], notes: null, channel: "ONLINE", createdAt: new Date("2026-11-15T10:00:00Z") });
    const findDocs = jest.fn(async () => [
      { id: "d1", orderId: "o1", kind: "FACTURA", portalNumber: "2000240284", tipo: "A", puntoVenta: 22, numero: 5, fechaEmision: "2026-11-17", importeTotal: 121.5, moneda: "USD", cae: "761", generated: false },
      { id: "d2", orderId: "o1", kind: "REMITO", portalNumber: "R-9", tipo: null, puntoVenta: null, numero: null, fechaEmision: null, importeTotal: null, moneda: null, cae: null, generated: false },
    ]);
    const prisma = {
      providerOrder: { findMany: jest.fn(async () => [order("o1"), order("o2")]) },
      user: { findUnique: jest.fn(async () => ({ role: "USER", onboardingCompletedAt: new Date(), onboardingReplay: false, onboardingPreviewRestoreTenantId: null })) },
      providerOrderDocument: { findMany: findDocs },
    };
    const service = new OrderApprovalService(prisma as never, {} as never);
    const list = await service.list({ tenantId: "t1", userId: "u1" } as never);

    expect(findDocs).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "t1", orderId: { in: ["o1", "o2"] }, assetId: { not: null } } }));
    expect(list[0].documents).toEqual([
      { id: "d1", kind: "FACTURA", number: "A 00022-00000005", date: "2026-11-17", total: 121.5, currency: "USD", cae: "761", generated: false },
      { id: "d2", kind: "REMITO", number: "R-9", date: null, total: null, currency: null, cae: null, generated: false },
    ]);
    expect(list[1].documents).toEqual([]);
  });
});
