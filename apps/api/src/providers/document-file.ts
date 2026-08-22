import { StreamableFile } from "@nestjs/common";
import { safeFilename, sniffContentType } from "./safe-url";

export function documentFile(buffer: Buffer, contentType: string | undefined, filename: string) {
  const type = sniffContentType(buffer, contentType || "application/octet-stream");
  const ext = type === "application/pdf" ? ".pdf" : type === "image/jpeg" ? ".jpg" : type === "image/png" ? ".png" : "";
  const base = safeFilename(filename);
  const withExt = ext && !base.toLowerCase().endsWith(ext) ? `${base}${ext}` : base;
  return new StreamableFile(buffer, {
    type,
    disposition: `attachment; filename="${withExt}"`,
  });
}
