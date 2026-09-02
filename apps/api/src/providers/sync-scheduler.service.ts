import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { Provider } from "@nodo/shared";
import { ProvidersService } from "./providers.service";

/** Corre cada 5 minutos, sincroniza los proveedores que cada organización dejó
 * habilitados y cuyo intervalo configurado ya venció. Reemplaza tener que
 * apretar "Sincronizar ahora" a mano. */
@Injectable()
export class SyncSchedulerService {
  private readonly logger = new Logger(SyncSchedulerService.name);
  private running = false;

  constructor(private readonly providersService: ProvidersService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
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
