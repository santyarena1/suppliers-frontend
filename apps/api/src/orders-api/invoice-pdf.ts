/**
 * Abre el PDF de una factura y saca lo que sirve para los datos fiscales:
 * el texto y el link del QR de ARCA. El QR se busca en este orden:
 *   1. un link (anotación) del PDF que apunte al QR de ARCA,
 *   2. un link de ARCA escrito en el texto,
 *   3. las imágenes de las primeras páginas, decodificadas con jsQR.
 * No dibuja nada (no necesita canvas) y no ejecuta código del PDF.
 */
import jsQR from "jsqr";
import { isArcaQrUrl } from "./arca-invoice";

// pdfjs-dist 3.x (CommonJS). `isEvalSupported: false` siempre (CVE-2024-4367).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js") as {
  getDocument: (src: Record<string, unknown>) => { promise: Promise<PdfDoc>; destroy: () => Promise<void> };
  OPS: Record<string, number>;
  ImageKind: { GRAYSCALE_1BPP: number; RGB_24BPP: number; RGBA_32BPP: number };
};

interface PdfImage {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
}
interface PdfPage {
  getTextContent: () => Promise<{ items: { str?: string; hasEOL?: boolean }[] }>;
  getAnnotations: () => Promise<{ url?: string; unsafeUrl?: string }[]>;
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  objs: { get: (id: string, cb?: (v: unknown) => void) => unknown };
  commonObjs: { get: (id: string, cb?: (v: unknown) => void) => unknown };
  cleanup: () => void;
}
interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
}

export interface PdfReading {
  pages: number;
  text: string;
  /** Links de QR de ARCA encontrados (sin repetir), en orden de aparición. */
  qrUrls: string[];
  /** De dónde salió el primer QR. */
  qrFrom: "link" | "texto" | "imagen" | null;
}

export const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 4;
const QR_URL_IN_TEXT = /https?:\/\/(?:www\.)?(?:afip|arca)\.gob\.ar\/fe\/qr\/?\?p=[A-Za-z0-9+/=_%-]+/gi;

export function isPdf(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 1024).includes(Buffer.from("%PDF-"));
}

export async function readInvoicePdf(buf: Buffer): Promise<PdfReading> {
  if (!isPdf(buf)) throw new Error("no es un PDF");
  if (buf.length > MAX_PDF_BYTES) throw new Error("PDF demasiado grande");
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    isOffscreenCanvasSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const out: PdfReading = { pages: 0, text: "", qrUrls: [], qrFrom: null };
  const add = (url: string, from: NonNullable<PdfReading["qrFrom"]>) => {
    const u = decodeURIComponentSafe(url.trim());
    if (!isArcaQrUrl(u) || out.qrUrls.includes(u)) return;
    out.qrUrls.push(u);
    out.qrFrom ??= from;
  };
  try {
    const doc = await task.promise;
    out.pages = doc.numPages;
    const texts: string[] = [];
    const pages = Math.min(doc.numPages, MAX_PAGES);
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      texts.push(content.items.map((it) => (it.str ?? "") + (it.hasEOL ? "\n" : " ")).join(""));
      for (const a of await page.getAnnotations().catch(() => [])) add(a.url ?? a.unsafeUrl ?? "", "link");
      page.cleanup();
    }
    out.text = texts.join("\n");
    for (const m of out.text.replace(/\s+(?=[A-Za-z0-9+/=_%-]{4})/g, (s) => s).matchAll(QR_URL_IN_TEXT)) add(m[0], "texto");
    if (out.qrUrls.length === 0) {
      for (let n = 1; n <= pages && out.qrUrls.length === 0; n++) {
        const page = await doc.getPage(n);
        for (const img of await pageImages(page)) {
          const url = decodeQr(img);
          if (url) add(url, "imagen");
        }
        page.cleanup();
      }
    }
  } finally {
    await task.destroy().catch(() => undefined);
  }
  return out;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return s.includes("%") ? decodeURIComponent(s) : s;
  } catch {
    return s;
  }
}

