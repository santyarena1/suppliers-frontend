import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Provider } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialsService } from "../credentials/credentials.service";
import { ProviderRegistry } from "./provider-registry";
import type { NormalizedProduct } from "./types";
import { UpdateProviderConfigDto } from "./dto/update-config.dto";

@Injectable()
export class ProvidersService {
  private readonly logger = new Logger(ProvidersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly registry: ProviderRegistry
  ) {}

  async getConfig(userId: string, provider: Provider) {
    const config = await this.prisma.providerSyncConfig.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    return config ?? this.defaultConfig(userId, provider);
  }

  private defaultConfig(userId: string, provider: Provider) {
    return {
      id: null,
      userId,
      provider,
      enabled: false,
      syncIntervalMinutes: 60,
      missingProductAction: "KEEP" as const,
      zeroStockAction: "KEEP" as const,
      priceMarkupPercent: 0,
      minStockThreshold: 0,
      lastSyncedAt: null,
      lastSyncError: null,
      lastSyncCreated: 0,
      lastSyncUpdated: 0,
    };
  }

  async updateConfig(userId: string, provider: Provider, dto: UpdateProviderConfigDto) {
    return this.prisma.providerSyncConfig.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, ...dto },
      update: { ...dto },
    });
  }

  async sync(userId: string, provider: Provider) {
    const adapter = this.registry.get(provider);
    if (!adapter) {
      throw new BadRequestException(
        `Todavía no hay integración real para ${provider}. Implementados: ${this.registry.implemented.join(", ")}`
      );
    }

    const stored = await this.credentials.getByProvider(userId, provider).catch(() => null);
    if (!stored) throw new NotFoundException(`No hay credenciales guardadas para ${provider}`);

    const credentials = JSON.parse(stored.credentialsJson) as Record<string, string>;
    const config = await this.getConfig(userId, provider);
    const markup = Number(config.priceMarkupPercent) || 0;
    const minStock = config.minStockThreshold || 0;

    const totalBefore = await this.prisma.providerSyncCache.count({ where: { provider } });

    const syncStartedAt = new Date();
    let count = 0;

    try {
      await adapter.syncAll(credentials, async (items) => {
        count += items.length;
        await this.upsertPage(provider, items, markup, minStock);
      });
    } catch (err) {
      await this.prisma.providerSyncConfig.upsert({
        where: { userId_provider: { userId, provider } },
        create: { userId, provider, lastSyncError: errorMessage(err) },
        update: { lastSyncError: errorMessage(err) },
      });
      throw err;
    }

    const missingCount = await this.applyMissingProductAction(provider, syncStartedAt, config.missingProductAction);
    const zeroStockCount = await this.applyZeroStockAction(provider, syncStartedAt, config.zeroStockAction);

    const totalAfter = await this.prisma.providerSyncCache.count({ where: { provider } });
    const created = Math.max(0, totalAfter - totalBefore);
    const updated = Math.max(0, count - created);

    await this.prisma.providerSyncConfig.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, lastSyncedAt: new Date(), lastSyncError: null, lastSyncCreated: created, lastSyncUpdated: updated },
      update: { lastSyncedAt: new Date(), lastSyncError: null, lastSyncCreated: created, lastSyncUpdated: updated },
    });

    this.logger.log(
      `Sync de ${provider}: ${count} productos (creados: ${created}, actualizados: ${updated}, ` +
        `faltantes afectados: ${missingCount}, stock cero afectados: ${zeroStockCount})`
    );
    return { provider, synced: count, created, updated, missingAffected: missingCount, zeroStockAffected: zeroStockCount };
  }

  /** Productos que existían en nuestra base para este proveedor pero no vinieron en la última sync. */
  private async applyMissingProductAction(provider: Provider, syncStartedAt: Date, action: string) {
    if (action === "KEEP") return 0;
    const where = { provider, syncedAt: { lt: syncStartedAt } };
    if (action === "DELETE") {
      const res = await this.prisma.providerSyncCache.deleteMany({ where });
      return res.count;
    }
    if (action === "HIDE") {
      const res = await this.prisma.providerSyncCache.updateMany({ where, data: { active: false } });
      return res.count;
    }
    if (action === "OUT_OF_STOCK") {
      const res = await this.prisma.providerSyncCache.updateMany({ where, data: { stock: 0 } });
      return res.count;
    }
    return 0;
  }

  /** Productos que sí vinieron en esta sync pero quedaron con stock 0 (o por debajo del umbral mínimo). */
  private async applyZeroStockAction(provider: Provider, syncStartedAt: Date, action: string) {
    if (action === "KEEP") return 0;
    const where = { provider, syncedAt: { gte: syncStartedAt }, stock: { lte: 0 } };
    if (action === "DELETE") {
      const res = await this.prisma.providerSyncCache.deleteMany({ where });
      return res.count;
    }
    if (action === "HIDE") {
      const res = await this.prisma.providerSyncCache.updateMany({ where, data: { active: false } });
      return res.count;
    }
    return 0;
  }

  private async upsertPage(provider: Provider, items: NormalizedProduct[], markupPercent: number, minStock: number) {
    await Promise.all(
      items.map((item) => {
        // Stock mínimo del proveedor: si informa esta cantidad o menos, lo
        // tratamos como sin stock (mismo concepto que AcuStock).
        const stock =
          minStock > 0 && item.stock != null && item.stock <= minStock ? 0 : item.stock;

        const fields = {
          sku: item.sku,
          partNumber: item.partNumber,
          ean: item.ean,
          name: item.name,
          brand: item.brand,
          category: item.category,
          subcategory: item.subcategory,
          description: item.description,
          longDescription: item.longDescription,
          price: applyMarkup(item.price, markupPercent),
          finalPrice: item.finalPrice,
          currency: item.currency,
          ivaPercent: item.ivaPercent,
          stock,
          stockStatus: item.stockStatus,
          imageUrl: item.imageUrl,
          productUrl: item.productUrl,
          locationAir: item.locationAir,
          warranty: item.warranty,
          weight: item.weight,
          weightUnit: item.weightUnit,
          height: item.height,
          width: item.width,
          length: item.length,
          dimensionsUnit: item.dimensionsUnit,
          volume: item.volume,
          tags: item.tags,
          active: true,
          raw: item.raw as object,
        };
        return this.prisma.providerSyncCache.upsert({
          where: { provider_externalId: { provider, externalId: item.externalId } },
          create: { provider, externalId: item.externalId, ...fields },
          update: { ...fields, syncedAt: new Date() },
        });
      })
    );
  }

  async status(userId: string, provider: Provider) {
    const [hasCredentials, total, withStock, last] = await Promise.all([
      this.credentials.getByProvider(userId, provider).then(
        () => true,
        () => false
      ),
      this.prisma.providerSyncCache.count({ where: { provider, active: true } }),
      this.prisma.providerSyncCache.count({ where: { provider, active: true, stock: { gt: 0 } } }),
      this.prisma.providerSyncCache.findFirst({
        where: { provider },
        orderBy: { syncedAt: "desc" },
        select: { syncedAt: true },
      }),
    ]);

    return {
      provider,
      implemented: Boolean(this.registry.get(provider)),
      hasCredentials,
      total,
      withStock,
      lastSyncedAt: last?.syncedAt ?? null,
    };
  }

  async search(provider: Provider, name: string) {
    return this.prisma.providerSyncCache.findMany({
      where: {
        provider,
        active: true,
        name: { contains: name, mode: "insensitive" },
      },
      orderBy: { name: "asc" },
      take: 200,
    });
  }

  /** "Limpiar sin stock del proveedor" — borra ya mismo los productos con stock 0, sin esperar a la próxima sync. */
  async clearZeroStock(provider: Provider) {
    const res = await this.prisma.providerSyncCache.deleteMany({ where: { provider, stock: { lte: 0 } } });
    return { provider, deleted: res.count };
  }

  /** "Eliminar todos los productos de {proveedor}" — zona de peligro, borra el catálogo completo de nuestra base. */
  async deleteAllProducts(provider: Provider) {
    const res = await this.prisma.providerSyncCache.deleteMany({ where: { provider } });
    return { provider, deleted: res.count };
  }

  /** Usado por el cron de sincronización automática. */
  async findDueConfigs() {
    const configs = await this.prisma.providerSyncConfig.findMany({ where: { enabled: true } });
    const now = Date.now();
    return configs.filter((c) => {
      if (!c.lastSyncedAt) return true;
      const dueAt = c.lastSyncedAt.getTime() + c.syncIntervalMinutes * 60_000;
      return now >= dueAt;
    });
  }
}

function applyMarkup(price: number | undefined, markupPercent: number): number | undefined {
  if (price == null || !markupPercent) return price;
  return Math.round(price * (1 + markupPercent / 100) * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
}
