import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import type { JwtPayload } from "@nodo/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import {
  SaveSerperKeyDto,
  SerperSearchDto,
  SetProductImageDto,
  StartFirstPhotoDto,
  UpdateImageCronDto,
} from "./dto/image-sync.dto";
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

  @Get("history")
  history(
    @Query("page") page?: string,
    @Query("take") take?: string,
    @Query("status") status?: string,
    @Query("provider") provider?: string,
    @Query("q") q?: string
  ) {
    const p = page ? Number(page) : 1;
    const t = take ? Number(take) : 30;
    return this.images.listHistory({
      page: Number.isFinite(p) ? p : 1,
      take: Number.isFinite(t) ? t : 30,
      status,
      provider,
      q,
    });
  }

  @Put("serper")
  saveSerper(@Body() dto: SaveSerperKeyDto) {
    return this.images.saveSerperKey(dto.apiKey);
  }

  @Delete("serper")
  clearSerper() {
    return this.images.clearSerperKey();
  }

  @Put("cron")
  setCron(@Body() dto: UpdateImageCronDto) {
    return this.images.setCronEnabled(dto.enabled);
  }

  @Post("first-photo")
  firstPhoto(@Body() dto: StartFirstPhotoDto, @CurrentUser() me: JwtPayload) {
    return this.images.requestFirstPhoto({
      provider: dto.provider,
      batchSize: dto.batchSize,
      once: dto.once,
      startedById: me.userId,
      source: "manual",
    });
  }

  @Post("first-photo/stop")
  stop() {
    return this.images.requestStop();
  }

  @Post("products/:productId/serper-search")
  search(@Param("productId") productId: string, @Body() dto: SerperSearchDto) {
    return this.images.searchProductImages(productId, dto.query);
  }

  @Put("products/:productId/image")
  setImage(@Param("productId") productId: string, @Body() dto: SetProductImageDto) {
    return this.images.setProductImage(productId, dto.imageUrl, dto.source ?? "serper_pick");
  }
}