function objGet(store: PdfPage["objs"], id: string): Promise<unknown> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 3000);
    try {
      store.get(id, (v) => {
        clearTimeout(t);
        resolve(v);
      });
    } catch {
      clearTimeout(t);
      resolve(null);
    }
  });
}

async function pageImages(page: PdfPage): Promise<PdfImage[]> {
  const ops = await page.getOperatorList();
  const { OPS } = pdfjs;
  const out: PdfImage[] = [];
  for (let i = 0; i < ops.fnArray.length && out.length < 12; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] ?? [];
    let img: unknown = null;
    if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
      const id = String(args[0]);
      img = await objGet(id.startsWith("g_") ? page.commonObjs : page.objs, id);
    } else if (fn === OPS.paintInlineImageXObject) {
      img = args[0];
    } else if (fn === OPS.paintImageMaskXObject) {
      const m = args[0] as { data?: Uint8Array; width?: number; height?: number } | undefined;
      if (m?.data && m.width && m.height) img = { width: m.width, height: m.height, kind: pdfjs.ImageKind.GRAYSCALE_1BPP, data: m.data };
    }
    const im = img as PdfImage | null;
    // Un QR es casi cuadrado y no es diminuto.
    if (im?.data && im.width >= 21 && im.height >= 21 && Math.abs(im.width / im.height - 1) < 0.2) out.push(im);
  }
  return out;
}

/** Pasa la imagen de pdf.js a RGBA, con margen blanco y agrandada si es chica, y prueba jsQR. */
export function decodeQr(img: PdfImage): string | null {
  const rgba = toRgba(img);
  if (!rgba) return null;
  const scale = Math.max(1, Math.min(8, Math.ceil(240 / Math.max(img.width, img.height))));
  const pad = 4 * scale;
  const w = img.width * scale + pad * 2;
  const h = img.height * scale + pad * 2;
  const out = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < img.height * scale; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < img.width * scale; x++) {
      const s = (sy * img.width + Math.floor(x / scale)) * 4;
      const d = ((y + pad) * w + x + pad) * 4;
      out[d] = rgba[s];
      out[d + 1] = rgba[s + 1];
      out[d + 2] = rgba[s + 2];
      out[d + 3] = 255;
    }
  }
  const hit = jsQR(out, w, h, { inversionAttempts: "attemptBoth" });
  return hit?.data ?? null;
}

function toRgba(img: PdfImage): Uint8ClampedArray | null {
  const { width: w, height: h, data } = img;
  if (!data) return null;
  const px = w * h;
  const out = new Uint8ClampedArray(px * 4);
  const { ImageKind } = pdfjs;
  if (img.kind === ImageKind.RGBA_32BPP || data.length === px * 4) {
    out.set(data.subarray(0, px * 4));
    return out;
  }
  if (img.kind === ImageKind.RGB_24BPP || data.length === px * 3) {
    for (let i = 0; i < px; i++) {
      out[i * 4] = data[i * 3];
      out[i * 4 + 1] = data[i * 3 + 1];
      out[i * 4 + 2] = data[i * 3 + 2];
      out[i * 4 + 3] = 255;
    }
    return out;
  }
  if (img.kind === ImageKind.GRAYSCALE_1BPP || data.length === Math.ceil(w / 8) * h) {
    const row = Math.ceil(w / 8);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bit = (data[y * row + (x >> 3)] >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0;
        const i = (y * w + x) * 4;
        out[i] = out[i + 1] = out[i + 2] = v;
        out[i + 3] = 255;
      }
    }
    return out;
  }
  if (data.length === px) {
    for (let i = 0; i < px; i++) {
      out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = data[i];
      out[i * 4 + 3] = 255;
    }
    return out;
  }
  return null;
}
