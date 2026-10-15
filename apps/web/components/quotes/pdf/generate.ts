import { createElement } from "react";
import { proxyImg } from "@/lib/format";
import type { QuotePdfModel } from "./quote-pdf-model";

const IMAGE_TIMEOUT_MS = 6000;
const THUMB_PX = 160;
const LOGO_PX = 360;

/**
 * Baja una foto (por el proxy de imágenes o desde los assets de NODO) y la
 * pasa a JPEG chico en un data: URL, que es lo que react-pdf dibuja sin
 * problemas (WebP no lo soporta). Si no carga, el PDF sale sin esa foto.
 */
async function toDataUrl(src: string, maxPx: number, keepAlpha = false): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const res = await fetch(proxyImg(src, { trim: false }), { signal: controller.signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (!keepAlpha) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return keepAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fotos de a varias a la vez. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]);
    })
  );
  return out;
}

/** Arma el PDF (las librerías se cargan recién acá: no pesan en el resto de la app). */
export async function renderQuotePdf(model: QuotePdfModel, logoUrl: string | null): Promise<Blob> {
  const [{ pdf }, { default: QuotePdfDocument }] = await Promise.all([import("@react-pdf/renderer"), import("./QuotePdfDocument")]);
  const [logo, images] = await Promise.all([
    logoUrl ? toDataUrl(logoUrl, LOGO_PX, true) : Promise.resolve(null),
    model.showImages ? mapLimit(model.lines, 6, (l) => (l.imageSrc ? toDataUrl(l.imageSrc, THUMB_PX) : Promise.resolve(null))) : Promise.resolve([]),
  ]);
  const full: QuotePdfModel = {
    ...model,
    logo,
    lines: model.lines.map((l, i) => ({ ...l, image: images[i] ?? null })),
  };
  return pdf(createElement(QuotePdfDocument, { model: full }) as never).toBlob();
}

/** Baja el archivo. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** El celular (y Chrome/Edge en la PC) puede mandar el PDF directo a WhatsApp u otra app. */
export function canShareFiles(): boolean {
  try {
    const probe = new File([new Blob(["x"], { type: "application/pdf" })], "x.pdf", { type: "application/pdf" });
    return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Comparte el PDF con la hoja de compartir del sistema. `false` si el usuario la cerró. */
export async function shareBlob(blob: Blob, filename: string, text: string): Promise<boolean> {
  const file = new File([blob], filename, { type: "application/pdf" });
  try {
    await navigator.share({ files: [file], title: filename.replace(/\.pdf$/, ""), text });
    return true;
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return false;
    throw err;
  }
}
