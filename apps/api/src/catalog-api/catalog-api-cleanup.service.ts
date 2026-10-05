import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { CRON_TZ, cronsAreGloballyEnabled } from "../common/cron-window";
import { PrismaService } from "../prisma/prisma.service";
import { CHANGES_RETENTION_DAYS } from "./changes/changes-feed.service";

const DAY_MS = 86_400_000;
const DELIVERIES_RETENTION_DAYS = 30;
const USAGE_RETENTION_DAYS = 395;

/**
 * Limpieza diaria (04:30 AR): cambios y entregas de webhooks de más de 30 días,
 * uso por día de más de 13 meses. Corre en el horario sin crons de sync a
 * propósito: no compite con nada.
 */
@Injectable()
export class CatalogApiCleanupService {
  private readonly logger = new Logger(CatalogApiCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron("30 4 * * *", { timeZone: CRON_TZ })
  async run(now = new Date()) {
    if (!cronsAreGloballyEnabled()) return;
    const [events, deliveries, usage] = await Promise.all([
      this.prisma.apiCatalogEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - CHANGES_RETENTION_DAYS * DAY_MS) } } }),
      this.prisma.apiWebhookDelivery.deleteMany({
        where: { createdAt: { lt: new Date(now.getTime() - DELIVERIES_RETENTION_DAYS * DAY_MS) }, status: { not: "PENDING" } },
      }),
      this.prisma.apiUsageDaily.deleteMany({ where: { day: { lt: new Date(now.getTime() - USAGE_RETENTION_DAYS * DAY_MS) } } }),
    ]);
    this.logger.log(`Limpieza API de catálogo: ${events.count} cambios, ${deliveries.count} entregas, ${usage.count} días de uso`);
  }
}
