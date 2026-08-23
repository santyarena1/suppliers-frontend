import { Injectable } from "@nestjs/common";
import { catalogDisplayName, normalizeCatalogKey, slugifyCatalog } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CatalogNormalizeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveBrand(provider: string, rawBrand: string | null | undefined): Promise<string | null> {
    const raw = rawBrand?.trim();
    if (!raw) return null;

    const normalizedKey = normalizeCatalogKey(raw);
    const existingAlias = await this.prisma.brandAlias.findUnique({
      where: { provider_rawBrand: { provider, rawBrand: raw } },
    });
    if (existingAlias) return existingAlias.canonicalBrandId;

    const keyMatch = await this.prisma.brandAlias.findFirst({
      where: { normalizedKey },
      select: { canonicalBrandId: true },
    });

    let canonicalId = keyMatch?.canonicalBrandId;
    if (!canonicalId) {
      const slug = slugifyCatalog(raw);
      const bySlug = await this.prisma.canonicalBrand.findUnique({ where: { slug } });
      canonicalId = bySlug?.id;
      if (!canonicalId) {
        const created = await this.prisma.canonicalBrand.create({
          data: { displayName: catalogDisplayName(raw), slug },
        });
        canonicalId = created.id;
      }
    }

    await this.prisma.brandAlias.upsert({
      where: { provider_rawBrand: { provider, rawBrand: raw } },
      create: {
        provider,
        rawBrand: raw,
        normalizedKey,
        canonicalBrandId: canonicalId,
      },
      update: { normalizedKey, canonicalBrandId: canonicalId },
    });

    return canonicalId;
  }

  async resolveCategory(provider: string, rawCategory: string | null | undefined): Promise<string | null> {
    const raw = rawCategory?.trim();
    if (!raw) return null;

    const normalizedKey = normalizeCatalogKey(raw);
    const existingAlias = await this.prisma.categoryAlias.findUnique({
      where: { provider_rawCategory: { provider, rawCategory: raw } },
    });
    if (existingAlias) return existingAlias.canonicalCategoryId;

    const keyMatch = await this.prisma.categoryAlias.findFirst({
      where: { normalizedKey },
      select: { canonicalCategoryId: true },
    });

    let canonicalId = keyMatch?.canonicalCategoryId;
    if (!canonicalId) {
      const slug = slugifyCatalog(raw);
      const bySlug = await this.prisma.canonicalCategory.findUnique({ where: { slug } });
      canonicalId = bySlug?.id;
      if (!canonicalId) {
        const created = await this.prisma.canonicalCategory.create({
          data: { displayName: catalogDisplayName(raw), slug },
        });
        canonicalId = created.id;
      }
    }

    await this.prisma.categoryAlias.upsert({
      where: { provider_rawCategory: { provider, rawCategory: raw } },
      create: {
        provider,
        rawCategory: raw,
        normalizedKey,
        canonicalCategoryId: canonicalId,
      },
      update: { normalizedKey, canonicalCategoryId: canonicalId },
    });

    return canonicalId;
  }

  /** Reindexa marcas/categorías canónicas para todas las fichas existentes. */
  async reindexAll(): Promise<{ products: number }> {
    const products = await this.prisma.providerSyncCache.findMany({
      select: { provider: true, externalId: true, brand: true, category: true },
    });
    let updated = 0;
    for (const p of products) {
      const canonicalBrandId = await this.resolveBrand(p.provider, p.brand);
      const canonicalCategoryId = await this.resolveCategory(p.provider, p.category);
      await this.prisma.providerSyncCache.update({
        where: { provider_externalId: { provider: p.provider, externalId: p.externalId } },
        data: { canonicalBrandId, canonicalCategoryId },
      });
      updated += 1;
    }
    return { products: updated };
  }
}
