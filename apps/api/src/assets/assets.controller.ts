import {
  BadRequestException,
  Controller,
  Get,
  Param,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAssetSignature } from "./asset-signing";
import { Public } from "../common/decorators/public.decorator";
import { AssetsService } from "./assets.service";

@Controller("assets")
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  /** Sube una imagen y devuelve el path estable `/assets/<id>` (bytes en Postgres). */
  @Post("upload")
  async upload(@Req() req: FastifyRequest) {
    const file = await req.file();
    if (!file) {
      throw new BadRequestException("No se recibió ningún archivo");
    }
    const buffer = await file.toBuffer();
    return this.assetsService.saveImage({
      filename: file.filename,
      mimetype: file.mimetype,
      buffer,
    });
  }

  /** PDF / Excel / imagen para materiales de marca. */
  @Post("upload-file")
  async uploadFile(@Req() req: FastifyRequest) {
    const file = await req.file();
    if (!file) {
      throw new BadRequestException("No se recibió ningún archivo");
    }
    const buffer = await file.toBuffer();
    return this.assetsService.saveChatFile({
      filename: file.filename,
      mimetype: file.mimetype,
      buffer,
    });
  }

  /**
   * Sirve el binario del asset. Las imágenes de catálogo y materiales son
   * públicas (img tags no envían JWT). Los adjuntos del chat son privados: sin
   * un link firmado vigente responden 404, igual que si no existieran.
   */
  @Get(":id")
  @Public()
  @SkipThrottle()
  async get(
    @Param("id") id: string,
    @Query("exp") exp: string | undefined,
    @Query("sig") sig: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<StreamableFile> {
    const asset = await this.assetsService.findById(id);
    if (asset.isPrivate && !verifyAssetSignature(asset.id, exp, sig)) {
      throw new NotFoundException("Asset no encontrado");
    }
    // Lo que se sirve acá es un archivo, nunca una página: ni SVG ni HTML ejecutan código.
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    reply.header(
      "Cache-Control",
      asset.isPrivate ? "private, max-age=3600" : "public, max-age=31536000, immutable"
    );
    return new StreamableFile(Buffer.from(asset.data), {
      type: asset.mimeType,
      disposition: `inline; filename="${asset.filename.replace(/"/g, "")}"`,
    });
  }
}
