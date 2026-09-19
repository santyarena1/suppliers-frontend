import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { Provider } from "@nodo/shared";
import { shouldRunScheduledJob } from "../common/cron-window";
import { ProvidersService } from "./providers.service";

/** Cada 30 minutos (06:00–23:00 AR): sincroniza los proveedores habilitados
 * cuyo intervalo ya venció. De noche y en staging no corre. */
@Injectable()
export class SyncSchedulerService {
  private readonly logger = new Logger(SyncSchedulerService.name);
  private running = false;

  constructor(private readonly providersService: ProvidersService) {}

  @Cron("*/30 * * * *")
  async handleCron() {
    if (!shouldRunScheduledJob()) return;
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.providersService.findDueConfigs();
      for (const config of due) {
        try {
          const result = await this.providersService.sync(config.tenantId, config.provider as Provider, {
            source: "cron",
          });
          this.logger.log(
            `Auto-sync ${config.provider}: ${result.synced} productos (creados: ${result.created}, actualizados: ${result.updated})`
          );
        } catch (err) {
          this.logger.warn(
            `Auto-sync ${config.provider} falló: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
