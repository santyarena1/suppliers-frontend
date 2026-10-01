import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetch hacia internet pública, para proxies que reciben la URL del cliente.
 *
 * Sin esto, `/img-proxy?url=...` le pega a cualquier dirección desde el
 * servidor: metadata de la nube (169.254.169.254), localhost, la red interna,
 * o terceros usando nuestra IP. Se resuelve el host y se rechaza todo lo que
 * no sea una IP pública, en la URL original y en cada redirección.
 */

const MAX_REDIRECTS = 3;

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function ipPrivate(ip: string): boolean {
  if (isIP(ip) === 4) return ipv4Private(ip);
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6);
}

export class BlockedUrlError extends Error {}

/** La URL apunta a internet pública por http(s). Si no, tira BlockedUrlError. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("URL inválida");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedUrlError("Protocolo no permitido");
  if (url.username || url.password) throw new BlockedUrlError("URL con credenciales");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new BlockedUrlError("Host no permitido");
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new BlockedUrlError("Host no resuelve");
  if (addresses.some((a) => ipPrivate(a.address))) throw new BlockedUrlError("Host interno");
  return url;
}

/** fetch con redirecciones validadas una por una (nunca sigue a una red interna). */
export async function publicFetch(raw: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 10_000, ...rest } = init;
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, { ...rest, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    return res;
  }
  throw new BlockedUrlError("Demasiadas redirecciones");
}
