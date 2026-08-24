/**
 * Utilidades de imagen en el cliente (preview / quitar fondo blanco).
 */

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

/** Convierte un File/Blob a data URL para previews. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo previsualizar"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Pone transparentes los píxeles cercanos al blanco (útil para logos con fondo blanco).
 * `threshold` 0–255: más alto = solo blancos muy puros.
 */
export async function removeWhiteBackground(
  file: File,
  threshold = 245,
): Promise<File> {
  const img = await loadImageFromFile(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    if (r >= threshold && g >= threshold && b >= threshold) {
      d[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))),
      "image/png",
    );
  });

  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}.png`, { type: "image/png" });
}
