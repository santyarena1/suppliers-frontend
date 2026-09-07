import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { isListProviderKey, LIST_PROVIDER_PREFIX } from "@nodo/shared";
import { domainEvents } from "../common/events/domain-events";
import { PrismaService } from "../prisma/prisma.service";
import { ProvidersService } from "../providers/providers.service";
import { ListImportService } from "./list-import.service";

const NOTIFY_DEDUP_MS = 24 * 60 * 60 * 1000;

/**
 * Lo que pasa solo alrededor de las listas: rescatar cargas colgadas, avisar
 * listas vencidas y materializar la lista base cuando alguien se vincula.
 */
@Injectable()
export class ListImportSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ListImportSchedulerService.name);
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly imports: ListImportService,
    private readonly providers: ProvidersService
  ) {}

  onModuleInit() {
    this.unsubscribe = domainEvents.on("tenant.linked", ({ clientTenantId, provider }) => {
      if (!provider || !isListProviderKey(provider)) return;
      this.providers
        .materializeBaseOffers(clientTenantId, provider)
        .catch((err) => this.logger.warn(`Materializar ${provider} para ${clientTenantId} falló: ${msg(err)}`));
    });
  }

  onModuleDestroy() {
    this.unsubscribe?.();
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async rescueStuckImports() {
    try {
      const count = await this.imports.failStuckImports();
      if (count) this.logger.warn(`${count} carga(s) colgadas marcadas como fallidas`);
    } catch (err) {
      this.logger.warn(`Rescate de cargas falló: ${msg(err)}`);
    }
  }

  /** Vínculos creados mientras el proceso estaba caído: se reconcilian cada tanto. */
  @Cron(CronExpression.EVERY_HOUR)
  async reconcileMaterialization() {
    try {
      const providers = await this.prisma.supplierBaseOffer.groupBy({ by: ["provider"], _count: { _all: true } });
      for (const row of providers) {
        const supplier = await this.prisma.tenant.findUnique({ where: { providerKey: row.provider }, select: { id: true } });
        if (!supplier) continue;
        const links = await this.prisma.tenantLink.findMany({
          where: { supplierTenantId: supplier.id, status: { in: ["ACTIVE", "LIST_CONNECTED"] }, clientTenant: { active: true } },
          select: { clientTenantId: true },
        });
        for (const link of links) {
          const have = await this.prisma.tenantProductOffer.count({
            where: { tenantId: link.clientTenantId, provider: row.provider, source: { in: ["BASE_LIST", "OWN_LIST"] } },
          });
          if (have < row._count._all) {
            await this.providers.materializeBaseOffers(link.clientTenantId, row.provider);
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Reconciliación de listas base falló: ${msg(err)}`);
    }
  }

  @Cron("0 9 * * *")
  async notifyOverdueLists() {
    try {
      const suppliers = await this.prisma.tenant.findMany({
        where: { providerKey: { startsWith: LIST_PROVIDER_PREFIX }, listUpdateDays: { not: null }, active: true },
        select: { id: true, name: true, providerKey: true },
      });
      for (const supplier of suppliers) {
        const fresh = await this.imports.freshnessFor(supplier.providerKey as string, null);
        if (fresh.status !== "OVERDUE") continue;
        const recent = await this.prisma.orgNotification.findFirst({
          where: { toTenantId: supplier.id, landingKey: `list-overdue:${supplier.providerKey}`, createdAt: { gt: new Date(Date.now() - NOTIFY_DEDUP_MS) } },
          select: { id: true },
        });
        if (recent) continue;
        const uploaders = await this.prisma.supplierListImport.findMany({
          where: { provider: supplier.providerKey as string, status: "APPLIED" },
          orderBy: { appliedAt: "desc" },
          take: 3,
          select: { tenantId: true },
        });
        const toTenantIds = [...new Set([supplier.id, ...uploaders.map((u) => u.tenantId)])];
        await this.prisma.orgNotification.createMany({
          data: toTenantIds.map((toTenantId) => ({
            toTenantId,
            fromTenantId: null,
            kind: "SYSTEM" as const,
            title: `La lista de ${supplier.name} está vencida`,
            body: `Se esperaba una lista nueva cada ${fresh.listUpdateDays} días. Última carga: ${fresh.lastImportAt?.toLocaleDateString("es-AR") ?? "nunca"}.`,
            landingKey: `list-overdue:${supplier.providerKey}`,
          })),
        });
      }
    } catch (err) {
      this.logger.warn(`Aviso de listas vencidas falló: ${msg(err)}`);
    }
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
