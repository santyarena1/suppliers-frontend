/**
 * Comprobantes de New Bytes. New Bytes los publica en su sistema de facturación
 * (lio.red): el link del listado (`miCuenta/comprobantes` → `voucherUrl`,
 * `https://omega.comprobantes.lio.red/voucher/F/{id}/{token}`) abre un visor que
 * arma el PDF en el navegador con los datos de
 * `https://ms-comprobantes.lio.red/v2/F/{id}/{token}`. No hay un PDF original
 * para bajar: NODO toma esos datos oficiales (con el QR de ARCA) y arma su propio
 * PDF, marcado como generado por NODO.
 */
import axios from "axios";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { comprobanteTipo, EMPTY_FISCAL, formatCuit, mergeFiscal, parseArcaQr, parseDate, type FiscalData } from "../orders-api/arca-invoice";
import { addLine, type Lines } from "../orders-api/invoice-match";

export interface NbVoucherData {
  cabecera?: Record<string, unknown>;
  pie?: Record<string, unknown>;
  totales?: Record<string, unknown>;
  detalle?: Record<string, unknown>[];
  cliente?: Record<string, unknown>;
  kits?: Record<string, unknown>[];
  recursos?: Record<string, unknown>;
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s ? s : null;
};
const numOf = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[^\d.,-]/g, "");
  // "1.234,56" → 1234.56; "1234.56" → 1234.56
  const n = Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const intOf = (v: unknown): number | null => {
  const d = String(v ?? "").replace(/\D/g, "");
  const n = d ? Number(d) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** El link del visor → la dirección de sus datos. Solo hosts de lio.red. */
export function nbVoucherApiUrl(voucherUrl: string): string | null {
  try {
    const u = new URL(voucherUrl);
    if (u.protocol !== "https:" || !/(^|\.)comprobantes\.lio\.red$/i.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const i = parts.indexOf("voucher");
    const [kind, id, token] = i >= 0 ? parts.slice(i + 1) : parts.slice(-3);
    if (!kind || !id || !token || !/^[\w-]+$/.test(kind + id + token)) return null;
    return `https://ms-comprobantes.lio.red/v2/${kind}/${id}/${token}`;
  } catch {
    return null;
  }
}

/** Los datos oficiales del comprobante (GET sin credenciales: el link ya es el permiso). */
export async function fetchNbVoucher(voucherUrl: string): Promise<NbVoucherData> {
  const url = nbVoucherApiUrl(voucherUrl);
  if (!url) throw new Error("link de comprobante de New Bytes no reconocido");
  const res = await axios.get(url, { timeout: 30_000, maxRedirects: 0, maxContentLength: 5 * 1024 * 1024, headers: { Accept: "application/json" }, validateStatus: (s) => s < 500 });
  if (res.status >= 300) throw new Error(`lio.red respondió ${res.status}`);
  const body = rec(res.data);
  return rec(body.data ?? body) as NbVoucherData;
}

function currencyOf(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (/d[oó]lar|usd|u\$s|^dol$/.test(s)) return "USD";
  if (/peso|ars|^pes$|^\$$/.test(s)) return "ARS";
  return s.toUpperCase();
}

/** Datos fiscales: el QR de ARCA manda; los datos del comprobante completan (vencimiento del CAE). */
export function nbFiscal(d: NbVoucherData): { fiscal: FiscalData; qr: boolean } {
  const cab = rec(d.cabecera);
  const pie = rec(d.pie);
  const tot = rec(d.totales);
  const code = intOf(cab.tipoCmp) ?? intOf(cab.codigoComprobante);
  const t = comprobanteTipo(code);
  const moneda = currencyOf(tot.moneda);
  const cae = String(pie.cae ?? "").replace(/\D/g, "");
  const fromData: FiscalData = {
    ...EMPTY_FISCAL,
    tipo: str(cab.letraComprobante)?.toUpperCase().slice(0, 1) ?? t.tipo,
    tipo_codigo: code,
    clase: t.clase,
    punto_venta: intOf(cab.numeroPuntoVenta),
    numero: intOf(cab.numeroComprobante),
    fecha_emision: parseDate(cab.fechaComprobante),
    cae: cae.length === 14 ? cae : null,
    cae_vencimiento: parseDate(pie.vencimientoCae),
    cuit_emisor: formatCuit(String(cab.cuitEmpresa ?? "")),
    importe_total: numOf(tot.importeTotal),
    moneda,
    cotizacion: moneda === "ARS" ? null : numOf(tot.cotizacion),
  };
  const qrUrl = str(rec(d.recursos).qr);
  const qr = qrUrl ? parseArcaQr(qrUrl) : null;
  return { fiscal: mergeFiscal(qr, fromData), qr: !!qr };
}

/** Renglones (código interno de New Bytes = `id`, el mismo que usa NODO; `sku` es el part number). */
export function nbLines(d: NbVoucherData): Lines {
  const lines: Lines = new Map();
  for (const raw of Array.isArray(d.detalle) ? d.detalle : []) {
    const it = rec(raw);
    addLine(lines, it.id ?? it.sku, it.cantidad);
  }
  return lines;
}

const money = (n: number | null, cur: string | null) =>
  n == null ? "-" : `${cur === "USD" ? "US$ " : "$ "}${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** PDF del comprobante con los datos oficiales y el QR de ARCA, marcado como generado por NODO. */
export async function renderNbVoucherPdf(d: NbVoucherData, fiscal: FiscalData): Promise<Buffer> {
  const cab = rec(d.cabecera);
  const tot = rec(d.totales);
  const cli = rec(d.cliente);
  const qrUrl = str(rec(d.recursos).qr);
  const qrPng = qrUrl ? await QRCode.toBuffer(qrUrl, { margin: 1, width: 220 }) : null;
  const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: `Comprobante New Bytes ${fiscal.tipo ?? ""} ${fiscal.punto_venta ?? ""}-${fiscal.numero ?? ""}`, Creator: "NODO", Producer: "NODO" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(8).fillColor("#666").text("Generado por NODO con los datos oficiales del comprobante de New Bytes (sistema de facturación lio.red). No es el PDF original del distribuidor.", { width: 515 });
  doc.moveDown(0.8).fillColor("#000");
  const clase = fiscal.clase === "nota_credito" ? "NOTA DE CRÉDITO" : fiscal.clase === "nota_debito" ? "NOTA DE DÉBITO" : "FACTURA";
  doc.fontSize(16).text(`${clase} ${fiscal.tipo ?? ""}`.trim());
  doc.fontSize(10);
  const pv = fiscal.punto_venta != null ? String(fiscal.punto_venta).padStart(5, "0") : "-";
  const nro = fiscal.numero != null ? String(fiscal.numero).padStart(8, "0") : "-";
  doc.text(`N° ${pv}-${nro}    Fecha: ${fiscal.fecha_emision ?? "-"}`);
  doc.text(`Emisor: ${str(cab.razonSocialEmpresa) ?? str(cab.empresa) ?? "New Bytes"}    CUIT ${fiscal.cuit_emisor ?? "-"}`);
  const cliente = str(cli.razonSocial) ?? str(cli.nombre) ?? str(cli.denominacion);
  if (cliente) doc.text(`Cliente: ${cliente}${str(cli.cuit) ? `    CUIT ${str(cli.cuit)}` : ""}`);
  doc.moveDown();

  // Renglones
  const cols = [40, 80, 170, 430, 495];
  doc.fontSize(8).fillColor("#444");
  const y0 = doc.y;
  ["Cant.", "Código", "Producto", "Precio", "Subtotal"].forEach((h, i) => doc.text(h, cols[i], y0, { width: i === 2 ? 255 : 70 }));
  doc.moveDown(0.4).fillColor("#000");
  for (const raw of Array.isArray(d.detalle) ? d.detalle : []) {
    const it = rec(raw);
    if (doc.y > 700) doc.addPage();
    const y = doc.y;
    doc.text(String(it.cantidad ?? ""), cols[0], y, { width: 35 });
    doc.text(String(it.sku ?? it.id ?? ""), cols[1], y, { width: 85 });
    doc.text(String(it.producto ?? ""), cols[2], y, { width: 255 });
    doc.text(money(numOf(it.precio), fiscal.moneda), cols[3], y, { width: 62 });
    doc.text(money(numOf(it.subtotal), fiscal.moneda), cols[4], y, { width: 70 });
    doc.moveDown(0.3);
  }
  doc.moveDown();
  doc.fontSize(10);
  for (const [label, key] of [["Neto 21 %", "neto21"], ["IVA 21 %", "iva21"], ["Neto 10,5 %", "neto105"], ["IVA 10,5 %", "iva105"], ["Impuestos internos", "internalTax"], ["Percepciones", "perceptions"]] as const) {
    const v = numOf(tot[key]);
    if (v != null && Math.abs(v) > 0.004) doc.text(`${label}: ${money(v, fiscal.moneda)}`, 330, doc.y, { width: 225, align: "right" });
  }
  doc.fontSize(12).text(`Total: ${money(fiscal.importe_total, fiscal.moneda)}`, 330, doc.y, { width: 225, align: "right" });
  if (fiscal.moneda === "USD" && fiscal.cotizacion) doc.fontSize(9).text(`Cotización: ${fiscal.cotizacion}`, 330, doc.y, { width: 225, align: "right" });
  doc.moveDown(1.5);
  const yq = doc.y;
  if (qrPng) doc.image(qrPng, 40, yq, { width: 100 });
  doc.fontSize(10).text(`CAE: ${fiscal.cae ?? "-"}`, 160, yq + 20);
  doc.text(`Vencimiento del CAE: ${fiscal.cae_vencimiento ?? "-"}`, 160, doc.y);
  if (str(cab.tipoComprobante)) doc.text(String(cab.tipoComprobante), 160, doc.y);
  doc.end();
  return done;
}
