import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import type { CatalogAliasKind, CatalogEnrichmentSource, CatalogMatchKind } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { CatalogAiService } from "./catalog-ai.service";
import {
  groupCategoriesByDisplay,
  indexCatalogAliases,
  indexCatalogIdentities,
  looksLikeProviderCode,
  matchingRawCategories,
  matchesDisplayCategory,
  normalizeEan,
  normalizePartNumber,
  suggestAliasMerges,
  suggestIdentityMerges,
  suggestProviderCodeLabels,
  type CatalogEnrichmentContext,
  type RawValueStat,
} from "./catalog-enrichment";

@Injectable()
export class CatalogEnrichmentService implements OnModuleInit {
  private cache: CatalogEnrichmentContext = { aliases: {}, identities: {} };
  private cacheLoadedAt = 0;
  private readonly cacheTtlMs = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: CatalogAiService
  ) {}

  async onModuleInit() {
    await this.refreshCache(true);
  }

  async getContext(force = false): Promise<CatalogEnrichmentContext> {
    if (force || Date.now() - this.cacheLoadedAt > this.cacheTtlMs) {
      await this.refreshCache(true);
    }
    return this.cache;
  }

  async refreshCache(force = false) {
    if (!force && Date.now() - this.cacheLoadedAt <= this.cacheTtlMs) return;
    const [aliasRows, identityRows] = await Promise.all([
      this.prisma.platformCatalogAlias.findMany(),
      this.prisma.platformProductIdentity.findMany(),
    ]);
    this.cache = {
      aliases: indexCatalogAliases(aliasRows),
      identities: indexCatalogIdentities(identityRows),
    };
    this.cacheLoadedAt = Date.now();
  }

  async overview() {
    const [aliasCount, identityCount, productCount, codedCategories] = await Promise.all([
      this.prisma.platformCatalogAlias.count(),
      this.prisma.platformProductIdentity.count(),
      this.prisma.providerSyncCache.count(),
      this.prisma.providerSyncCache.count({
        where: { provider: "AIR", category: { not: null } },
      }),
    ]);

    return {
      aliasCount,
      identityCount,
      productCount,
      airCodedProducts: codedCategories,
      aiConfigured: this.ai.isConfigured,
    };
  }

  async listRawValues(params: {
    kind: CatalogAliasKind;
    provider?: string;
    codesOnly?: boolean;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(params.limit ?? 80, 1), 200);
    const column =
      params.kind === "BRAND" ? "brand" : params.kind === "CATEGORY" ? "category" : "subcategory";

    type Row = { raw_key: string; provider: string; count: bigint };
    const rows = params.provider
      ? await this.prisma.$queryRawUnsafe<Row[]>(
          `SELECT ficha."${column}" AS raw_key, ficha.provider AS provider, COUNT(*)::bigint AS count
           FROM "ProviderSyncCache" ficha
           WHERE ficha."${column}" IS NOT NULL AND ficha.provider = $1
           GROUP BY ficha."${column}", ficha.provider
           ORDER BY count DESC
           LIMIT $2`,
          params.provider,
          limit * 2
        )
      : await this.prisma.$queryRawUnsafe<Row[]>(
          `SELECT ficha."${column}" AS raw_key, ficha.provider AS provider, COUNT(*)::bigint AS count
           FROM "ProviderSyncCache" ficha
           WHERE ficha."${column}" IS NOT NULL
           GROUP BY ficha."${column}", ficha.provider
           ORDER BY count DESC
           LIMIT $1`,
          limit * 2
        );

    const stats: RawValueStat[] = [];
    for (const row of rows) {
      const rawKey = row.raw_key?.trim();
      if (!rawKey) continue;
      const looksLikeCode = looksLikeProviderCode(rawKey);
      if (params.codesOnly && !looksLikeCode) continue;

      const samples = await this.prisma.providerSyncCache.findMany({
        where: {
          provider: params.provider ?? row.provider,
          [column]: rawKey,
        },
        select: { name: true },
        take: 3,
      });

      stats.push({
        kind: params.kind,
        provider: params.provider ?? row.provider,
        rawKey,
        count: Number(row.count),
        sampleNames: samples.map((s) => s.name),
        looksLikeCode,
      });
      if (stats.length >= limit) break;
    }

    return stats;
  }

  async listAliases(kind?: CatalogAliasKind, provider?: string) {
    return this.prisma.platformCatalogAlias.findMany({
      where: {
        ...(kind ? { kind } : {}),
        ...(provider !== undefined ? { provider: provider?.trim() || "" } : {}),
      },
      orderBy: [{ kind: "asc" }, { label: "asc" }],
    });
  }

  async upsertAliasGroup(input: {
    kind: CatalogAliasKind;
    provider?: string | null;
    rawKeys: string[];
    label: string;
    groupId?: string;
    source?: CatalogEnrichmentSource;
  }) {
    const rawKeys = [...new Set(input.rawKeys.map((k) => k.trim()).filter(Boolean))];
    if (rawKeys.length === 0) throw new BadRequestException("Faltan rawKeys");
    const label = input.label.trim();
    if (!label) throw new BadRequestException("Falta label");

    const groupId = input.groupId?.trim() || randomUUID();
    const provider = input.provider?.trim() || "";
    const source = input.source ?? "MANUAL";

    await this.prisma.$transaction(
      rawKeys.map((rawKey) =>
        this.prisma.platformCatalogAlias.upsert({
          where: {
            kind_provider_rawKey: { kind: input.kind, provider, rawKey },
          },
          create: { kind: input.kind, provider, rawKey, groupId, label, source },
          update: { groupId, label, source },
        })
      )
    );

    await this.refreshCache(true);
    return { groupId, label, rawKeys, kind: input.kind, provider };
  }

  async deleteAlias(id: string) {
    const row = await this.prisma.platformCatalogAlias.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Alias no encontrado");
    await this.prisma.platformCatalogAlias.delete({ where: { id } });
    await this.refreshCache(true);
    return { ok: true };
  }

  async listIdentities(limit = 100, offset = 0) {
    return this.prisma.platformProductIdentity.findMany({
      orderBy: { updatedAt: "desc" },
      take: Math.min(limit, 200),
      skip: offset,
    });
  }

  async upsertIdentity(input: {
    matchKind: CatalogMatchKind;
    matchKey: string;
    displayBrand?: string | null;
    displayCategory?: string | null;
    displaySubcategory?: string | null;
    source?: CatalogEnrichmentSource;
  }) {
    const matchKey =
      input.matchKind === "EAN"
        ? normalizeEan(input.matchKey)
        : normalizePartNumber(input.matchKey);
    if (!matchKey) throw new BadRequestException("Identificador inválido");

    const row = await this.prisma.platformProductIdentity.upsert({
      where: { matchKind_matchKey: { matchKind: input.matchKind, matchKey } },
      create: {
        matchKind: input.matchKind,
        matchKey,
        displayBrand: input.displayBrand?.trim() || null,
        displayCategory: input.displayCategory?.trim() || null,
        displaySubcategory: input.displaySubcategory?.trim() || null,
        source: input.source ?? "MANUAL",
        confirmedAt: new Date(),
      },
      update: {
        displayBrand: input.displayBrand?.trim() || null,
        displayCategory: input.displayCategory?.trim() || null,
        displaySubcategory: input.displaySubcategory?.trim() || null,
        source: input.source ?? "MANUAL",
        confirmedAt: new Date(),
      },
    });

    await this.refreshCache(true);
    return row;
  }

  async deleteIdentity(id: string) {
    await this.prisma.platformProductIdentity.delete({ where: { id } });
    await this.refreshCache(true);
    return { ok: true };
  }

  async getSuggestions(provider?: string) {
    const ctx = await this.getContext();
    const [brandStats, categoryStats, subStats, products] = await Promise.all([
      this.listRawValues({ kind: "BRAND", provider, limit: 60 }),
      this.listRawValues({ kind: "CATEGORY", provider, limit: 80 }),
      this.listRawValues({ kind: "SUBCATEGORY", provider, limit: 80 }),
      this.prisma.providerSyncCache.findMany({
        where: provider ? { provider } : {},
        select: {
          provider: true,
          brand: true,
          category: true,
          subcategory: true,
          ean: true,
          partNumber: true,
          name: true,
        },
        take: 5000,
      }),
    ]);

    const aliasSuggestions = suggestAliasMerges([...brandStats, ...categoryStats, ...subStats], ctx.aliases);
    const codeSuggestions = suggestProviderCodeLabels(
      [...categoryStats, ...subStats].filter((s) => s.looksLikeCode)
    );
    const identitySuggestions = suggestIdentityMerges(products, ctx.identities);

    return { aliasSuggestions, codeSuggestions, identitySuggestions };
  }

  async applySuggestion(input: {
    type: "alias" | "identity" | "code";
    kind?: CatalogAliasKind;
    provider?: string | null;
    rawKeys?: string[];
    label?: string;
    matchKind?: CatalogMatchKind;
    matchKey?: string;
    displayBrand?: string | null;
    displayCategory?: string | null;
    displaySubcategory?: string | null;
    source?: CatalogEnrichmentSource;
  }) {
    if (input.type === "identity") {
      if (!input.matchKind || !input.matchKey) throw new BadRequestException("Faltan matchKind/matchKey");
      return this.upsertIdentity({
        matchKind: input.matchKind,
        matchKey: input.matchKey,
        displayBrand: input.displayBrand,
        displayCategory: input.displayCategory,
        displaySubcategory: input.displaySubcategory,
        source: input.source ?? "AUTO",
      });
    }

    if (!input.kind || !input.label || !input.rawKeys?.length) {
      throw new BadRequestException("Faltan kind/label/rawKeys");
    }

    return this.upsertAliasGroup({
      kind: input.kind,
      provider: input.provider ?? null,
      rawKeys: input.rawKeys,
      label: input.label,
      source: input.source ?? (input.type === "code" ? "AUTO" : "MANUAL"),
    });
  }

  async aiCategoryClusters(provider?: string) {
    const stats = await this.listRawValues({ kind: "CATEGORY", provider, limit: 120 });
    const knownLabels = (await this.listAliases("CATEGORY")).map((a) => a.label);
    const categories = stats.map((s) => s.rawKey);
    return this.ai.suggestCategoryClusters(categories, knownLabels);
  }

  async aiProductHint(provider: string, externalId: string) {
    const product = await this.prisma.providerSyncCache.findUnique({
      where: { provider_externalId: { provider, externalId } },
    });
    if (!product) throw new NotFoundException("Producto no encontrado");

    const [brandStats, categoryStats] = await Promise.all([
      this.listRawValues({ kind: "BRAND", limit: 80 }),
      this.listRawValues({ kind: "CATEGORY", limit: 80 }),
    ]);

    return this.ai.suggestProductMetadata({
      name: product.name,
      provider: product.provider,
      brand: product.brand,
      category: product.category,
      subcategory: product.subcategory,
      ean: product.ean,
      partNumber: product.partNumber,
      knownBrands: brandStats.map((s) => s.rawKey),
      knownCategories: categoryStats.map((s) => s.rawKey),
    });
  }

  async previewProducts(input: {
    kind: CatalogAliasKind;
    provider?: string | null;
    rawKey: string;
    limit?: number;
  }) {
    const field =
      input.kind === "BRAND" ? "brand" : input.kind === "CATEGORY" ? "category" : "subcategory";
    return this.prisma.providerSyncCache.findMany({
      where: {
        ...(input.provider ? { provider: input.provider } : {}),
        [field]: input.rawKey,
      },
      select: { provider: true, externalId: true, name: true, brand: true, category: true, subcategory: true },
      take: Math.min(input.limit ?? 8, 20),
    });
  }

  groupCategories(rows: { rawCategory: string; count: number }[], ctx?: CatalogEnrichmentContext) {
    return groupCategoriesByDisplay(rows, ctx ?? this.cache);
  }

  productMatchesCategory(
    product: {
      provider: string;
      brand: string | null;
      category: string | null;
      subcategory: string | null;
      ean: string | null;
      partNumber: string | null;
    },
    targetCategory: string,
    ctx?: CatalogEnrichmentContext
  ) {
    return matchesDisplayCategory(product, targetCategory, ctx ?? this.cache);
  }

  async categoryMatchFilters(target: string, ctx?: CatalogEnrichmentContext) {
    const context = ctx ?? (await this.getContext());
    const identities = await this.prisma.platformProductIdentity.findMany({
      where: { displayCategory: target },
      select: { matchKind: true, matchKey: true },
    });
    const eans: string[] = [];
    const partNumbers: string[] = [];
    for (const row of identities) {
      if (row.matchKind === "EAN") eans.push(row.matchKey);
      else partNumbers.push(row.matchKey);
    }
    return {
      rawCategories: matchingRawCategories(target, context),
      eans,
      partNumbers,
    };
  }
}
