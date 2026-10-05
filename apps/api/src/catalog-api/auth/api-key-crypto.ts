import { Logger } from "@nestjs/common";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { base62 } from "../core/ids";
import { isServerRuntime } from "../core/runtime";

/**
 * Generación y verificación de credenciales de la API.
 *
 * El secret nunca se guarda: se guarda HMAC-SHA256(secret, API_KEY_PEPPER). El
 * pepper vive solo en el entorno, así una copia de la base no alcanza para
 * probar secrets. Con secrets de 192 bits aleatorios no hace falta un hash lento
 * (argon2) y se puede verificar en cada request sin costo.
 */

const DEV_PEPPER = "nodo-dev-pepper-no-usar-en-produccion";
let warned = false;

export function apiKeyPepper(): string {
  const pepper = process.env.API_KEY_PEPPER?.trim();
  if (pepper && pepper.length >= 32) return pepper;
  if (isServerRuntime()) {
    throw new Error("API_KEY_PEPPER es obligatoria en el servidor (mínimo 32 caracteres)");
  }
  if (!warned) {
    warned = true;
    new Logger("CatalogApi").warn("API_KEY_PEPPER no está configurada: se usa un valor de desarrollo");
  }
  return DEV_PEPPER;
}

function token(prefix: string, bytes: number): string {
  return `${prefix}${base62(randomBytes(bytes))}`;
}

export function newPublicKey(): string {
  return token("nodo_pk_", 18);
}

export function newSecret(): string {
  return token("nodo_sk_", 24);
}

export function newFeedToken(): string {
  return token("nodo_ft_", 24);
}

export function newWebhookSecret(): string {
  return token("whsec_", 24);
}

export function hashSecret(secret: string, pepper = apiKeyPepper()): string {
  return createHmac("sha256", pepper).update(secret, "utf8").digest("hex");
}

/** Comparación en tiempo constante contra el hash guardado. */
export function secretMatches(secret: string, storedHash: string | null | undefined, pepper = apiKeyPepper()): boolean {
  if (!storedHash || !secret) return false;
  const a = Buffer.from(hashSecret(secret, pepper), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function last4(secret: string): string {
  return secret.slice(-4);
}

/** Lee las credenciales del request: headers propios o HTTP Basic. */
export function readCredentials(headers: Record<string, string | string[] | undefined>): { key: string; secret: string } | null {
  const header = (name: string) => {
    const v = headers[name];
    return (Array.isArray(v) ? v[0] : v)?.trim() || "";
  };
  const key = header("x-api-key");
  const secret = header("x-api-secret");
  if (key && secret) return { key, secret };
  const auth = header("authorization");
  if (/^basic\s+/i.test(auth)) {
    try {
      const decoded = Buffer.from(auth.replace(/^basic\s+/i, ""), "base64").toString("utf8");
      const sep = decoded.indexOf(":");
      if (sep > 0) return { key: decoded.slice(0, sep).trim(), secret: decoded.slice(sep + 1).trim() };
    } catch {
      return null;
    }
  }
  return null;
}
