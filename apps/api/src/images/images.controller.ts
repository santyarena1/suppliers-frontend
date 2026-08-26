import { Body, Controller, Delete, Get, Post, Put, Query, UseGuards } from "@nestjs/common";
import type { JwtPayload } from "@nodo/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { SaveSerperKeyDto, StartFirstPhotoDto } from "./dto/image-sync.dto";
import { ImageSyncService } from "./image-sync.service";

/** Sincronización de fotos de catálogo. Solo superadmin. */
@UseGuards(RolesGuard)
@Roles("ROLE_ADMIN")
@Controller("admin/images")
export class ImagesController {
  constructor(private readonly images: ImageSyncService) {}

  @Get("status")
  status() {
    return this.images.status();
  }

  @Get("missing")
  missing(@Query("take") take?: string, @Query("provider") provider?: string) {
    const n = take ? Number(take) : 20;
    return this.images.listMissing(Number.isFinite(n) ? n : 20, provider);
  }

  @Put("serper")
  saveSerper(@Body() dto: SaveSerperKeyDto) {
    return this.images.saveSerperKey(dto.apiKey);
  }

  @Delete("serper")
  clearSerper() {
    return this.images.clearSerperKey();
  }

  @Post("first-photo")
  firstPhoto(@Body() dto: StartFirstPhotoDto, @CurrentUser() me: JwtPayload) {
    return this.images.requestFirstPhoto({
      provider: dto.provider,
      batchSize: dto.batchSize,
      once: dto.once,
      startedById: me.userId,
    });
  }

  @Post("first-photo/stop")
  stop() {
    return this.images.requestStop();
  }
}
