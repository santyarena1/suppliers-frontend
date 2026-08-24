import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { RetailIngestService } from "./retail-ingest.service";

@Injectable()
export class RetailSchedulerService {
  private readonly logger = new Logger(RetailSchedulerService.name);

  constructor(
    private readonly ingest: RetailIngestService,
    private readonly config: ConfigService
  ) {}

  /** Por defecto cada 6 horas. Override con RETAIL_INGEST_CRON (expr. cron de 5/6 campos). */
  @Cron(process.env.RETAIL_INGEST_CRON || "0 */6 * * *")
  async handleCron() {
    if (this.config.get("RETAIL_INGEST_DISABLED") === "true") {
      return;
    }
    if (this.ingest.isRunning()) return;
    try {
      const result = await this.ingest.runFullIngest();
      this.logger.log(`Cron retail: ${result.productsUpserted} productos (run ${result.runId})`);
    } catch (err) {
      this.logger.warn(`Cron retail falló: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
