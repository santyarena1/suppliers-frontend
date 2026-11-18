import { StreamableFile } from "@nestjs/common";
import { kindFromForm, OrderDocumentsService } from "./order-documents.service";

jest.mock("../orders-api/invoice-analysis", () => ({
  analyzeInvoicePdf: jest.fn(async (buf: Buffer) =>
    buf.toString().startsWith("%PDF-")
      ? {
          isPdf: true,
          origen: "qr",
          fiscal: { tipo: "A", tipo_codigo: 1, clase: buf.toString().includes("NC") ? "nota_credito" : "factura", punto_venta: 22, numero: 5, fecha_emision: "2026-11-17", cae: "761", cae_vencimiento: null, cuit_emisor: "30-65165551-6", importe_total: 121, moneda: "USD", cotizacion: 1450 },
        }
      : { isPdf: false, origen: null, fiscal: {} }
  ),
}));

const pdf = (s = "") => new StreamableFile(Buffer.from(`%PDF-1.4 ${s}`));

function setup() {
  const docs: Record<string, unknown>[] = [];
  const assets: Record<string, unknown>[] = [];
  const prisma: Record<string, unknown> = {
    tenant: { findUnique: jest.fn(async () => ({ mirrorsCommercialFromId: null })) },
    providerOrder: {
      findMany: jest.fn(async () => [
        { id: "o1", tenantId: "tgs", provider: "ELIT", invidOrderNumber: "NV-100", invidWebOrderNumber: null },
        { id: "o2", tenantId: "tgs", provider: "SOLUTION_BOX", invidOrderNumber: "1316224", invidWebOrderNumber: null },
      ]),
    },
    providerOrderDocument: {
      findMany: jest.fn(async () => docs),
      findFirst: jest.fn(async (a: { where: { orderId: string; portalRef: string } }) => docs.find((d) => d.orderId === a.where.orderId && d.portalRef === a.where.portalRef) ?? null),
      create: jest.fn(async (a: { data: Record<string, unknown> }) => docs.push({ id: `d${docs.length + 1}`, ...a.data })),
      update: jest.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(docs.find((d) => d.id === a.where.id)!, a.data)),
    },
    storedAsset: {
      create: jest.fn(async (a: { data: Record<string, unknown> }) => {
        const row = { id: `a${assets.length + 1}`, ...a.data };
        assets.push(row);
        return { id: row.id };
      }),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(prisma)),
  };
  const credentials = { findByProvider: jest.fn(async () => ({ credentialsJson: "{}" })) };
  const tgs = { allowedTenantId: async () => "tgs" };
  const elit = {
    getAccount: jest.fn(async () => ({
      orders: [
        { orderNumber: "NV-100", internalNumber: null, invoiceNumber: "2000240284", dispatchNote: "R-9", dispatchNotePdfUrl: "https://cdn.elit.com.ar/r.pdf" },
        { orderNumber: "NV-999", internalNumber: null, invoiceNumber: "2000249999", dispatchNote: "", dispatchNotePdfUrl: "" },
      ],
      movements: [
        { form: "FACTURA A", number: "2000240284", remito: "R-9" },
        { form: "NOTA DE CREDITO A", number: "3000000001", remito: "R-9" },
      ],
    })),
    getDocument: jest.fn(async (_c: unknown, q: { form?: string; number: string; kind?: string }) => (q.kind === "dispatch" ? pdf("remito") : pdf(q.form?.includes("CREDITO") ? "NC" : "FC"))),
  };
  const solutionBox = {
    getAccount: jest.fn(async () => ({ orders: [{ number: "1316224", extension: "01", invoice: "FF-0009-00374996" }] })),
    getInvoice: jest.fn(async () => new StreamableFile(Buffer.alloc(0))),
  };
  const service = new OrderDocumentsService(prisma as never, credentials as never, tgs as never, elit as never, solutionBox as never);
  return { service, docs, assets, elit, solutionBox };
}

describe("facturas y remitos desde los portales", () => {
  it("clase por el nombre del formulario", () => {
    expect(kindFromForm("FACTURA A")).toBe("FACTURA");
    expect(kindFromForm("NOTA DE CRÉDITO A")).toBe("NOTA_CREDITO");
    expect(kindFromForm("Nota de Débito")).toBe("NOTA_DEBITO");
  });

  it("guarda factura, nota de crédito y remito de Elit unidos al pedido; un PDF vacío queda como error y no se repite enseguida", async () => {
    const { service, docs, assets, solutionBox } = setup();
    const res = await service.sync("tgs");
    expect(res).toEqual([
      { provider: "ELIT", candidates: 3, saved: 3, errors: 0 },
      { provider: "SOLUTION_BOX", candidates: 1, saved: 0, errors: 1 },
    ]);
    const elit = docs.filter((d) => d.provider === "ELIT");
    expect(elit.map((d) => [d.orderId, d.kind, d.portalNumber, d.link])).toEqual([
      ["o1", "FACTURA", "2000240284", "nota de venta → factura"],
      ["o1", "NOTA_CREDITO", "3000000001", "remito → comprobante"],
      ["o1", "REMITO", "R-9", "nota de venta → remito"],
    ]);
    expect(elit[0]).toMatchObject({ cae: "761", cuitEmisor: "30-65165551-6", origen: "qr", assetId: "a1" });
    // El remito no lleva datos fiscales.
    expect(elit[2]).toMatchObject({ assetId: "a3" });
    expect(elit[2].cae).toBeUndefined();
    expect(assets.every((a) => a.isPrivate === true && a.ownerTenantId === "tgs" && a.mimeType === "application/pdf")).toBe(true);
    expect(docs.find((d) => d.provider === "SOLUTION_BOX")).toMatchObject({ fetchError: "el portal devolvió el archivo vacío" });
    expect(docs.find((d) => d.provider === "SOLUTION_BOX")?.assetId).toBeUndefined();

    // Segunda vuelta: lo guardado no se vuelve a bajar y el error espera 6 horas.
    const again = await service.sync("tgs");
    expect(again.map((r) => r.saved + r.errors)).toEqual([0, 0]);
    expect(solutionBox.getInvoice).toHaveBeenCalledTimes(1);
  });
});
