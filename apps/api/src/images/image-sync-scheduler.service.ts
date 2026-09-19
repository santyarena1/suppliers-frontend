import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { CRON_TZ, shouldRunScheduledJob } from "../common/cron-window";
import { ImageSyncService } from "./image-sync.service";

@Injectable()
export class ImageSyncSchedulerService {
  private readonly logger = new Logger(ImageSyncSchedulerService.name);

  constructor(
    private readonly images: ImageSyncService,
    private readonly config: ConfigService
  ) {}

  /** 8:00 y 20:00 Argentina (dentro de 06–23). Staging / noche no corre. */
  @Cron("0 8,20 * * *", { timeZone: CRON_TZ })
  async tick() {
    if (!shouldRunScheduledJob()) return;
    if (this.config.get("IMAGE_SYNC_CRON_DISABLED") === "true") return;
    if (this.images.isRunning()) {
      this.logger.debug("Cron imágenes: ya hay una corrida en curso, se salta");
      return;
    }
    if (!(await this.images.hasSerperKey())) return;
    if (!(await this.images.isCronEnabled())) return;

    if (await this.images.disableCronIfNoPending()) {
      this.logger.log("Cron imágenes: nada pendiente, cron apagado");
      return;
    }

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
