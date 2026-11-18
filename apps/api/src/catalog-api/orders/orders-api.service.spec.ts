import { decodeOrderCursor, encodeOrderCursor, OrdersApiService } from "./orders-api.service";

type Order = Record<string, unknown> & { id: string; tenantId: string; updatedAt: Date; number: number | null };

function order(id: string, over: Partial<Order> = {}): Order {
  return {
    id,
    number: null,
    tenantId: "tgs",
    provider: "ELIT",
    status: "CREATED",
    channel: "ONLINE",
    approvalStatus: "NOT_REQUIRED",
    invidOrderNumber: "E-1",
    invidWebOrderNumber: null,
    paymentOption: "1",
    paymentLabel: "Cuenta corriente",
    deliveryOption: null,
    deliveryLabel: null,
    notes: null,
    subtotal: 100,
    impuestos: 21,
    percepciones: 0,
    total: 121,
    items: [{ externalId: "E1", name: "Mouse", qty: 1, price: 100 }],
    addressSnapshot: { vat: 21 },
    draftInput: null,
    rejectionReason: null,
    approvalDecidedAt: null,
    storefrontStatus: null,
    trackingStage: null,
    trackingStatus: null,
    trackingInvoice: null,
    trackingNumber: null,
    trackingCarrier: null,
    trackingChangedAt: null,
    createdAt: new Date("2026-11-16T10:00:00Z"),
    updatedAt: new Date("2026-11-16T10:00:00Z"),
    createdBy: { id: "u1", username: "testuser1" },
    approvedBy: null,
    user: { id: "u1", username: "testuser1" },
    ...over,
  };
}

function setup(initial: Order[], documents: Record<string, unknown>[] = []) {
  const orders = [...initial];
  const states = new Map<string, Record<string, unknown>>();
  const events: { id: bigint; tenantId: string; orderId: string; type: string; version: number }[] = [];
  let tracker: { tenantId: string; checkedUntil: Date } | null = null;
  const prisma = {
    providerOrder: {
      findMany: jest.fn(async (args: { where: { tenantId: string; updatedAt?: { gte: Date }; id?: { in: string[] } }; take?: number }) => {
        let rows = orders.filter((o) => o.tenantId === args.where.tenantId);
        if (args.where.updatedAt) rows = rows.filter((o) => o.updatedAt >= args.where.updatedAt!.gte);
        if (args.where.id) rows = rows.filter((o) => args.where.id!.in.includes(o.id));
        rows.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || a.id.localeCompare(b.id));
        return rows.slice(0, args.take ?? rows.length);
      }),
      aggregate: jest.fn(async () => ({ _max: { number: orders.reduce((m, o) => Math.max(m, o.number ?? 0), 0) || null } })),
      updateMany: jest.fn(async (args: { where: { id: string }; data: { number: number } }) => {
        const o = orders.find((x) => x.id === args.where.id && x.number == null);
        if (!o) return { count: 0 };
        o.number = args.data.number;
        return { count: 1 };
      }),
      findUnique: jest.fn(async (args: { where: { id: string } }) => orders.find((o) => o.id === args.where.id) ?? null),
      findFirst: jest.fn(),
    },
    apiOrderTracker: {
      findUnique: jest.fn(async () => tracker),
      upsert: jest.fn(async (args: { create: { tenantId: string; checkedUntil: Date } }) => (tracker = args.create)),
    },
    providerOrderDocument: {
      findMany: jest.fn(async (args: { where: { orderId?: { in: string[] }; tenantId?: string; updatedAt?: { gte: Date } } }) =>
        documents.filter((d) => (!args.where.orderId || args.where.orderId.in.includes(d.orderId as string)) && (!args.where.updatedAt || (d.updatedAt as Date) >= args.where.updatedAt.gte))
      ),
    },
    apiOrderState: {
      findMany: jest.fn(async (args: { where: { schema?: { lt: number } } }) =>
        [...states.values()].filter((s) => !args.where.schema || ((s.schema as number) ?? 1) < args.where.schema.lt)
      ),
      updateMany: jest.fn(async () => ({ count: 0 })),
      findUnique: jest.fn(async (args: { where: { orderId: string } }) => states.get(args.where.orderId) ?? null),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => states.set(args.data.orderId as string, { ...args.data })),
      update: jest.fn(async (args: { where: { orderId: string }; data: Record<string, unknown> }) =>
        states.set(args.where.orderId, { ...states.get(args.where.orderId), ...args.data })
      ),
    },
    apiOrderEvent: {
      create: jest.fn(async (args: { data: { tenantId: string; orderId: string; type: string; version: number } }) => events.push({ id: BigInt(events.length + 1), ...args.data })),
    },
    tenant: { findMany: jest.fn(async () => [{ providerKey: "ELIT", name: "Elit" }]) },
    providerSyncCache: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const tgs = { allowedTenantId: async () => "tgs" };
  const snapshots = { get: async () => ({ rows: [] }) };
  const service = new OrdersApiService(prisma as never, tgs as never, snapshots as never);
  return { service, orders, states, events, documents };
}

