import { Injectable, Logger } from "@nestjs/common";
import { Cron, Timeout } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { RetailIngestService } from "./retail-ingest.service";
import { isRetailDaytime } from "./retail-time";

@Injectable()
export class RetailSchedulerService {
  private readonly logger = new Logger(RetailSchedulerService.name);

  constructor(
    private readonly ingest: RetailIngestService,
    private readonly config: ConfigService
  ) {}

  /** Cada 5 minutos, las 24 h. Si el proceso se durmió, el Timeout de boot cubre el hueco. */
  @Cron("*/5 * * * *")
  async handleCron() {
    await this.tick("cron");
  }

  /** Al levantar o despertar el API: no esperar al próximo ciclo de 5 minutos. */
  @Timeout(10_000)
  async handleBoot() {
    await this.tick("boot");
  }

  private async tick(source: "cron" | "boot") {
    if (this.config.get("RETAIL_INGEST_DISABLED") === "true") return;

    const recovered = await this.ingest.recoverStaleLock();
    if (recovered) {
      this.logger.warn(`Cron retail ${source}: se liberó una ingesta colgada`);
    }
    if (this.ingest.isRunning()) {
      this.logger.debug(`Cron retail ${source}: ya hay ingesta en curso, se salta`);
      return;
    }

    const dayBatch = Math.max(1, Number(this.config.get("RETAIL_INGEST_DAY_BATCH") ?? 8));
    const nightBatch = Math.max(1, Number(this.config.get("RETAIL_INGEST_NIGHT_BATCH") ?? 20));
    const maxStores = isRetailDaytime() ? dayBatch : nightBatch;

    try {
      const result = await this.ingest.runBatchIngest(maxStores);
      this.logger.log(
        `Cron retail ${source}: ${result.storesDone} tiendas / ${result.productsUpserted} productos (run ${result.runId})`
      );
    } catch (err) {
      this.logger.warn(
        `Cron retail ${source} falló: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
