import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { extname } from "path";
import { PrismaService } from "../prisma/prisma.service";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const CHAT_MIME = new Set([
  ...ALLOWED_MIME,
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "application/pdf": ".pdf",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

const MAX_BYTES = 5 * 1024 * 1024;
const CHAT_MAX_BYTES = 10 * 1024 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async saveImage(file: {
    filename: string;
    mimetype: string;
    buffer: Buffer;
  }): Promise<{ url: string }> {
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
    const safeExt = ext.replace(/[^.a-z0-9]/gi, "") || ".bin";
    const originalName = (file.filename || `image${safeExt}`).slice(0, 200);

    const asset = await this.prisma.storedAsset.create({
      data: {
        mimeType: mime,
        filename: originalName,
        byteSize: file.buffer.length,
        data: file.buffer,
      },
      select: { id: true },
    });

    return { url: `/assets/${asset.id}` };
  }

  async saveChatFile(file: {
    filename: string;
    mimetype: string;
    buffer: Buffer;
  }): Promise<{ url: string; filename: string; mimeType: string; byteSize: number; kind: "IMAGE" | "FILE" }> {
    const mime = (file.mimetype || "").toLowerCase();
    if (!CHAT_MIME.has(mime)) {
      throw new BadRequestException("En el chat se pueden mandar fotos o PDF / Excel");
    }
    if (file.buffer.length > CHAT_MAX_BYTES) {
      throw new BadRequestException("El archivo no puede superar 10 MB");
    }
    const fromMime = MIME_EXT[mime];
    const fromName = extname(file.filename || "").toLowerCase();
    const ext = fromMime || fromName || ".bin";
    const safeExt = ext.replace(/[^.a-z0-9]/gi, "") || ".bin";
    const originalName = (file.filename || `archivo${safeExt}`).slice(0, 200);
    const asset = await this.prisma.storedAsset.create({
      data: {
        mimeType: mime,
        filename: originalName,
        byteSize: file.buffer.length,
        data: file.buffer,
      },
      select: { id: true },
    });
    return {
      url: `/assets/${asset.id}`,
      filename: originalName,
      mimeType: mime,
      byteSize: file.buffer.length,
      kind: ALLOWED_MIME.has(mime) ? "IMAGE" : "FILE",
    };
  }

  async findById(id: string) {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException("Asset no encontrado");
    }
    const asset = await this.prisma.storedAsset.findUnique({ where: { id } });
    if (!asset) {
      throw new NotFoundException("Asset no encontrado");
    }
    return asset;
  }
}
