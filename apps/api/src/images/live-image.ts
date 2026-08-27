const HTTP_URL = /^https?:\/\//i;
const MIN_BYTES = 800;
const MAX_BYTES = 5 * 1024 * 1024;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export type LiveImage = {
  url: string;
  mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  ext: string;
  buffer: Buffer;
};

export function sniffRasterImageMime(buffer: Buffer): LiveImage["mime"] | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 6) {
    const head = buffer.subarray(0, 6).toString("ascii");
    if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function isPublicHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (!HTTP_URL.test(url.href)) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host === "::1" || host === "0.0.0.0") {
    return false;
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
  }
  if (host.includes(":") && (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:"))) {
    return false;
  }
  return true;
}

export function isStoredAssetPath(url: string): boolean {
  return url.startsWith("/assets/") || url.startsWith("/uploads/");
}

type ProbeHttp = (url: string) => Promise<{ status: number; buffer: Buffer } | null>;

export async function probeLiveImage(url: string, http: ProbeHttp = fetchImageBytes): Promise<LiveImage | null> {
  if (!isPublicHttpUrl(url)) return null;
  const res = await http(url);
  if (!res || res.status < 200 || res.status >= 300) return null;
  if (res.buffer.length < MIN_BYTES || res.buffer.length > MAX_BYTES) return null;
  const mime = sniffRasterImageMime(res.buffer);
  if (!mime) return null;
  return { url, mime, ext: MIME_EXT[mime], buffer: res.buffer };
}

async function fetchImageBytes(url: string): Promise<{ status: number; buffer: Buffer } | null> {
  const axios = (await import("axios")).default;
  try {
    const res = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: 8_000,
      maxRedirects: 4,
      maxContentLength: MAX_BYTES,
      maxBodyLength: MAX_BYTES,
      validateStatus: () => true,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: "https://www.google.com/",
      },
    });
    const buffer = Buffer.from(res.data);
    return { status: res.status, buffer };
  } catch {
    return null;
  }
}

export async function firstLiveImage(
  urls: string[],
  http?: ProbeHttp
): Promise<LiveImage | null> {
  for (const url of urls) {
    const live = await probeLiveImage(url, http);
    if (live) return live;
  }
  return null;
}
