import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  StreamableFile,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { FastifyRequest } from "fastify";
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

  /** Sirve el binario del asset. Público (img tags / img-proxy no envían JWT). */
  @Get(":id")
  @Public()
  @SkipThrottle()
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  async get(@Param("id") id: string): Promise<StreamableFile> {
    const asset = await this.assetsService.findById(id);
    return new StreamableFile(Buffer.from(asset.data), {
      type: asset.mimeType,
      disposition: `inline; filename="${asset.filename.replace(/"/g, "")}"`,
    });
  }
}
