import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Links firmados para archivos privados (adjuntos del chat).
 *
 * El navegador pide los archivos con <img>/<a>, que no mandan el JWT. En vez de
 * dejarlos públicos, el API entrega el link con una firma que vence: solo lo
 * recibe quien puede ver la conversación, y reenviado afuera deja de servir.
 * El vencimiento se redondea al día para que el link sea estable y cacheable.
 */

export const SIGNED_ASSET_TTL_DAYS = 7;
const DAY_MS = 86_400_000;

function secret(): string {
  const s = process.env.ASSET_SIGNING_SECRET || process.env.JWT_SECRET || "";
  if (!s) throw new Error("Falta ASSET_SIGNING_SECRET/JWT_SECRET para firmar archivos");
  return s;
}

function signature(assetId: string, exp: number): string {
  return createHmac("sha256", secret()).update(`asset:${assetId}:${exp}`).digest("base64url");
}

/** `/assets/<id>` → `/assets/<id>?exp=…&sig=…` */
export function signAssetPath(path: string, now = Date.now()): string {
  const match = /^\/assets\/([0-9a-f-]{36})$/i.exec(path);
  if (!match) return path;
  const exp = Math.ceil(now / DAY_MS + SIGNED_ASSET_TTL_DAYS) * DAY_MS;
  return `${path}?exp=${exp}&sig=${signature(match[1], exp)}`;
}

export function verifyAssetSignature(assetId: string, exp: unknown, sig: unknown, now = Date.now()): boolean {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < now || typeof sig !== "string" || !sig) return false;
  const expected = Buffer.from(signature(assetId, expNum));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
