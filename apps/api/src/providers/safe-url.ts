import { BadRequestException } from "@nestjs/common";

export function assertHttpsHost(href: string, base: string, hosts: string[]): URL {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    throw new BadRequestException("URL de documento inválida");
  }
  if (url.protocol !== "https:") {
    throw new BadRequestException("URL de documento no permitida");
  }
  if (!hosts.includes(url.hostname)) {
    throw new BadRequestException("URL de documento no permitida");
  }
  return url;
}

export function sniffContentType(buffer: Buffer, fallback = "application/octet-stream"): string {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  return fallback;
}

export function safeFilename(name: string, fallback = "documento"): string {
  const cleaned = name.replace(/[^\w.\-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
  return cleaned || fallback;
}
