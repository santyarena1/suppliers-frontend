/** Red para las fuentes externas: timeout, tope de tamaño y nada de hosts internos. */

export const HTTP_TIMEOUT_MS = 15_000;
export const MAX_PAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
};

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/**
 * Solo http(s) a hosts públicos. Las URLs de fotos vienen de los
 * distribuidores: no se sigue nada que apunte a la red interna.
 */
export function isSafePublicUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (PRIVATE_HOST.test(host) || isPrivateIpv4(host)) return false;
  if (host.includes(":")) return false; // IPv6 literal: no hay fuentes legítimas así
  return true;
}

export interface RawResponse {
  status: number;
  contentType: string;
  buffer: Buffer;
  url: string;
}

/** GET con timeout y tope de bytes. Tira error de red; un 4xx/5xx vuelve con su status. */
export async function httpGet(url: string, opts: { headers?: Record<string, string>; maxBytes?: number } = {}): Promise<RawResponse> {
  if (!isSafePublicUrl(url)) throw new Error(`URL no permitida: ${url}`);
  const maxBytes = opts.maxBytes ?? MAX_PAGE_BYTES;
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, ...(opts.headers ?? {}) },
    redirect: "follow",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!isSafePublicUrl(res.url || url)) throw new Error(`Redirección no permitida: ${res.url}`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error(`Respuesta demasiado grande (${declared} bytes)`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error(`Respuesta demasiado grande (${buffer.length} bytes)`);
  return { status: res.status, contentType: res.headers.get("content-type") ?? "", buffer, url: res.url || url };
}

/**
 * Lee solo el principio de una respuesta (hasta `maxBytes`) y corta la
 * descarga: alcanza para el tipo y las medidas de una imagen sin bajarla entera.
 */
export async function httpGetPrefix(url: string, maxBytes: number): Promise<RawResponse & { totalBytes: number | null }> {
  if (!isSafePublicUrl(url)) throw new Error(`URL no permitida: ${url}`);
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, Range: `bytes=0-${maxBytes - 1}` },
    redirect: "follow",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!isSafePublicUrl(res.url || url)) throw new Error(`Redirección no permitida: ${res.url}`);
  const range = res.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
  const length = res.headers.get("content-length");
  const totalBytes = range ? Number(range) : res.status === 200 && length ? Number(length) : null;
  const chunks: Buffer[] = [];
  let got = 0;
  const reader = res.body?.getReader();
  if (reader) {
    while (got < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(Buffer.from(value));
      got += value.length;
    }
    await reader.cancel().catch(() => undefined);
  }
  return {
    status: res.status === 206 ? 200 : res.status,
    contentType: res.headers.get("content-type") ?? "",
    buffer: Buffer.concat(chunks).subarray(0, maxBytes),
    url: res.url || url,
    totalBytes,
  };
}
