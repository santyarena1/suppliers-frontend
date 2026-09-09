import { Injectable, Logger } from "@nestjs/common";
import { Cron, Timeout } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { RetailIngestService } from "./retail-ingest.service";
import { isRetailDaytime } from "./retail-time";

@Injectable()
export class RetailSchedulerService {
  private readonly logger = new Logger(RetailSchedulerService.name);
  /** Una sola pasada de la segunda fuente por vez: es lenta por el rate limit. */
  private hgRunning = false;

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
  /**
   * Segunda fuente, en su propio ciclo. Va cada 6 horas y no cada 5 minutos
   * porque el sitio limita a 12 pedidos por minuto: una pasada completa tarda
   * varios minutos y no tiene sentido repetirla seguido.
   */
  @Cron("17 */6 * * *")
  async handleHardgamersCron() {
    if (this.config.get("RETAIL_INGEST_DISABLED") === "true") return;
    if (this.config.get("RETAIL_HG_DISABLED") === "true") return;
    if (this.hgRunning) {
      this.logger.debug("Cron HardGamers: ya hay una pasada en curso, se salta");
      return;
    }
    this.hgRunning = true;
    try {
      const r = await this.ingest.ingestHardgamersStores();
      this.logger.log(
        "Cron HardGamers: " +
          r.stores +
          " locales / " +
          r.products +
          " productos" +
          (r.skipped.length ? " (sin datos: " + r.skipped.join(", ") + ")" : "")
      );
    } catch (err) {
      this.logger.warn(
        "Cron HardGamers falló: " + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      this.hgRunning = false;
    }
  }
}
