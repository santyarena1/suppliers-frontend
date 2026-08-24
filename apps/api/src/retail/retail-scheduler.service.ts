import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { RetailIngestService } from "./retail-ingest.service";

const TZ = "America/Argentina/Buenos_Aires";

@Injectable()
export class RetailSchedulerService {
  private readonly logger = new Logger(RetailSchedulerService.name);

  constructor(
    private readonly ingest: RetailIngestService,
    private readonly config: ConfigService
  ) {}

  /**
   * Día (06:00–20:55 AR): cada 5 minutos, batch de tiendas más viejas.
   * Así los precios se mueven seguido sin intentar un full sync imposible en 5 min.
   */
  @Cron("*/5 6-20 * * *", { timeZone: TZ })
  async handleDaytime() {
    await this.tick("day");
  }

  /**
   * Noche (21–05 AR): cada hora, un batch más grande (menos carga / menos urgencia).
   */
  @Cron("0 21-23,0-5 * * *", { timeZone: TZ })
  async handleNight() {
    await this.tick("night");
  }

  private async tick(slot: "day" | "night") {
    if (this.config.get("RETAIL_INGEST_DISABLED") === "true") return;
    if (this.ingest.isRunning()) {
      this.logger.debug(`Cron retail ${slot}: ya hay ingesta en curso, se salta`);
      return;
    }

    const dayBatch = Math.max(1, Number(this.config.get("RETAIL_INGEST_DAY_BATCH") ?? 8));
    const nightBatch = Math.max(1, Number(this.config.get("RETAIL_INGEST_NIGHT_BATCH") ?? 20));
    const maxStores = slot === "day" ? dayBatch : nightBatch;

    try {
      const result = await this.ingest.runBatchIngest(maxStores);
      this.logger.log(
        `Cron retail ${slot}: ${result.storesDone} tiendas / ${result.productsUpserted} productos (run ${result.runId})`
      );
    } catch (err) {
      this.logger.warn(
        `Cron retail ${slot} falló: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
