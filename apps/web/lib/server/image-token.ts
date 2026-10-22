import { createDecipheriv, createHash } from "node:crypto";

/**
 * Descifra la dirección de una foto de ficha enriquecida (la cifra la API con la
 * misma CONTENT_IMAGE_KEY; ver apps/api/src/platform-content/image-token.ts).
 * Devuelve null si falta la clave, el token no es válido o venció.
 */
export function decryptImageToken(token: string): string | null {
  const secret = process.env.CONTENT_IMAGE_KEY;
  if (!secret) return null;
  const key = /^[0-9a-f]{64}$/i.test(secret) ? Buffer.from(secret, "hex") : createHash("sha256").update(secret).digest();
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const { u, e } = JSON.parse(json) as { u?: unknown; e?: unknown };
    if (typeof u !== "string" || typeof e !== "number" || e < Math.floor(Date.now() / 1000)) return null;
    return u;
  } catch {
    return null;
  }
}
