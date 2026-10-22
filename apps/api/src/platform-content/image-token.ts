import { createCipheriv, createDecipheriv, createHash, createHmac } from "node:crypto";

/**
 * Dirección de foto cifrada para la ficha enriquecida: el navegador ve un código y
 * el /img-proxy de la web (misma clave, CONTENT_IMAGE_KEY) lo descifra y busca la foto.
 * Así no se ve de dónde sale cada foto ni se puede armar la lista para bajarlas todas.
 *
 * Formato: base64url( iv(12) | tag(16) | AES-256-GCM(JSON { u, e }) ).
 * El token es el mismo para todos durante la ventana (iv derivado de url + vencimiento)
 * para que la caché de Vercel siga sirviendo la foto sin volver a buscarla.
 */

/** Ventana del vencimiento: un token sirve entre 6 y 12 horas. */
const WINDOW_SECONDS = 6 * 60 * 60;

/** Clave de 32 bytes a partir del secreto (hex de 64 caracteres o cualquier texto). */
export function imageKey(secret: string): Buffer {
  return /^[0-9a-f]{64}$/i.test(secret) ? Buffer.from(secret, "hex") : createHash("sha256").update(secret).digest();
}

export function encryptImageUrl(url: string, key: Buffer, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const exp = (Math.floor(nowSeconds / WINDOW_SECONDS) + 2) * WINDOW_SECONDS;
  const iv = createHmac("sha256", key).update(`${exp}|${url}`).digest().subarray(0, 12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ u: url, e: exp }), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** Para pruebas y para el lado web: null si el token no es válido o venció. */
export function decryptImageUrl(token: string, key: Buffer, nowSeconds = Math.floor(Date.now() / 1000)): string | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const { u, e } = JSON.parse(json) as { u?: unknown; e?: unknown };
    if (typeof u !== "string" || typeof e !== "number" || e < nowSeconds) return null;
    return u;
  } catch {
    return null;
  }
}
