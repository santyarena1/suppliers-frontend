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
   * Misma cadencia que el resto de los locales: cada 5 minutos. Lo que cambia
   * es que el lote se mide en paginas, porque el limite de esta fuente es de
   * pedidos por minuto. Con el presupuesto por defecto una vuelta completa de
   * todos los locales toma unos diez minutos.
   */
  @Cron("*/5 * * * *")
  async handleHardgamersCron() {
    if (this.config.get("RETAIL_INGEST_DISABLED") === "true") return;
    if (this.config.get("RETAIL_HG_DISABLED") === "true") return;
    if (this.hgRunning) {
      this.logger.debug("Cron HardGamers: ya hay una pasada en curso, se salta");
      return;
    }
    this.hgRunning = true;
    try {
      // Compra Gamer es una sola peticion: va primero y no compite por el
      // presupuesto de paginas de HardGamers.
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
