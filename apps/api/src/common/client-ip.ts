import { isIP } from "node:net";

/**
 * La IP real del cliente detrás del proxy de Railway.
 *
 * Railway agrega la IP de quien se conecta al final de X-Forwarded-For. Lo que
 * mande el cliente en ese header queda a la izquierda, así que se lee de
 * derecha a izquierda y se toma la primera IP pública: falsear el header no
 * cambia el resultado. Sin header (local, tests) vale la IP del socket.
 */
export function clientIp(forwardedFor: string | string[] | undefined, socketIp: string | undefined): string {
  const raw = Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor ?? "";
  const hops = raw
    .split(",")
    .map((h) => h.trim())
    .filter((h) => isIP(h) !== 0);
  for (let i = hops.length - 1; i >= 0; i--) {
    if (!isPrivate(hops[i])) return hops[i];
  }
  return socketIp || hops[hops.length - 1] || "unknown";
}

function isPrivate(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("::ffff:10.") || v6.startsWith("::ffff:127.");
}
