import { analyzeInvoicePdf, mentionedNumbers } from "./invoice-analysis";

/** PDF mínimo armado a mano: líneas de texto y, opcional, un link (anotación). */
function makePdf(lines: string[], link?: string): Buffer {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content = ["BT", "/F1 10 Tf", "14 TL", "40 800 Td", ...lines.map((l) => `(${esc(l)}) Tj T*`), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >>${link ? " /Annots [6 0 R]" : ""} >>`,
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  if (link) objs.push(`<< /Type /Annot /Subtype /Link /Rect [40 40 140 140] /Border [0 0 0] /A << /S /URI /URI (${esc(link)}) >> >>`);
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const qrUrl = (o: Record<string, unknown>) => `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(o)).toString("base64")}`;

describe("PDF de factura", () => {
  it("lee el QR desde el link del PDF y completa con el texto", async () => {
    const pdf = makePdf(
      ["FACTURA", "Pedido NV 123456", "CAE N: 76123456789012", "Fecha de Vto. de CAE: 27/11/2026"],
      qrUrl({ fecha: "2026-11-17", cuit: 30709332445, ptoVta: 3, tipoCmp: 1, nroCmp: 18422, importe: 100, moneda: "DOL", ctz: 1450, codAut: 76123456789012 })
    );
    const r = await analyzeInvoicePdf(pdf);
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ isPdf: true, origen: "qr", qrFrom: "link", qrCount: 1 });
    expect(r.fiscal).toMatchObject({ tipo: "A", punto_venta: 3, numero: 18422, cuit_emisor: "30-70933244-5", cae_vencimiento: "2026-11-27", moneda: "USD", cotizacion: 1450 });
    expect(mentionedNumbers(r.text, ["123456", "999999"])).toEqual(["123456"]);
  });

  it("sin QR: datos del texto", async () => {
    const r = await analyzeInvoicePdf(makePdf(["FACTURA", "Punto de Venta: 0003 Comp. Nro: 00018422", "CAE N: 76123456789012"]));
    expect(r).toMatchObject({ origen: "texto" });
    expect(r.fiscal).toMatchObject({ punto_venta: 3, numero: 18422, cae: "76123456789012", cuit_emisor: null });
  });

  it("sin nada fiscal o sin PDF: todo en null", async () => {
    expect((await analyzeInvoicePdf(makePdf(["Remito de entrega"]))).origen).toBeNull();
    expect((await analyzeInvoicePdf(Buffer.from("<html>login</html>"))).isPdf).toBe(false);
  });
});
