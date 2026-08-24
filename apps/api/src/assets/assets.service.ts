import { BadRequestException, Injectable, OnModuleInit } from "@nestjs/common";
import { existsSync, mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

const MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class AssetsService implements OnModuleInit {
  readonly uploadsDir = join(process.cwd(), "uploads");

  onModuleInit() {
    this.ensureDir();
  }

  ensureDir() {
    if (!existsSync(this.uploadsDir)) {
      mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async saveImage(file: {
    filename: string;
    mimetype: string;
    buffer: Buffer;
  }): Promise<{ url: string }> {
    this.ensureDir();

    const mime = (file.mimetype || "").toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      throw new BadRequestException(
        "Solo se permiten imágenes (JPEG, PNG, WebP, GIF, SVG)"
      );
    }
    if (file.buffer.length > MAX_BYTES) {
      throw new BadRequestException("La imagen no puede superar 5 MB");
    }

    const fromMime = MIME_EXT[mime];
    const fromName = extname(file.filename || "").toLowerCase();
    const ext = fromMime || fromName || ".bin";
    const safeExt = ext.replace(/[^.a-z0-9]/gi, "");
    const name = `${randomUUID()}${safeExt}`;
    const path = join(this.uploadsDir, name);

    await writeFile(path, file.buffer);
    return { url: `/uploads/${name}` };
  }
}
