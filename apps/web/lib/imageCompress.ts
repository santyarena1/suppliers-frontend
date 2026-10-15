/**
 * Achica una foto en el navegador antes de subirla: lado mayor de hasta 1200 px
 * y WebP (o JPEG si el navegador no sabe generar WebP), bajando la calidad hasta
 * que pese menos de ~300 KB. Al redibujarla se pierden los metadatos (EXIF: GPS,
 * modelo del teléfono), que nunca deberían quedar publicados.
 */

const MAX_SIDE = 1200;
const TARGET_BYTES = 300_000;
const ACCEPTED = /^image\/(jpeg|png|webp|gif|heic|heif|avif|bmp)$/i;

export class ImageCompressError extends Error {}

async function decode(file: File): Promise<{ draw: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { draw: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // Algunos navegadores no aceptan opciones: se prueba con <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { draw: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageCompressError("No se pudo leer la foto. Probá con un JPG o PNG.");
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImage(file: File): Promise<File> {
  if (!ACCEPTED.test(file.type) && !/\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(file.name)) {
    throw new ImageCompressError("Eso no es una foto.");
  }
  if (file.size > 40 * 1024 * 1024) throw new ImageCompressError("La foto pesa más de 40 MB.");
  const src = await decode(file);
  try {
    if (!src.width || !src.height) throw new ImageCompressError("La foto está vacía.");
    let side = Math.min(MAX_SIDE, Math.max(src.width, src.height));
    let quality = 0.82;
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = side / Math.max(src.width, src.height);
      const w = Math.max(1, Math.round(src.width * scale));
      const h = Math.max(1, Math.round(src.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new ImageCompressError("Tu navegador no pudo procesar la foto.");
      // Fondo blanco: un PNG transparente pasado a JPEG no queda negro.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(src.draw, 0, 0, w, h);
      blob = await toBlob(canvas, "image/webp", quality);
      // Safari viejo devuelve PNG cuando no sabe hacer WebP.
      if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", quality);
      if (!blob) throw new ImageCompressError("Tu navegador no pudo procesar la foto.");
      if (blob.size <= TARGET_BYTES) break;
      quality = Math.max(0.5, quality - 0.1);
      if (attempt >= 2) side = Math.round(side * 0.8);
    }
    if (!blob) throw new ImageCompressError("Tu navegador no pudo procesar la foto.");
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const base = file.name.replace(/\.[^.]*$/, "").slice(0, 60) || "foto";
    return new File([blob], `${base}.${ext}`, { type: blob.type });
  } finally {
    src.close();
  }
}
