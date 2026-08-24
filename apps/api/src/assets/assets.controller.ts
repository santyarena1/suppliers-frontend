import { BadRequestException, Controller, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AssetsService } from "./assets.service";

@Controller("assets")
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  /** Sube una imagen y devuelve el path `/uploads/...` para guardar en DB. */
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
}
