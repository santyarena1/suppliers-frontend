import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { ImageSyncService } from "./image-sync.service";

const TZ = "America/Argentina/Buenos_Aires";

@Injectable()
export class ImageSyncSchedulerService {
  private readonly logger = new Logger(ImageSyncSchedulerService.name);

  constructor(
    private readonly images: ImageSyncService,
    private readonly config: ConfigService
  ) {}

  /** 8:00 y 20:00 Argentina: hasta 200 faltantes (primero catálogo con stock). */
  @Cron("0 8,20 * * *", { timeZone: TZ })
  async tick() {
    if (this.config.get("IMAGE_SYNC_CRON_DISABLED") === "true") return;
    if (this.images.isRunning()) {
      this.logger.debug("Cron imágenes: ya hay una corrida en curso, se salta");
      return;
    }
    if (!(await this.images.hasSerperKey())) return;
    if (!(await this.images.isCronEnabled())) return;

    const limit = Math.max(1, Number(this.config.get("IMAGE_SYNC_CRON_LIMIT") ?? this.images.cronLimit()));
    const result = this.images.requestFirstPhoto({
      batchSize: 50,
      maxItems: limit,
      source: "cron",
    });
    if (!result.started) {
      this.logger.debug(`Cron imágenes: no arrancó (${result.reason ?? "unknown"})`);
      return;
    }
    this.logger.log(`Cron imágenes: Primera foto iniciada (tope ${limit})`);
  }
}
