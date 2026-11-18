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

jest.mock("./new-bytes-voucher", () => ({
  fetchNbVoucher: jest.fn(async () => ({ detalle: [{ id: 119024, cantidad: 2 }] })),
  nbFiscal: jest.fn(() => ({ fiscal: { tipo: "A", tipo_codigo: 1, clase: "factura", punto_venta: 3, numero: 9, fecha_emision: "2026-11-15", cae: "762", cae_vencimiento: "2026-11-25", cuit_emisor: "30-70865519-4", importe_total: 50, moneda: "USD", cotizacion: 1450 }, qr: true })),
  nbLines: jest.fn(() => new Map([["119024", 2]])),
  renderNbVoucherPdf: jest.fn(async () => Buffer.from("%PDF-1.4 nodo")),
}));

const pdf = (s = "") => new StreamableFile(Buffer.from(`%PDF-1.4 ${s}`));

function setup() {
  const docs: Record<string, unknown>[] = [];
  const assets: Record<string, unknown>[] = [];
  const prisma: Record<string, unknown> = {
    tenant: { findUnique: jest.fn(async () => ({ mirrorsCommercialFromId: null })) },
    providerOrder: {
      findMany: jest.fn(async () => [
        { id: "o1", provider: "ELIT", createdAt: new Date("2026-11-14T10:00:00Z"), items: [], invidOrderNumber: "NV-100", invidWebOrderNumber: null },
        { id: "o2", provider: "SOLUTION_BOX", createdAt: new Date("2026-11-14T10:00:00Z"), items: [], invidOrderNumber: "1316224", invidWebOrderNumber: null },
        { id: "o3", provider: "NEW_BYTES", createdAt: new Date("2026-11-14T10:00:00Z"), items: [{ externalId: "119024", qty: 2 }], invidOrderNumber: "X", invidWebOrderNumber: null },
      ]),
    },
    providerOrderDocument: {
      findMany: jest.fn(async (a: { where: { provider: string; portalRef?: { in: string[] }; orderId?: null } }) =>
        docs.filter((d) => d.provider === a.where.provider && (a.where.portalRef ? a.where.portalRef.in.includes(d.portalRef as string) : d.orderId == null && d.linesFetchedAt != null))
      ),
      findFirst: jest.fn(async (a: { where: { provider: string; portalRef: string } }) => docs.find((d) => d.provider === a.where.provider && d.portalRef === a.where.portalRef) ?? null),
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
  const credentials = { findByProvider: jest.fn(async (_t: string, p: string) => (p === "AIR" ? null : { credentialsJson: "{}" })) };
  const tgs = { allowedTenantId: async () => "tgs" };
  const elit = {
    getAccount: jest.fn(async () => ({
      orders: [{ orderNumber: "NV-100", internalNumber: null, invoiceNumber: "2000240284", dispatchNote: "R-9", dispatchNotePdfUrl: "https://cdn.elit.com.ar/r.pdf" }],
      movements: [
        { form: "FACTURA A", number: "2000240284", remito: "R-9", date: "2026-11-15" },
        { form: "NOTA DE CREDITO A", number: "3000000001", remito: "R-9", date: "2026-11-16" },
        // Compra hecha directo en el portal: se guarda suelta.
        { form: "FACTURA A", number: "2000240500", remito: "", date: "2026-11-16" },
        // Muy vieja: no se busca.
        { form: "FACTURA A", number: "1999999999", remito: "", date: "2026-01-02" },
        { form: "RECIBO", number: "77", remito: "", date: "2026-11-16" },
      ],
    })),
    getDocument: jest.fn(async (_c: unknown, q: { form?: string; number: string; kind?: string }) => (q.kind === "dispatch" ? pdf("remito") : pdf(q.form?.includes("CREDITO") ? "NC" : "FC"))),
  };
  const solutionBox = {
    getAccount: jest.fn(async () => ({ orders: [{ number: "1316224", extension: "01", invoice: "FF-0009-00374996", date: "2026-11-15" }] })),
    getInvoice: jest.fn(async () => new StreamableFile(Buffer.alloc(0))),
  };
  const newBytes = {
    getAccountStatement: jest.fn(async () => ({ movements: [{ voucherId: 55, voucherUrl: "https://omega.comprobantes.lio.red/voucher/F/1/t", invoiceLabel: "Factura", invoiceNumber: "0003-00000009", invoiceDate: "2026-11-15" }] })),
  };
  const service = new OrderDocumentsService(prisma as never, credentials as never, tgs as never, elit as never, solutionBox as never, newBytes as never);
  return { service, docs, assets, solutionBox };
}

describe("facturas y remitos desde los portales", () => {
  it("clase por el nombre del formulario", () => {
    expect(kindFromForm("FACTURA A")).toBe("FACTURA");
    expect(kindFromForm("NOTA DE CRÉDITO A")).toBe("NOTA_CREDITO");
    expect(kindFromForm("Nota de Débito")).toBe("NOTA_DEBITO");
  });

  it("guarda todos los comprobantes recientes, unidos al pedido cuando se puede y sueltos si no", async () => {
    const { service, docs, assets, solutionBox } = setup();
    const res = await service.sync("tgs", new Date("2026-11-18T12:00:00Z"));
    expect(res).toEqual([
      { provider: "ELIT", candidates: 4, saved: 4, errors: 0, linked: 3, lines: 0 },
      { provider: "SOLUTION_BOX", candidates: 1, saved: 0, errors: 1, linked: 0, lines: 0 },
      { provider: "NEW_BYTES", candidates: 1, saved: 1, errors: 0, linked: 1, lines: 0 },
    ]);
    const elit = docs.filter((d) => d.provider === "ELIT");
    expect(elit.map((d) => [d.orderId, d.kind, d.portalNumber, d.link])).toEqual([
      ["o1", "REMITO", "R-9", "nota de venta → remito"],
      ["o1", "FACTURA", "2000240284", "nota de venta → factura"],
      ["o1", "NOTA_CREDITO", "3000000001", "remito → comprobante"],
      [null, "FACTURA", "2000240500", null],
    ]);
    expect(elit[1]).toMatchObject({ cae: "761", cuitEmisor: "30-65165551-6", origen: "qr", generated: false });
    expect(elit[0].cae).toBeUndefined();
    // New Bytes: datos oficiales, PDF armado por NODO y unido por mismos productos y cantidades.
    expect(docs.find((d) => d.provider === "NEW_BYTES")).toMatchObject({ orderId: "o3", link: "mismos productos y cantidades", generated: true, cae: "762", caeVencimiento: "2026-11-25", origen: "qr" });
    expect(assets.every((a) => a.isPrivate === true && a.ownerTenantId === "tgs" && a.mimeType === "application/pdf")).toBe(true);
    expect(docs.find((d) => d.provider === "SOLUTION_BOX")).toMatchObject({ fetchError: "el portal devolvió el archivo vacío", orderId: "o2" });

    // Una factura suelta ya guardada con renglones: se vuelve a buscar su pedido sin ir al portal (parcial de NODO-o3).
    docs.push({ id: 'suelta', tenantId: 'tgs', provider: 'NEW_BYTES', portalRef: 'NB|99', orderId: null, kind: 'FACTURA', linesFetchedAt: new Date(), fechaEmision: '2026-11-15', lines: [{ codigo: '119024', cantidad: 1 }, { codigo: '102048', cantidad: 1 }] });
    // Segunda vuelta: lo guardado no se vuelve a bajar y el error espera 6 horas.
    const again = await service.sync("tgs", new Date("2026-11-18T12:30:00Z"));
    expect(again.map((r) => r.saved + r.errors)).toEqual([0, 0, 0]);
    expect(solutionBox.getInvoice).toHaveBeenCalledTimes(1);
    expect(docs.find((d) => d.id === "suelta")).toMatchObject({ orderId: "o3", link: "factura parcial del pedido" });
  });
});
