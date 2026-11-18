import { analyzeInvoicePdf } from "../orders-api/invoice-analysis";
import { nbFiscal, nbLines, nbVoucherApiUrl, renderNbVoucherPdf, type NbVoucherData } from "./new-bytes-voucher";

const qr = `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(
  JSON.stringify({ ver: 1, fecha: "2026-11-15", cuit: 30708655194, ptoVta: 3, tipoCmp: 1, nroCmp: 4521, importe: 1210.5, moneda: "DOL", ctz: 1450, codAut: 76123456789012 })
).toString("base64")}`;

const data: NbVoucherData = {
  cabecera: { letraComprobante: "A", codigoComprobante: "COD. 01", numeroComprobante: "00004521", numeroPuntoVenta: "0003", fechaComprobante: "15-11-2026", cuitEmpresa: "30-70865519-4", tipoCmp: 1 },
  pie: { cae: "76123456789012", vencimientoCae: "25-11-2026" },
  totales: { moneda: "USD", cotizacion: 1450, importeTotal: 1210.5, neto21: 1000, iva21: 210.5 },
  detalle: [
    { cantidad: 1, sku: "100-100001591BOX", producto: "CPU AMD RYZEN 5", id: 119024, precio: 600, subtotal: 600 },
    { cantidad: 2, sku: "WDS100T5G0A", producto: "SSD WD 1TB", id: 118487, precio: 200, subtotal: 400 },
  ],
  recursos: { qr },
};

describe("comprobantes de New Bytes", () => {
  it("link del visor → datos en ms-comprobantes, solo lio.red", () => {
    expect(nbVoucherApiUrl("https://omega.comprobantes.lio.red/voucher/F/123/abc-DEF")).toBe("https://ms-comprobantes.lio.red/v2/F/123/abc-DEF");
    expect(nbVoucherApiUrl("https://evil.example.com/voucher/F/1/x")).toBeNull();
  });

  it("datos fiscales: QR manda, los datos completan el vencimiento del CAE; renglones por código interno", () => {
    const { fiscal, qr: hasQr } = nbFiscal(data);
    expect(hasQr).toBe(true);
    expect(fiscal).toMatchObject({ tipo: "A", punto_venta: 3, numero: 4521, fecha_emision: "2026-11-15", cae: "76123456789012", cae_vencimiento: "2026-11-25", cuit_emisor: "30-70865519-4", importe_total: 1210.5, moneda: "USD", cotizacion: 1450, clase: "factura" });
    expect([...nbLines(data)]).toEqual([["119024", 1], ["118487", 2]]);
  });

  it("el PDF que arma NODO se lee de vuelta: QR de ARCA y aviso de que lo generó NODO", async () => {
    const { fiscal } = nbFiscal(data);
    const pdf = await renderNbVoucherPdf(data, fiscal);
    const a = await analyzeInvoicePdf(pdf);
    expect(a.error).toBeUndefined();
    expect(a.origen).toBe("qr");
    expect(a.fiscal).toMatchObject({ numero: 4521, cae: "76123456789012", cuit_emisor: "30-70865519-4" });
    expect(a.text).toContain("Generado por NODO");
  }, 30_000);
});
