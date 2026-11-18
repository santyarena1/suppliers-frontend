import { InvoicesApiService } from "./invoices-api.service";

type Doc = Record<string, unknown> & { id: string; updatedAt: Date };

function doc(id: string, over: Partial<Doc> = {}): Doc {
  return {
    id,
    tenantId: "tgs",
    orderId: null,
    provider: "ELIT",
    kind: "FACTURA",
    link: null,
    portalNumber: "2000240500",
    tipo: "A",
    puntoVenta: 22,
    numero: 5,
    fechaEmision: "2026-11-17",
    cae: "76123456789012",
    caeVencimiento: null,
    cuitEmisor: "30-65165551-6",
    importeTotal: 121,
    moneda: "USD",
    cotizacion: 1450,
    origen: "qr",
    assetId: "a1",
    generated: false,
    createdAt: new Date("2026-11-18T10:00:00Z"),
    updatedAt: new Date("2026-11-18T10:00:00Z"),
    ...over,
  };
}

function setup(initial: Doc[]) {
  const docs = [...initial];
  const states = new Map<string, Record<string, unknown>>();
  const events: { orderId: string; type: string; version: number }[] = [];
  const tracker: { tenantId: string; checkedUntil: Date; invoicesCheckedUntil: Date | null } = { tenantId: "tgs", checkedUntil: new Date(), invoicesCheckedUntil: null };
  const prisma = {
    apiOrderTracker: {
      findUnique: jest.fn(async () => tracker),
      update: jest.fn(async (a: { data: { invoicesCheckedUntil: Date } }) => Object.assign(tracker, a.data)),
    },
    providerOrderDocument: {
      findMany: jest.fn(async (a: { where: { updatedAt?: { gte: Date }; id?: { in: string[] } }; take?: number }) => {
        let rows = docs.filter((d) => d.assetId && d.kind !== "REMITO");
        if (a.where.updatedAt) rows = rows.filter((d) => d.updatedAt >= a.where.updatedAt!.gte);
        if (a.where.id) rows = docs.filter((d) => a.where.id!.in.includes(d.id));
        return rows.slice(0, a.take ?? rows.length);
      }),
    },
    providerOrder: { findMany: jest.fn(async () => [{ id: "o1", number: 45 }]) },
    tenant: { findMany: jest.fn(async () => [{ providerKey: "ELIT", name: "Elit" }]) },
    apiInvoiceState: {
      findUnique: jest.fn(async (a: { where: { documentId: string } }) => states.get(a.where.documentId) ?? null),
      findMany: jest.fn(async (a: { where: { schema?: { lt: number } } }) => [...states.values()].filter((s) => !a.where.schema || ((s.schema as number) ?? 1) < a.where.schema.lt)),
      updateMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(async (a: { data: Record<string, unknown> }) => states.set(a.data.documentId as string, { ...a.data })),
      update: jest.fn(async (a: { where: { documentId: string }; data: Record<string, unknown> }) => states.set(a.where.documentId, { ...states.get(a.where.documentId), ...a.data })),
    },
    apiOrderEvent: { create: jest.fn(async (a: { data: { orderId: string; type: string; version: number } }) => events.push(a.data)) },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const service = new InvoicesApiService(prisma as never, { allowedTenantId: async () => "tgs" } as never);
  return { service, docs, states, events };
}

describe("API de facturas", () => {
  it("la historia se registra sin avisar; una factura nueva avisa factura.nueva; unirla a un pedido, factura.actualizada", async () => {
    const { service, docs, events, states } = setup([doc("vieja")]);
    await service.refresh("tgs", new Date("2026-11-18T10:05:00Z"));
    expect(events).toHaveLength(0);
    expect(states.get("vieja")).toMatchObject({ version: 1 });

    docs.push(doc("nueva", { updatedAt: new Date("2026-11-18T10:06:00Z") }));
    // Emitida hace meses y recién encontrada: tampoco se avisa (se lee con GET /v1/facturas).
    docs.push(doc("historia", { fechaEmision: "2026-08-01", updatedAt: new Date("2026-11-18T10:06:00Z") }));
    await service.refresh("tgs", new Date("2026-11-18T10:07:00Z"));
    expect(events).toEqual([{ tenantId: "tgs", orderId: "nueva", type: "factura.nueva", version: 1 }]);

    Object.assign(docs[1], { orderId: "o1", link: "mismos productos y cantidades", updatedAt: new Date("2026-11-18T10:08:00Z") });
    await service.refresh("tgs", new Date("2026-11-18T10:09:00Z"));
    expect(events.at(-1)).toMatchObject({ orderId: "nueva", type: "factura.actualizada", version: 2 });

    const p = await service.payloads("tgs", [{ documentId: "nueva", version: 2, changedAt: new Date("2026-11-18T10:09:00Z") }]);
    expect(p[0]).toMatchObject({
      id: "nueva",
      clase: "factura",
      cae: "76123456789012",
      origen: "qr",
      pdf_generado_por_nodo: false,
      distribuidor: { clave: "ELIT", nombre: "Elit", cuit: "30-65165551-6" },
      pedido: { id: "o1", numero: "NODO-45", union: "mismos productos y cantidades" },
    });
    expect(p[0].pdf_url).toMatch(/\/v1\/facturas\/nueva\/pdf$/);
  });

  it("solo para la organización habilitada y con orders:read", async () => {
    const { service } = setup([]);
    await expect(service.assertAllowed({ scopes: ["catalog:read"], tenantId: "tgs" })).rejects.toMatchObject({ code: "insufficient_scope" });
    await expect(service.assertAllowed({ scopes: ["orders:read"], tenantId: "otro" })).rejects.toMatchObject({ code: "orders_unavailable" });
  });
});
