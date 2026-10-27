import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { CRON_TZ, shouldRunScheduledJob } from "../common/cron-window";
import { PlatformContentService } from "./platform-content.service";

/**
 * Fichas de AcuStock al día sin que nadie tenga que importarlas: una corrida
 * completa por día (cruza con el catálogo entero, así que no puede ser parcial).
 * Si otra réplica ya la está corriendo, `start` lo rechaza y esta se saltea.
 */
@Injectable()
export class PlatformContentSchedulerService {
  private readonly logger = new Logger(PlatformContentSchedulerService.name);

  constructor(
    private readonly content: PlatformContentService,
    private readonly config: ConfigService
  ) {}

  /** 6:30 Argentina, apenas abre la ventana de crons: el armador arranca el día con lo último. */
  @Cron("30 6 * * *", { timeZone: CRON_TZ })
  async tick() {
    if (!shouldRunScheduledJob()) return;
    if (this.config.get("PLATFORM_CONTENT_CRON_DISABLED") === "true") return;
    if (!this.content.isConfigured()) return;
    try {
      const { runId } = await this.content.start("APPLY");
      this.logger.log(`Importación diaria de fichas de AcuStock iniciada (${runId})`);
    } catch (err) {
      this.logger.debug(`Importación diaria de fichas: no arrancó (${(err as Error).message})`);
    }
  }
}
