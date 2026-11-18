import { formatCuit, hasFiscalData, isArcaQrUrl, mergeFiscal, parseAmount, parseArcaQr, parseDate, parseInvoiceText } from "./arca-invoice";

const qr = (o: Record<string, unknown>, host = "https://www.afip.gob.ar/fe/qr/") =>
  `${host}?p=${Buffer.from(JSON.stringify(o)).toString("base64")}`;

describe("QR de ARCA", () => {
  const base = {
    ver: 1, fecha: "2026-11-17", cuit: 30709332445, ptoVta: 3, tipoCmp: 1, nroCmp: 18422,
    importe: 1234.5, moneda: "DOL", ctz: 1450.25, tipoDocRec: 80, nroDocRec: 20111111112, tipoCodAut: "E", codAut: 76123456789012,
  };

  it("lee todos los campos", () => {
    expect(parseArcaQr(qr(base))).toEqual({
      tipo: "A", tipo_codigo: 1, clase: "factura", punto_venta: 3, numero: 18422, fecha_emision: "2026-11-17",
      cae: "76123456789012", cae_vencimiento: null, cuit_emisor: "30-70933244-5", importe_total: 1234.5, moneda: "USD", cotizacion: 1450.25,
    });
  });

  it("acepta el dominio nuevo de ARCA, base64 sin relleno y url-safe", () => {
    const p = Buffer.from(JSON.stringify({ ...base, moneda: "PES", ctz: 1 })).toString("base64url");
    const f = parseArcaQr(`https://www.arca.gob.ar/fe/qr/?p=${p}`);
    expect(f).toMatchObject({ moneda: "ARS", cotizacion: null, numero: 18422 });
  });

  it("nota de crédito, CUIT inválido y CAE corto quedan claros", () => {
    const f = parseArcaQr(qr({ ...base, tipoCmp: 8, cuit: 30709332446, codAut: 123 }));
    expect(f).toMatchObject({ tipo: "B", clase: "nota_credito", cuit_emisor: null, cae: null });
  });

  it("no es un QR de ARCA o el JSON está roto", () => {
    expect(isArcaQrUrl("https://evil.com/fe/qr/?p=abc")).toBe(false);
    expect(parseArcaQr("https://www.afip.gob.ar/fe/qr/?p=@@@")).toBeNull();
    expect(parseArcaQr("hola")).toBeNull();
  });
});

describe("texto del PDF", () => {
  const text = `
ORIGINAL
A
COD. 01
FACTURA
Razón Social: DISTRIBUIDORA SA
Punto de Venta: 0003 Comp. Nro: 00018422
Fecha de Emisión: 17/11/2026
CUIT: 30-70933244-5
Ingresos Brutos: 901-123456-7
Apellido y Nombre / Razón Social: THE GAMER SHOP
CUIT: 20-11111111-2
Moneda: U$S
Cotización: 1.450,25
Importe Total: $ 1.234,50
CAE N°: 76123456789012
Fecha de Vto. de CAE: 27/11/2026
`;
  it("toma lo que tiene etiqueta", () => {
    expect(parseInvoiceText(text)).toEqual({
      tipo: "A", tipo_codigo: 1, clase: "factura", punto_venta: 3, numero: 18422, fecha_emision: "2026-11-17",
      cae: "76123456789012", cae_vencimiento: "2026-11-27", cuit_emisor: "30-70933244-5", importe_total: 1234.5, moneda: "USD", cotizacion: 1450.25,
    });
  });

  it("sin datos del cliente no adivina cuál CUIT es del emisor", () => {
    expect(parseInvoiceText("CUIT: 30-70933244-5\nCAE: 76123456789012").cuit_emisor).toBeNull();
  });

  it("texto sin nada fiscal", () => {
    const f = parseInvoiceText("Remito de entrega\nBultos: 3");
    expect(hasFiscalData(f)).toBe(false);
  });

  it("el QR manda y el texto completa", () => {
    const f = mergeFiscal(parseArcaQr(qr({ fecha: "2026-11-17", cuit: 30709332445, ptoVta: 3, tipoCmp: 1, nroCmp: 1, importe: 10, moneda: "PES", ctz: 1, codAut: 76123456789012 })), parseInvoiceText(text));
    expect(f).toMatchObject({ numero: 1, cae_vencimiento: "2026-11-27", moneda: "ARS" });
  });
});

describe("utilidades", () => {
  it("montos, fechas y CUIT", () => {
    expect(parseAmount("1.234.567,89")).toBe(1234567.89);
    expect(parseAmount("1234567.89")).toBe(1234567.89);
    expect(parseAmount("1,234.50")).toBe(1234.5);
    expect(parseDate("20261117")).toBe("2026-11-17");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(formatCuit("30709332445")).toBe("30-70933244-5");
  });
});
