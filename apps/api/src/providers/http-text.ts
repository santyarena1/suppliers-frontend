/**
 * Invid (y otros PHP viejos) mandan `Content-Type: text/html; charset=ISO-8859-1`.
 * Axios en Node, con `responseType: "text"`, ignora ese charset y decodifica
 * como UTF-8: el byte 0xE9 de "é" se vuelve U+FFFD (�) y en pantalla queda
 * "Electrodom�sticos". Hay que leer los bytes y decodificar con el charset real.
 */

function headerValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string").join(";");
  return "";
}

function charsetFrom(source: string): string | null {
  const m = source.match(/charset\s*=\s*["']?([a-z0-9._-]+)/i);
  return m?.[1] ?? null;
}

function charsetFromMeta(latin1Head: string): string | null {
  const httpEquiv = latin1Head.match(
    /<meta[^>]+http-equiv=["']content-type["'][^>]+content=["']([^"']+)["']/i
  );
  if (httpEquiv) return charsetFrom(httpEquiv[1]);
  const html5 = latin1Head.match(/<meta[^>]+charset=["']?([a-z0-9._-]+)/i);
  return html5?.[1] ?? null;
}

function isLatin1Family(charset: string): boolean {
  const n = charset.toLowerCase().replace(/_/g, "-");
  return (
    n === "iso-8859-1" ||
    n === "iso-8859-15" ||
    n === "latin1" ||
    n === "latin-1" ||
    n === "windows-1252" ||
    n === "cp1252"
  );
}

export function decodeHttpText(data: ArrayBuffer | Buffer | Uint8Array, contentType?: unknown): string {
  const buf = Buffer.isBuffer(data)
    ? data
    : Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
  if (buf.length === 0) return "";
  const header = headerValue(contentType);
  const charset = (charsetFrom(header) || charsetFromMeta(buf.subarray(0, 4096).toString("latin1")) || "utf-8")
    .toLowerCase()
    .replace(/_/g, "-");
  if (isLatin1Family(charset)) {
    return new TextDecoder("windows-1252").decode(buf);
  }
  return buf.toString("utf8");
}