describe("revisión de pedidos para la API", () => {
  it("la primera vez registra la historia sin avisar; después avisa lo nuevo y lo que cambia", async () => {
    // Invid: el portal no da PDF, «facturado» sale con el número que muestra el seguimiento.
    const { service, orders, states, events } = setup([order("a", { number: 1, provider: "INVID" })]);
    await service.refresh("tgs", new Date("2026-11-16T10:05:00Z"));
    expect(states.get("a")).toMatchObject({ version: 1 });
    expect(events).toHaveLength(0);

    orders.push(order("b", { updatedAt: new Date("2026-11-16T10:06:00Z") }));
    await service.refresh("tgs", new Date("2026-11-16T10:07:00Z"));
    expect(events.map((e) => [e.orderId, e.type, e.version])).toEqual([["b", "pedido.creado", 1]]);
    expect(orders.find((o) => o.id === "b")?.number).toBe(2);

    // Cambio interno (sin nada visible): no avisa.
    orders[0].updatedAt = new Date("2026-11-16T10:08:00Z");
    await service.refresh("tgs", new Date("2026-11-16T10:09:00Z"));
    expect(events).toHaveLength(1);

    // El portal lo facturó: pedido.facturado con versión 2.
    Object.assign(orders[0], { trackingStage: "INVOICED", trackingInvoice: "A-0001-00001234", updatedAt: new Date("2026-11-16T10:10:00Z") });
    await service.refresh("tgs", new Date("2026-11-16T10:11:00Z"));
    expect(events.at(-1)).toMatchObject({ orderId: "a", type: "pedido.facturado", version: 2 });

    // Después, un cambio de etapa ya no repite el aviso de factura.
    Object.assign(orders[0], { trackingStage: "SHIPPED", updatedAt: new Date("2026-11-16T10:11:30Z") });
    await service.refresh("tgs", new Date("2026-11-16T10:11:40Z"));
    expect(events.at(-1)).toMatchObject({ orderId: "a", type: "pedido.actualizado" });

    // El portal lo anuló: pedido.cancelado.
    Object.assign(orders[0], { trackingStage: "CANCELLED", updatedAt: new Date("2026-11-16T10:12:00Z") });
    await service.refresh("tgs", new Date("2026-11-16T10:13:00Z"));
    expect(events.at(-1)).toMatchObject({ orderId: "a", type: "pedido.cancelado", version: 4 });
  });

  it("Elit: facturado cuando se guardan los datos fiscales del PDF; el remito después es una actualización", async () => {
    const { service, orders, events, documents } = setup([order("e", { number: 1 })]);
    await service.refresh("tgs", new Date("2026-11-16T10:05:00Z"));
    // El seguimiento muestra el número interno de la factura: todavía no es «facturado».
    Object.assign(orders[0], { trackingStage: "INVOICED", trackingInvoice: "2000240284", updatedAt: new Date("2026-11-16T10:06:00Z") });
    await service.refresh("tgs", new Date("2026-11-16T10:07:00Z"));
    expect(events.at(-1)).toMatchObject({ orderId: "e", type: "pedido.actualizado", version: 2 });
    // Se guardó el PDF con el QR (sin cambio en el pedido mismo).
    const fiscal = { orderId: "e", kind: "FACTURA", portalNumber: "2000240284", tipo: "A", puntoVenta: 22, numero: 1, fechaEmision: "2026-11-16", cae: "761", caeVencimiento: null, cuitEmisor: "30-65165551-6", importeTotal: 121, moneda: "USD", cotizacion: 1450, origen: "qr", assetId: "a1" };
    documents.push({ id: "d1", createdAt: new Date("2026-11-16T10:08:00Z"), updatedAt: new Date("2026-11-16T10:08:00Z"), ...fiscal });
    await service.refresh("tgs", new Date("2026-11-16T10:09:00Z"));
    expect(events.at(-1)).toMatchObject({ orderId: "e", type: "pedido.facturado", version: 3 });
    documents.push({ id: "r1", orderId: "e", kind: "REMITO", portalNumber: "R-1", fechaEmision: null, origen: null, assetId: "a2", createdAt: new Date("2026-11-16T10:10:00Z"), updatedAt: new Date("2026-11-16T10:10:00Z") });
    await service.refresh("tgs", new Date("2026-11-16T10:11:00Z"));
    expect(events.at(-1)).toMatchObject({ orderId: "e", type: "pedido.actualizado", version: 4 });
    expect(events).toHaveLength(3);
  });

  it("al sumar campos al pedido recalcula el hash sin avisar", async () => {
    const { service, states, events, orders } = setup([order("a", { number: 1 })]);
    await service.refresh("tgs", new Date("2026-11-16T10:05:00Z"));
    states.set("a", { ...states.get("a"), schema: 1, hash: "viejo" });
    orders[0].updatedAt = new Date("2026-11-16T10:06:00Z");
    await service.refresh("tgs", new Date("2026-11-16T10:07:00Z"));
    expect(events).toHaveLength(0);
    expect(states.get("a")).toMatchObject({ version: 1, schema: 4 });
  });

  it("un intento de compra que falló no se publica ni se numera", async () => {
    const { service, orders, states, events } = setup([]);
    await service.refresh("tgs", new Date("2026-11-16T10:00:00Z"));
    orders.push(order("f", { status: "FAILED", updatedAt: new Date("2026-11-16T10:01:00Z") }));
    await service.refresh("tgs", new Date("2026-11-16T10:02:00Z"));
    expect(states.has("f")).toBe(false);
    expect(events).toHaveLength(0);
    expect(orders[0].number).toBeNull();
  });

  it("no habilita la API para otra organización ni sin el permiso", async () => {
    const { service } = setup([]);
    await expect(service.assertAllowed({ scopes: ["catalog:read"], tenantId: "tgs" })).rejects.toMatchObject({ code: "insufficient_scope" });
    await expect(service.assertAllowed({ scopes: ["orders:read"], tenantId: "otro" })).rejects.toMatchObject({ code: "orders_unavailable" });
    await expect(service.assertAllowed({ scopes: ["orders:read"], tenantId: "tgs" })).resolves.toBeUndefined();
  });

  it("el cursor ida y vuelta", () => {
    const at = new Date("2026-11-16T10:00:00.123Z");
    expect(decodeOrderCursor(encodeOrderCursor(at, "abc"))).toEqual({ changedAt: at, orderId: "abc" });
    expect(() => decodeOrderCursor("basura")).toThrow();
  });
});
