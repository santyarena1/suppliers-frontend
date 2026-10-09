import { createHash } from "crypto";
import { httpGetPrefix } from "./sources/http";

export interface ImageDims {
  mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  width: number;
  height: number;
}

/** Tipo y medidas leyendo la cabecera del archivo (sin decodificar la imagen). */
export function imageSize(buf: Buffer): ImageDims | null {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { mime: "image/png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "GIF") {
    return { mime: "image/gif", width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8 ") return { mime: "image/webp", width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { mime: "image/webp", width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { mime: "image/webp", width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
    return null;
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = buf.readUInt16BE(i + 2);
      // SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mime: "image/jpeg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** Lado mínimo para proponer una foto (más chica se ve mal en la ficha). */
export const MIN_IMAGE_SIDE = 300;
/** Lo que se baja de cada foto para verificarla. */
const PREFIX_BYTES = 192 * 1024;

export interface ImageCandidate {
  url: string;
  /** manufacturer | icecat | distributor */
  source: string;
  /** Proveedor o conector de donde salió. */
  origin: string;
  width?: number;
  height?: number;
}

export interface VerifiedImage extends ImageCandidate {
  ok: boolean;
  mime?: string;
  bytes?: number | null;
  /** sha256 del principio del archivo + tamaño: detecta la misma foto en dos URLs. */
  fingerprint?: string;
  reason?: string;
}

export type PrefixFetcher = typeof httpGetPrefix;

/**
 * Verifica fotos candidatas en memoria: que sean imagen de verdad, del tamaño
 * mínimo, y sin repetir. No se guarda nada: el archivo se copia a nuestro
 * almacenamiento recién cuando el superadmin aprueba la galería.
 */
export async function verifyImages(candidates: ImageCandidate[], fetchPrefix: PrefixFetcher = httpGetPrefix, max = 10): Promise<VerifiedImage[]> {
  const out: VerifiedImage[] = [];
  const seenUrls = new Set<string>();
  const seenPrints = new Set<string>();
  let accepted = 0;
  for (const c of candidates) {
    if (accepted >= max) break;
    if (seenUrls.has(c.url)) continue;
    seenUrls.add(c.url);
    try {
      const res = await fetchPrefix(c.url, PREFIX_BYTES);
      if (res.status !== 200) {
        out.push({ ...c, ok: false, reason: `HTTP ${res.status}` });
        continue;
      }
      const dims = imageSize(res.buffer);
      if (!dims) {
        out.push({ ...c, ok: false, reason: `no es una imagen reconocible (${res.contentType || "sin tipo"})` });
        continue;
      }
      const fingerprint = createHash("sha256").update(res.buffer.subarray(0, 64 * 1024)).update(String(res.totalBytes ?? "")).digest("hex");
      if (seenPrints.has(fingerprint)) {
        out.push({ ...c, ok: false, reason: "repetida (mismo archivo que otra candidata)" });
        continue;
      }
      seenPrints.add(fingerprint);
      if (Math.min(dims.width, dims.height) < MIN_IMAGE_SIDE) {
        out.push({ ...c, ...dims, ok: false, mime: dims.mime, reason: `chica (${dims.width}×${dims.height})` });
        continue;
      }
      accepted++;
      out.push({ ...c, width: dims.width, height: dims.height, ok: true, mime: dims.mime, bytes: res.totalBytes, fingerprint });
    } catch (err) {
      out.push({ ...c, ok: false, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}
