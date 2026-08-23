import { BadRequestException, Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { CatalogNormalizeService } from "./catalog-normalize.service";
import { normalizeCatalogKey } from "@nodo/shared";
import { IsArray, IsOptional, IsString, IsUrl, MinLength } from "class-validator";

class MergeBrandsDto {
  @IsArray()
  @IsString({ each: true })
  sourceIds!: string[];

  @IsString()
  targetId!: string;
}

class BrandAliasDto {
  @IsString()
  provider!: string;

  @IsString()
  @MinLength(1)
  rawBrand!: string;

  @IsString()
  canonicalBrandId!: string;
}

class UpdateCanonicalBrandDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  displayName?: string;

  @IsOptional()
  @IsUrl({}, { message: "logoUrl debe ser una URL válida" })
  logoUrl?: string;
}

@UseGuards(RolesGuard)
@Roles("ROLE_ADMIN")
@Controller("admin/catalog")
export class CatalogAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly normalize: CatalogNormalizeService
  ) {}

  @Get("brands")
  async listBrands() {
    const brands = await this.prisma.canonicalBrand.findMany({
      orderBy: { displayName: "asc" },
      include: {
        aliases: { select: { id: true, provider: true, rawBrand: true } },
        _count: { select: { products: true, aliases: true } },
      },
    });
    return brands.map((b) => ({
      id: b.id,
      displayName: b.displayName,
      slug: b.slug,
      logoUrl: b.logoUrl,
      productCount: b._count.products,
      aliasCount: b._count.aliases,
      aliases: b.aliases,
    }));
  }

  /** Marcas canónicas distintas que comparten la misma clave normalizada (posibles duplicados). */
  @Get("brands/duplicates")
  async brandDuplicates() {
    const rows = await this.prisma.$queryRaw<
      { normalizedKey: string; canonicalIds: string[]; displayNames: string[]; count: bigint }[]
    >`
      SELECT
        ba."normalizedKey" AS "normalizedKey",
        ARRAY_AGG(DISTINCT ba."canonicalBrandId") AS "canonicalIds",
        ARRAY_AGG(DISTINCT cb."displayName") AS "displayNames",
        COUNT(DISTINCT ba."canonicalBrandId") AS count
      FROM "BrandAlias" ba
      JOIN "CanonicalBrand" cb ON cb.id = ba."canonicalBrandId"
      GROUP BY ba."normalizedKey"
      HAVING COUNT(DISTINCT ba."canonicalBrandId") > 1
      ORDER BY count DESC
      LIMIT 100
    `;
    return rows.map((r) => ({
      normalizedKey: r.normalizedKey,
      canonicalIds: r.canonicalIds,
      displayNames: r.displayNames,
      count: Number(r.count),
    }));
  }

  @Post("brands/merge")
  async mergeBrands(@Body() dto: MergeBrandsDto) {
    const target = await this.prisma.canonicalBrand.findUnique({ where: { id: dto.targetId } });
    if (!target) throw new BadRequestException("Marca destino no encontrada");

    for (const sourceId of dto.sourceIds) {
      if (sourceId === dto.targetId) continue;
      await this.prisma.brandAlias.updateMany({
        where: { canonicalBrandId: sourceId },
        data: { canonicalBrandId: dto.targetId },
      });
      await this.prisma.providerSyncCache.updateMany({
        where: { canonicalBrandId: sourceId },
        data: { canonicalBrandId: dto.targetId },
      });
      await this.prisma.canonicalBrand.delete({ where: { id: sourceId } });
    }
    return { ok: true, targetId: dto.targetId };
  }

  @Post("brands/aliases")
  async addBrandAlias(@Body() dto: BrandAliasDto) {
    const normalizedKey = normalizeCatalogKey(dto.rawBrand);
    await this.prisma.brandAlias.upsert({
      where: { provider_rawBrand: { provider: dto.provider, rawBrand: dto.rawBrand } },
      create: {
        provider: dto.provider,
        rawBrand: dto.rawBrand,
        normalizedKey,
        canonicalBrandId: dto.canonicalBrandId,
      },
      update: { normalizedKey, canonicalBrandId: dto.canonicalBrandId },
    });
    await this.prisma.providerSyncCache.updateMany({
      where: { provider: dto.provider, brand: dto.rawBrand },
      data: { canonicalBrandId: dto.canonicalBrandId },
    });
    return { ok: true };
  }

  @Put("brands/:id")
  async updateBrand(@Param("id") id: string, @Body() dto: UpdateCanonicalBrandDto) {
    return this.prisma.canonicalBrand.update({
      where: { id },
      data: {
        displayName: dto.displayName,
        logoUrl: dto.logoUrl,
      },
    });
  }

  @Post("reindex")
  async reindex() {
    return this.normalize.reindexAll();
  }
}
