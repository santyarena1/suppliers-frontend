/**
 * Un PDF bajado del portal → datos fiscales con su origen. El QR de ARCA
 * manda; el texto completa lo que el QR no trae (vencimiento del CAE). Si no
 * hay nada legible, todo queda en null.
 */
import { EMPTY_FISCAL, hasFiscalData, mergeFiscal, parseArcaQr, parseInvoiceText, type FiscalData } from "./arca-invoice";
import { isPdf, readInvoicePdf } from "./invoice-pdf";

export type FiscalOrigin = "qr" | "texto" | "portal";

export interface InvoiceAnalysis {
  isPdf: boolean;
  pages: number;
  qrFrom: "link" | "texto" | "imagen" | null;
  /** Cantidad de QR de ARCA distintos (más de uno: el PDF junta varias facturas). */
  qrCount: number;
  fiscal: FiscalData;
  origen: FiscalOrigin | null;
  /** Campos con dato. */
  filled: (keyof FiscalData)[];
  text: string;
  images: string[];
  qrUrls: string[];
  error?: string;
}

export function filledFields(f: FiscalData): (keyof FiscalData)[] {
  return (Object.keys(f) as (keyof FiscalData)[]).filter((k) => f[k] != null);
}

export async function analyzeInvoicePdf(buf: Buffer): Promise<InvoiceAnalysis> {
  if (!isPdf(buf)) return { isPdf: false, pages: 0, qrFrom: null, qrCount: 0, fiscal: { ...EMPTY_FISCAL }, origen: null, filled: [], text: "", images: [], qrUrls: [] };
  try {
    const r = await readInvoicePdf(buf);
    const qr = r.qrUrls.map(parseArcaQr).find((x) => x != null) ?? null;
    const text = parseInvoiceText(r.text);
    const fiscal = mergeFiscal(qr, text);
    const origen: FiscalOrigin | null = qr ? "qr" : hasFiscalData(text) ? "texto" : null;
    return { isPdf: true, pages: r.pages, qrFrom: qr ? r.qrFrom : null, qrCount: r.qrUrls.length, fiscal: origen ? fiscal : { ...EMPTY_FISCAL }, origen, filled: origen ? filledFields(fiscal) : [], text: r.text, images: r.images, qrUrls: r.qrUrls };
  } catch (err) {
    return { isPdf: true, pages: 0, qrFrom: null, qrCount: 0, fiscal: { ...EMPTY_FISCAL }, origen: null, filled: [], text: "", images: [], qrUrls: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/** ¿El texto del PDF nombra alguno de estos números de pedido? (para unir facturas sin referencia). */
export function mentionedNumbers(text: string, numbers: Iterable<string>): string[] {
  const out: string[] = [];
  for (const n of numbers) {
    const d = n.replace(/\D/g, "");
    if (d.length < 4) continue;
    const re = new RegExp(`(?<!\\d)0*${d}(?!\\d)`);
    if (re.test(text)) out.push(n);
  }
  return out;
}
