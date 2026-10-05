import { isIP } from "net";

/**
 * Lista de IPs permitidas por key: IPs sueltas o rangos CIDR, IPv4 o IPv6.
 * Vacía = cualquier IP.
 */

function ipv4ToBigInt(ip: string): bigint {
  return ip.split(".").reduce((acc, part) => (acc << 8n) + BigInt(Number(part)), 0n);
}

function expandIpv6(ip: string): string[] | null {
  const [head, tail] = ip.split("::");
  if (ip.split("::").length > 2) return null;
  const left = head ? head.split(":") : [];
  const right = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  // IPv4 al final (::ffff:1.2.3.4).
  const fixTail = (parts: string[]) => {
    const last = parts[parts.length - 1];
    if (last && isIP(last) === 4) {
      const n = ipv4ToBigInt(last);
      return [...parts.slice(0, -1), ((n >> 16n) & 0xffffn).toString(16), (n & 0xffffn).toString(16)];
    }
    return parts;
  };
  const l = fixTail(left);
  const r = fixTail(right);
  const missing = 8 - l.length - r.length;
  if (tail === undefined && missing !== 0) return null;
  if (missing < 0) return null;
  return [...l, ...Array(missing).fill("0"), ...r];
}

function ipv6ToBigInt(ip: string): bigint | null {
  const parts = expandIpv6(ip.split("%")[0]);
  if (!parts) return null;
  return parts.reduce((acc, part) => (acc << 16n) + BigInt(parseInt(part || "0", 16)), 0n);
}

/** Normaliza IPv4 mapeada en IPv6 (::ffff:1.2.3.4 → 1.2.3.4). */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(trimmed);
  return mapped ? mapped[1] : trimmed;
}

/** Valida una entrada de la lista (IP o CIDR). */
export function isValidAllowlistEntry(entry: string): boolean {
  const [ip, bits] = entry.trim().split("/");
  const version = isIP(ip);
  if (!version) return false;
  if (bits === undefined) return true;
  if (!/^\d+$/.test(bits)) return false;
  return Number(bits) <= (version === 4 ? 32 : 128);
}

function inRange(ip: string, entry: string): boolean {
  const [rawBase, bitsRaw] = entry.trim().split("/");
  const base = normalizeIp(rawBase);
  const version = isIP(base);
  if (!version || isIP(ip) !== version) return false;
  const total = version === 4 ? 32 : 128;
  const bits = bitsRaw === undefined ? total : Number(bitsRaw);
  const toInt = version === 4 ? ipv4ToBigInt : (v: string) => ipv6ToBigInt(v) ?? -1n;
  const a = toInt(ip);
  const b = toInt(base);
  if (a < 0n || b < 0n) return false;
  const shift = BigInt(total - bits);
  return a >> shift === b >> shift;
}

export function ipAllowed(ip: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return true;
  const client = normalizeIp(ip);
  return allowlist.some((entry) => inRange(client, entry));
}
