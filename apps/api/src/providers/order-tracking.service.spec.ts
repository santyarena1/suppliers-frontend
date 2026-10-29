import { OrderTrackingService } from "./order-tracking.service";

type Row = Record<string, unknown> & { id: string };

/** Prisma en memoria: solo lo que usa el servicio. */
function fakePrisma(orders: Row[]) {
  const notifications: Row[] = [];
  return {
    notifications,
    orders,
    providerOrder: {
      findMany: jest.fn(async () => orders.filter((o) => o.status === "CREATED" && !["DELIVERED", "CANCELLED"].includes(String(o.trackingStage)))),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const o = orders.find((x) => x.id === where.id)!;
        Object.assign(o, data);
        return o;
      }),
    },
    tenant: { findUnique: jest.fn(async () => ({ mirrorsCommercialFromId: null })) },
    orgNotification: { create: jest.fn(async ({ data }: { data: Row }) => notifications.push(data)) },
  };
}

function order(id: string, provider: string, numbers: [string | null, string | null], extra: Row | object = {}): Row {
  return {
    id,
    tenantId: "t1",
    provider,
    status: "CREATED",
    invidOrderNumber: numbers[0],
    invidWebOrderNumber: numbers[1],
    trackingStage: null,
    trackingStatus: null,
    trackingInvoice: null,
    trackingNumber: null,
    trackingCarrier: null,
    trackingHistory: null,
    ...extra,
  };
}

function build(orders: Row[], portals: { invid?: unknown[]; nb?: { purchase: unknown[]; pedidos: unknown[] } }) {
  const prisma = fakePrisma(orders);
  const credentials = { findByProvider: jest.fn(async () => ({ credentialsJson: "{}" })) };
  const newBytes = {
    getPurchaseOrders: jest.fn(async () => ({ orders: portals.nb?.purchase ?? [] })),
    getOrders: jest.fn(async () => ({ orders: portals.nb?.pedidos ?? [] })),
    getOrderDetail: jest.fn(async () => ({ found: true, tracking: [{ state: "En preparación" }] })),
  };
  const invid = { getOrders: jest.fn(async () => ({ orders: portals.invid ?? [] })) };
  const svc = new OrderTrackingService(
    prisma as never,
    credentials as never,
    newBytes as never,
    invid as never,
    {} as never,
    {} as never
  );
  return { svc, prisma, newBytes };
}

describe("OrderTrackingService", () => {
  it("Invid: cruza por pedido web, pasa a Facturado y deja el aviso", async () => {
    const { svc, prisma } = build([order("o1", "INVID", ["555", "W-9"])], {
      invid: [{ webOrderNumber: "W-9", orderNumber: "555", status: "Facturado", invoice: "A 0003-00018422" }],
    });
    const r = await svc.refreshAll();
    expect(r).toEqual({ checked: 1, changed: 1 });
    expect(prisma.orders[0]).toMatchObject({ trackingStage: "INVOICED", trackingInvoice: "A 0003-00018422", trackingStatus: "Facturado" });
    expect(prisma.notifications).toHaveLength(1);
    expect(prisma.notifications[0]).toMatchObject({ toTenantId: "t1", title: "Invid facturó tu pedido", landingKey: "order:o1" });
  });

  it("si el portal no cambió no repite el aviso", async () => {
    const { svc, prisma } = build([order("o1", "INVID", ["555", "W-9"])], {
      invid: [{ webOrderNumber: "W-9", orderNumber: "555", status: "Facturado", invoice: "A 1" }],
    });
    await svc.refreshAll();
    await svc.refreshAll();
    expect(prisma.notifications).toHaveLength(1);
  });

  it("recién creado y «Pendiente» en el portal: queda Enviado, sin aviso", async () => {
    const { svc, prisma } = build([order("o1", "INVID", ["555", "W-9"])], {
      invid: [{ webOrderNumber: "W-9", orderNumber: "555", status: "Pendiente", invoice: "Adjuntar" }],
    });
    expect(await svc.refreshAll()).toEqual({ checked: 1, changed: 0 });
    expect(prisma.orders[0].trackingStage).toBe("SENT");
    expect(prisma.notifications).toHaveLength(0);
  });

  it("un pedido que no aparece en el portal solo anota la revisión", async () => {
    const { svc, prisma } = build([order("o1", "INVID", ["555", "W-9"])], { invid: [] });
    await svc.refreshAll();
    expect(prisma.orders[0].trackingStage).toBeNull();
    expect(prisma.orders[0].trackingCheckedAt).toBeInstanceOf(Date);
  });

  it("New Bytes: lee el seguimiento de la orden de compra abierta", async () => {
    const { svc, prisma, newBytes } = build([order("o2", "NEW_BYTES", ["77", "3-77"])], {
      nb: { purchase: [{ orderNumber: "77", branch: 3, status: "1" }], pedidos: [] },
    });
    await svc.refreshAll();
    expect(newBytes.getOrderDetail).toHaveBeenCalledWith({}, "77", "purchase", "3");
    expect(prisma.orders[0]).toMatchObject({ trackingStage: "CONFIRMED", trackingStatus: "En preparación" });
    expect(prisma.notifications[0]).toMatchObject({ title: "New Bytes confirmó tu pedido" });
  });

  it("un portal que se cae no frena a los demás", async () => {
    const { svc, prisma, newBytes } = build(
      [order("o2", "NEW_BYTES", ["77", null]), order("o1", "INVID", ["555", "W-9"])],
      { invid: [{ webOrderNumber: "W-9", orderNumber: "555", status: "Entregado" }] }
    );
    newBytes.getPurchaseOrders.mockRejectedValueOnce(new Error("timeout"));
    const r = await svc.refreshAll();
    expect(r.changed).toBe(1);
    expect(prisma.orders[1].trackingStage).toBe("DELIVERED");
  });

  it("«Actualizar estados» dos veces seguidas no vuelve a entrar a los portales", async () => {
    const { svc } = build([order("o1", "INVID", ["555", "W-9"])], { invid: [] });
    expect((await svc.refreshTenant("t1")).skipped).toBeUndefined();
    expect((await svc.refreshTenant("t1")).skipped).toBe(true);
  });
});
