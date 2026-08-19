import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Provider } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialsService } from "../credentials/credentials.service";
import { ProviderRegistry } from "./provider-registry";
import type { NormalizedProduct } from "./types";

@Injectable()
export class ProvidersService {
  private readonly logger = new Logger(ProvidersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly registry: ProviderRegistry
  ) {}

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

    let count = 0;
    await adapter.syncAll(credentials, async (items) => {
      count += items.length;
      await this.upsertPage(provider, items);
    });

    this.logger.log(`Sync de ${provider}: ${count} productos`);
    return { provider, synced: count };
  }

  private async upsertPage(provider: Provider, items: NormalizedProduct[]) {
    await Promise.all(
      items.map((item) =>
        this.prisma.providerSyncCache.upsert({
          where: { provider_externalId: { provider, externalId: item.externalId } },
          create: {
            provider,
            externalId: item.externalId,
            sku: item.sku,
            partNumber: item.partNumber,
            ean: item.ean,
            name: item.name,
            brand: item.brand,
            category: item.category,
            subcategory: item.subcategory,
            description: item.description,
            price: item.price,
            currency: item.currency,
            stock: item.stock,
            imageUrl: item.imageUrl,
            locationAir: item.locationAir,
            raw: item.raw as object,
          },
          update: {
            sku: item.sku,
            partNumber: item.partNumber,
            ean: item.ean,
            name: item.name,
            brand: item.brand,
            category: item.category,
            subcategory: item.subcategory,
            description: item.description,
            price: item.price,
            currency: item.currency,
            stock: item.stock,
            imageUrl: item.imageUrl,
            locationAir: item.locationAir,
            raw: item.raw as object,
            syncedAt: new Date(),
          },
        })
      )
    );
  }

  async search(provider: Provider, name: string) {
    return this.prisma.providerSyncCache.findMany({
      where: {
        provider,
        name: { contains: name, mode: "insensitive" },
      },
      orderBy: { name: "asc" },
      take: 200,
    });
  }
}
