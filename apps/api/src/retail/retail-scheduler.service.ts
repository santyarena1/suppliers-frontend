import { Injectable, Logger } from "@nestjs/common";
import { Cron, Timeout } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { shouldRunScheduledJob } from "../common/cron-window";
import { RetailIngestService } from "./retail-ingest.service";

@Injectable()
export class RetailSchedulerService {
  private readonly logger = new Logger(RetailSchedulerService.name);
  /** Una sola pasada de la segunda fuente por vez: es lenta por el rate limit. */
  private hgRunning = false;

  constructor(
    private readonly ingest: RetailIngestService,
    private readonly config: ConfigService
  ) {}

  /** Cada 15 minutos, 06:00–23:00 AR. De noche no corre. */
  @Cron("*/15 * * * *")
  async handleCron() {
    await this.tick("cron");
  }

  /** Al levantar el API: no esperar al próximo ciclo, salvo de noche o staging. */
  @Timeout(10_000)
  async handleBoot() {
    await this.tick("boot");
  }

  private async tick(source: "cron" | "boot") {
    if (!shouldRunScheduledJob()) return;
    if (this.config.get("RETAIL_INGEST_DISABLED") === "true") return;

    const recovered = await this.ingest.recoverStaleLock();
    if (recovered) {
      this.logger.warn(`Cron retail ${source}: se liberó una ingesta colgada`);
    }
    if (this.ingest.isRunning()) {
      this.logger.debug(`Cron retail ${source}: ya hay ingesta en curso, se salta`);
      return;
    }

    const maxStores = Math.max(1, Number(this.config.get("RETAIL_INGEST_DAY_BATCH") ?? 8));

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
   * Misma cadencia que el resto de los locales: cada 15 minutos de día.
   * El lote se mide en páginas por el límite de pedidos por minuto.
   */
  @Cron("*/15 * * * *")
  async handleHardgamersCron() {
    if (!shouldRunScheduledJob()) return;
    if (this.config.get("RETAIL_INGEST_DISABLED") === "true") return;
    if (this.config.get("RETAIL_HG_DISABLED") === "true") return;
    if (this.hgRunning) {
      this.logger.debug("Cron HardGamers: ya hay una pasada en curso, se salta");
      return;
    }
    this.hgRunning = true;
    try {
      const cg = await this.ingest.ingestCompragamer();
      if (cg) this.logger.log("Cron Compra Gamer: " + cg.productos + " productos");

      const pageBudget = Math.max(4, Number(this.config.get("RETAIL_HG_PAGE_BUDGET") ?? 32));
      const r = await this.ingest.ingestHardgamersStores(undefined, { pageBudget });
      this.logger.log(
        "Cron HardGamers: " +
          r.stores +
          " locales / " +
          r.products +
          " productos / " +
          r.pages +
          " paginas" +
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
