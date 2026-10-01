import { isIP } from "node:net";

/**
 * La IP real del cliente detrás del proxy de Railway.
 *
 * Railway reescribe los headers de IP en su borde (lo que mande el cliente se
 * descarta) y deja la IP de quien se conectó en X-Real-IP. X-Forwarded-For
 * queda como "cliente, borde de Railway": el último salto es una IP pública de
 * Railway, no del cliente, así que no sirve leerlo de derecha a izquierda.
 * Medido en producción el 2026-10-01. Sin headers (local, tests) vale la IP
 * del socket.
 */
export function clientIp(
  realIp: string | string[] | undefined,
  forwardedFor: string | string[] | undefined,
  socketIp: string | undefined
): string {
  const real = (Array.isArray(realIp) ? realIp[0] : realIp)?.trim();
  if (real && isIP(real)) return real;
  const first = (Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor ?? "").split(",")[0]?.trim();
  if (first && isIP(first)) return first;
  return socketIp || "unknown";
}
