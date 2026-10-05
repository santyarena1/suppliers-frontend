import { lookup as dnsLookup, type LookupAddress } from "dns";
import { isIP, type LookupFunction } from "net";
import { isServerRuntime } from "../core/runtime";

/**
 * Protección contra SSRF en los webhooks: el comercio elige la URL, así que no
 * puede apuntar a la red interna de NODO (base, Redis, metadata de la nube).
 *
 * La IP se valida en el momento de conectar (lookup propio del agente HTTP), no
 * antes: así un DNS que cambia de respuesta entre la validación y la conexión
 * (DNS rebinding) no sirve para colarse.
 */

export class UnsafeWebhookUrlError extends Error {}

function ipv4Blocked(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast y reservadas
  );
}

function ipv6Blocked(ip: string): boolean {
  const v = ip.toLowerCase().split("%")[0];
  if (v === "::" || v === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return ipv4Blocked(mapped[1]);
  return /^(fc|fd)/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v);
}

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return ipv4Blocked(ip);
  if (version === 6) return ipv6Blocked(ip);
  return true;
}

const isProduction = () => isServerRuntime();

/** ¿Se permite apuntar a localhost? Solo fuera de producción (para probar en local). */
export function allowsLocalhost(): boolean {
  return !isProduction() && process.env.WEBHOOKS_ALLOW_LOCALHOST !== "false";
}

/** Valida la forma de la URL. La IP se valida al conectar (`safeLookup`). */
export function assertWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeWebhookUrlError("La URL no es válida.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && allowsLocalhost() && url.protocol === "http:")) {
    throw new UnsafeWebhookUrlError("La URL del webhook tiene que ser https.");
  }
  if (url.username || url.password) throw new UnsafeWebhookUrlError("La URL no puede llevar usuario ni contraseña.");
  if (local && !allowsLocalhost()) throw new UnsafeWebhookUrlError("La URL no puede apuntar a una red interna.");
  if (!local && isIP(url.hostname.replace(/^\[|\]$/g, "")) && isBlockedIp(url.hostname.replace(/^\[|\]$/g, ""))) {
    throw new UnsafeWebhookUrlError("La URL no puede apuntar a una red interna.");
  }
  if (url.toString().length > 2000) throw new UnsafeWebhookUrlError("La URL es demasiado larga.");
  return url;
}

/** `lookup` para el agente HTTP: resuelve y rechaza IPs internas. */
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = (Array.isArray(addresses) ? addresses : [addresses]) as LookupAddress[];
    const localName = hostname === "localhost";
    const allowed = list.filter((a) => !isBlockedIp(a.address) || (localName && allowsLocalhost()));
    if (allowed.length === 0) {
      return callback(new UnsafeWebhookUrlError(`${hostname} resuelve a una red interna`), "", 4);
    }
    if ((options as { all?: boolean }).all) {
      return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, allowed);
    }
    callback(null, allowed[0].address, allowed[0].family);
  });
};
