import { createHmac, timingSafeEqual } from "crypto";

/**
 * Firma de los webhooks, al estilo de Stripe:
 * `Nodo-Signature: t=<unix>,v1=<hex HMAC-SHA256("<t>.<body>", secret)>`.
 * El timestamp entra en la firma para que una entrega vieja no se pueda reenviar.
 */
export function signPayload(secret: string, body: string, timestamp: number): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

/** Verificación de referencia (la misma que documentamos para los integradores). */
export function verifySignature(secret: string, body: string, header: string, toleranceSeconds = 300, now = Date.now()): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    })
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) return false;
  if (Math.abs(now / 1000 - t) > toleranceSeconds) return false;
  const expected = Buffer.from(signPayload(secret, body, t).split("v1=")[1], "hex");
  const given = Buffer.from(parts.v1, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
