import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import type { CatalogAliasKind, CatalogEnrichmentSource, CatalogMatchKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CatalogAiService } from "./catalog-ai.service";
import { CatalogSettingsService } from "./catalog-settings.service";
import {
  groupCategoriesByDisplay,
  indexCatalogAliases,
  indexCatalogIdentities,
  indexCatalogOverrides,
  looksLikeProviderCode,
  matchingRawCategories,
  matchesDisplayCategory,
  normalizeBrandKey,
  normalizeCatalogLabel,
  normalizeEan,
  normalizePartNumber,
  suggestAliasMerges,
  suggestIdentityMerges,
  suggestProviderCodeLabels,
  suggestRowMerges,
  type CatalogEnrichmentContext,
  type RawValueStat,
} from "./catalog-enrichment";

@Injectable()
export class CatalogEnrichmentService implements OnModuleInit {
  private readonly logger = new Logger(CatalogEnrichmentService.name);
  private cache: CatalogEnrichmentContext = {
    aliases: {},
    identities: {},
    overrides: {},
    hiddenCategoryLabels: new Set(),
    hiddenBrandLabels: new Set(),
  };
  private cacheLoadedAt = 0;
  private readonly cacheTtlMs = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: CatalogAiService,
    private readonly settings: CatalogSettingsService
  ) {}

  async onModuleInit() {
    // No bloquear el listen: si Postgres está saturado en el rolling deploy, el
    // /health tiene que responder igual. El cache se calienta en background.
    void this.refreshCache(true).catch((err) => {
      this.logger.warn(
        `Cache de catálogo no cargó al arrancar: ${err instanceof Error ? err.message : String(err)}`
      );
    });
  }

  async getContext(force = false): Promise<CatalogEnrichmentContext> {
    if (force || Date.now() - this.cacheLoadedAt > this.cacheTtlMs) {
      await this.refreshCache(true);
    }
    return this.cache;
  }

  async refreshCache(force = false) {
    if (!force && Date.now() - this.cacheLoadedAt <= this.cacheTtlMs) return;
    const [aliasRows, identityRows, overrideRows, hiddenTerms] = await Promise.all([
      this.prisma.platformCatalogAlias.findMany(),
      this.prisma.platformProductIdentity.findMany(),
      this.prisma.platformProductCatalogOverride.findMany(),
      this.prisma.platformCatalogTerm.findMany({
        where: { visible: false },
        select: { kind: true, label: true },
      }),
    ]);
    const hiddenCategoryLabels = new Set<string>();
    const hiddenBrandLabels = new Set<string>();
    for (const t of hiddenTerms) {
      if (t.kind === "CATEGORY" || t.kind === "SUBCATEGORY") hiddenCategoryLabels.add(t.label);
      if (t.kind === "BRAND") hiddenBrandLabels.add(t.label);
    }
    this.cache = {
      aliases: indexCatalogAliases(aliasRows),
      identities: indexCatalogIdentities(identityRows),
      overrides: indexCatalogOverrides(overrideRows),
      hiddenCategoryLabels,
      hiddenBrandLabels,
    };
    this.cacheLoadedAt = Date.now();
  }

  async overview() {
    const [termCount, aliasCount, overrideCount, productCount, incomplete] = await Promise.all([
      this.prisma.platformCatalogTerm.count(),
      this.prisma.platformCatalogAlias.count(),
      this.prisma.platformProductCatalogOverride.count(),
      this.prisma.providerSyncCache.count(),
      this.countIncomplete(),
    ]);

    return {
      termCount,
      aliasCount,
      overrideCount,
      productCount,
      incompleteCount: incomplete,
      aiConfigured: await this.settings.hasOpenAiKey(),
    };
  }

  saveOpenAiKey(apiKey: string) {
    return this.settings.saveOpenAiKey(apiKey);
  }

  clearOpenAiKey() {
    return this.settings.clearOpenAiKey();
  }

  private fieldForKind(kind: CatalogAliasKind) {
    return kind === "BRAND" ? "brand" : kind === "CATEGORY" ? "category" : "subcategory";
  }

  async listRawValues(params: {
    kind: CatalogAliasKind;
    provider?: string;
    codesOnly?: boolean;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(params.limit ?? 80, 1), 500);
    const column = this.fieldForKind(params.kind);

    type Row = { raw_key: string; provider: string; count: bigint };
    const rows = params.provider
      ? await this.prisma.$queryRawUnsafe<Row[]>(
          `SELECT ficha."${column}" AS raw_key, ficha.provider AS provider, COUNT(*)::bigint AS count
           FROM "ProviderSyncCache" ficha
           WHERE ficha."${column}" IS NOT NULL AND TRIM(ficha."${column}") <> '' AND ficha.provider = $1
           GROUP BY ficha."${column}", ficha.provider
           ORDER BY count DESC
           LIMIT $2`,
          params.provider,
          limit * 2
        )
      : await this.prisma.$queryRawUnsafe<Row[]>(
          `SELECT ficha."${column}" AS raw_key, ficha.provider AS provider, COUNT(*)::bigint AS count
           FROM "ProviderSyncCache" ficha
           WHERE ficha."${column}" IS NOT NULL AND TRIM(ficha."${column}") <> ''
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

  /** Tablero: todas las categorías/marcas crudas + vínculos + visibilidad. */
  async getBoard(kind: CatalogAliasKind) {
    const [rawStats, terms, aliases] = await Promise.all([
      this.listRawValues({ kind, limit: 400 }),
      this.prisma.platformCatalogTerm.findMany({
        where: { kind },
        include: { parent: { select: { id: true, label: true, kind: true } } },
        orderBy: { label: "asc" },
      }),
      this.prisma.platformCatalogAlias.findMany({ where: { kind } }),
    ]);

    const aliasByKey = new Map<string, (typeof aliases)[number]>();
    for (const a of aliases) {
      aliasByKey.set(`${a.provider}:${a.rawKey}`, a);
    }

    const membersByTerm = new Map<string, { provider: string; rawKey: string; count: number }[]>();
    const rows = rawStats.map((s) => {
      const provider = s.provider ?? "";
      const alias = aliasByKey.get(`${provider}:${s.rawKey}`);
      const termId = alias?.termId ?? null;
      if (termId) {
        const arr = membersByTerm.get(termId) ?? [];
        arr.push({ provider, rawKey: s.rawKey, count: s.count });
        membersByTerm.set(termId, arr);
      }
      const term = termId ? terms.find((t) => t.id === termId) : null;
      return {
        id: `${kind}:${provider}:${s.rawKey}`,
        provider,
        rawKey: s.rawKey,
        count: s.count,
        sampleNames: s.sampleNames,
        looksLikeCode: s.looksLikeCode,
        termId,
        termLabel: term?.label ?? alias?.label ?? null,
        visible: term?.visible ?? true,
        parentId: term?.parentId ?? null,
        parentLabel: term?.parent?.label ?? null,
        linked: [] as { provider: string; rawKey: string; count: number }[],
      };
    });

    for (const row of rows) {
      if (!row.termId) continue;
      row.linked = (membersByTerm.get(row.termId) ?? []).filter(
        (m) => !(m.provider === row.provider && m.rawKey === row.rawKey)
      );
    }

    const termCards = terms.map((t) => ({
      id: t.id,
      label: t.label,
      kind: t.kind,
      visible: t.visible,
      parentId: t.parentId,
      parentLabel: t.parent?.label ?? null,
      members: membersByTerm.get(t.id) ?? [],
      productCount: (membersByTerm.get(t.id) ?? []).reduce((s, m) => s + m.count, 0),
    }));

    return {
      kind,
      rows,
      terms: termCards,
      stats: {
        rawCount: rows.length,
        linkedCount: rows.filter((r) => r.termId).length,
        termCount: terms.length,
        groupCount: termCards.filter((t) => t.members.length > 0).length,
        hiddenCount: terms.filter((t) => !t.visible).length,
      },
    };
  }

  async listTerms(kind?: CatalogAliasKind) {
    return this.prisma.platformCatalogTerm.findMany({
      where: kind ? { kind } : undefined,
      include: {
        parent: { select: { id: true, label: true, kind: true } },
        children: { select: { id: true, label: true, kind: true } },
        _count: { select: { aliases: true } },
      },
      orderBy: [{ kind: "asc" }, { label: "asc" }],
    });
  }

  async ensureTerm(input: {
    kind: CatalogAliasKind;
    label: string;
    parentId?: string | null;
    visible?: boolean;
    source?: CatalogEnrichmentSource;
  }) {
    const label = input.label.trim();
    if (!label) throw new BadRequestException("Falta label");
    if (input.parentId) {
      const parent = await this.prisma.platformCatalogTerm.findUnique({ where: { id: input.parentId } });
      if (!parent) throw new BadRequestException("Padre inexistente");
    }
    const existing = await this.prisma.platformCatalogTerm.findUnique({
      where: { kind_label: { kind: input.kind, label } },
    });
    if (existing) {
      if (
        (input.parentId !== undefined && input.parentId !== existing.parentId) ||
        (input.visible !== undefined && input.visible !== existing.visible)
      ) {
        return this.prisma.platformCatalogTerm.update({
          where: { id: existing.id },
          data: {
            ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
            ...(input.visible !== undefined ? { visible: input.visible } : {}),
          },
        });
      }
      return existing;
    }
    return this.prisma.platformCatalogTerm.create({
      data: {
        kind: input.kind,
        label,
        parentId: input.parentId ?? null,
        visible: input.visible ?? true,
        source: input.source ?? "MANUAL",
      },
    });
  }

  async createTerm(input: {
    kind: CatalogAliasKind;
    label: string;
    parentId?: string | null;
    visible?: boolean;
  }) {
    const term = await this.ensureTerm(input);
    await this.refreshCache(true);
    return term;
  }

  async updateTerm(
    id: string,
    input: { label?: string; parentId?: string | null; visible?: boolean }
  ) {
    const term = await this.prisma.platformCatalogTerm.findUnique({ where: { id } });
    if (!term) throw new NotFoundException("Término no encontrado");

    const label = input.label?.trim();
    if (label && label !== term.label) {
      const clash = await this.prisma.platformCatalogTerm.findUnique({
        where: { kind_label: { kind: term.kind, label } },
      });
      if (clash) throw new BadRequestException("Ya existe un término con ese nombre");
    }
    if (input.parentId) {
      if (input.parentId === id) throw new BadRequestException("No puede ser padre de sí mismo");
      const parent = await this.prisma.platformCatalogTerm.findUnique({ where: { id: input.parentId } });
      if (!parent) throw new BadRequestException("Padre inexistente");
    }

    const updated = await this.prisma.platformCatalogTerm.update({
      where: { id },
      data: {
        ...(label ? { label } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.visible !== undefined ? { visible: input.visible } : {}),
      },
    });

    if (label && label !== term.label) {
      await this.prisma.platformCatalogAlias.updateMany({
        where: { termId: id },
        data: { label },
      });
    }

    await this.refreshCache(true);
    return updated;
  }

  async deleteTerm(id: string, force = false) {
    const term = await this.prisma.platformCatalogTerm.findUnique({
      where: { id },
      include: { _count: { select: { aliases: true, children: true } } },
    });
    if (!term) throw new NotFoundException("Término no encontrado");
    if (!force && (term._count.aliases > 0 || term._count.children > 0)) {
      throw new BadRequestException("El término tiene vínculos o subcategorías; usá force o vacialo antes");
    }
    if (force) {
      await this.prisma.platformCatalogAlias.updateMany({ where: { termId: id }, data: { termId: null } });
      await this.prisma.platformCatalogTerm.updateMany({ where: { parentId: id }, data: { parentId: null } });
    }
    await this.prisma.platformCatalogTerm.delete({ where: { id } });
    await this.refreshCache(true);
    return { ok: true };
  }

  async linkRaws(input: {
    kind: CatalogAliasKind;
    items: { provider: string; rawKey: string }[];
    label?: string;
    termId?: string;
    source?: CatalogEnrichmentSource;
  }) {
    let term =
      input.termId
        ? await this.prisma.platformCatalogTerm.findUnique({ where: { id: input.termId } })
        : null;
    if (input.termId && !term) throw new NotFoundException("Término no encontrado");
    if (!term) {
      const label = (input.label ?? input.items[0]?.rawKey ?? "").trim();
      if (!label) throw new BadRequestException("Falta label o termId");
      term = await this.ensureTerm({ kind: input.kind, label, source: input.source ?? "MANUAL" });
    }

    const source = input.source ?? "MANUAL";
    const items = input.items
      .map((i) => ({ provider: (i.provider ?? "").trim(), rawKey: i.rawKey.trim() }))
      .filter((i) => i.rawKey);
    if (items.length === 0) throw new BadRequestException("Faltan items");

    await this.prisma.$transaction(
      items.map(({ provider, rawKey }) =>
        this.prisma.platformCatalogAlias.upsert({
          where: { kind_provider_rawKey: { kind: input.kind, provider, rawKey } },
          create: {
            kind: input.kind,
            provider,
            rawKey,
            groupId: term!.id,
            label: term!.label,
            termId: term!.id,
            source,
          },
          update: {
            groupId: term!.id,
            label: term!.label,
            termId: term!.id,
            source,
          },
        })
      )
    );

    await this.refreshCache(true);
    return { term, items };
  }

  /**
   * Traslada productos de un raw (proveedor+clave) hacia un término/label destino.
   * Crea overrides por producto + re-vincula el raw al destino.
   * Opcionalmente elimina el término vacío de origen.
   */
  async moveProducts(input: {
    kind: CatalogAliasKind;
    from: { provider: string; rawKey: string };
    toTermId?: string;
    toLabel?: string;
    deleteEmptySourceTerm?: boolean;
    source?: CatalogEnrichmentSource;
  }) {
    const field = this.fieldForKind(input.kind);
    const fromProvider = input.from.provider.trim();
    const fromRaw = input.from.rawKey.trim();
    if (!fromRaw) throw new BadRequestException("Falta origen");

    let target =
      input.toTermId
        ? await this.prisma.platformCatalogTerm.findUnique({ where: { id: input.toTermId } })
        : null;
    if (input.toTermId && !target) throw new NotFoundException("Término destino no encontrado");
    if (!target) {
      const label = (input.toLabel ?? "").trim();
      if (!label) throw new BadRequestException("Falta destino");
      target = await this.ensureTerm({ kind: input.kind, label, source: input.source ?? "MANUAL" });
    }

    const products = await this.prisma.providerSyncCache.findMany({
      where: { provider: fromProvider, [field]: fromRaw },
      select: { provider: true, externalId: true },
    });

    const enrichmentSource = input.source ?? "MANUAL";
    const displayField =
      input.kind === "BRAND"
        ? "displayBrand"
        : input.kind === "CATEGORY"
          ? "displayCategory"
          : "displaySubcategory";

    const CHUNK = 100;
    for (let i = 0; i < products.length; i += CHUNK) {
      const slice = products.slice(i, i + CHUNK);
      await this.prisma.$transaction(
        slice.map((p) =>
          this.prisma.platformProductCatalogOverride.upsert({
            where: {
              provider_externalId: { provider: p.provider, externalId: p.externalId },
            },
            create: {
              provider: p.provider,
              externalId: p.externalId,
              [displayField]: target!.label,
              source: enrichmentSource,
            },
            update: {
              [displayField]: target!.label,
              source: enrichmentSource,
            },
          })
        )
      );
    }

    const sourceAlias = await this.prisma.platformCatalogAlias.findUnique({
      where: {
        kind_provider_rawKey: { kind: input.kind, provider: fromProvider, rawKey: fromRaw },
      },
    });
    const sourceTermId = sourceAlias?.termId ?? null;

    await this.linkRaws({
      kind: input.kind,
      items: [{ provider: fromProvider, rawKey: fromRaw }],
      termId: target.id,
      source: enrichmentSource,
    });

    let deletedSourceTerm: string | null = null;
    if (input.deleteEmptySourceTerm && sourceTermId && sourceTermId !== target.id) {
      const remaining = await this.prisma.platformCatalogAlias.count({
        where: { termId: sourceTermId },
      });
      if (remaining === 0) {
        await this.prisma.platformCatalogTerm.delete({ where: { id: sourceTermId } }).catch(() => null);
        deletedSourceTerm = sourceTermId;
      }
    }

    await this.refreshCache(true);
    return {
      moved: products.length,
      target,
      deletedSourceTerm,
    };
  }

  /** Si el raw no tiene término, crea uno con su nombre y setea visible. */
  async toggleRawVisibility(input: {
    kind: CatalogAliasKind;
    provider: string;
    rawKey: string;
    visible: boolean;
  }) {
    const linked = await this.linkRaws({
      kind: input.kind,
      items: [{ provider: input.provider, rawKey: input.rawKey }],
      label: input.rawKey,
    });
    return this.updateTerm(linked.term.id, { visible: input.visible });
  }

  async countIncomplete() {
    const total = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "ProviderSyncCache"
       WHERE (brand IS NULL OR TRIM(brand) = '')
          OR (category IS NULL OR TRIM(category) = '')`
    );
    return Number(total[0]?.count ?? 0);
  }

  async listIncomplete(params: { limit?: number; offset?: number; q?: string }) {
    const limit = Math.min(Math.max(params.limit ?? 40, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);
    const q = params.q?.trim();

    const whereSql = q
      ? `WHERE ((brand IS NULL OR TRIM(brand) = '') OR (category IS NULL OR TRIM(category) = ''))
           AND (name ILIKE $3 OR sku ILIKE $3 OR "partNumber" ILIKE $3)`
      : `WHERE (brand IS NULL OR TRIM(brand) = '') OR (category IS NULL OR TRIM(category) = '')`;

    type Row = {
      provider: string;
      externalId: string;
      name: string;
      brand: string | null;
      category: string | null;
      subcategory: string | null;
      ean: string | null;
      partNumber: string | null;
      sku: string | null;
    };

    const items = q
      ? await this.prisma.$queryRawUnsafe<Row[]>(
          `SELECT provider, "externalId", name, brand, category, subcategory, ean, "partNumber", sku
           FROM "ProviderSyncCache" ${whereSql}
           ORDER BY name ASC LIMIT $1 OFFSET $2`,
          limit,
          offset,
          `%${q}%`
        )
      : await this.prisma.$queryRawUnsafe<Row[]>(
          `SELECT provider, "externalId", name, brand, category, subcategory, ean, "partNumber", sku
           FROM "ProviderSyncCache" ${whereSql}
           ORDER BY name ASC LIMIT $1 OFFSET $2`,
          limit,
          offset
        );

    const ctx = await this.getContext();
    const enriched = items
      .map((p) => {
        const override = ctx.overrides[`${p.provider}:${p.externalId}`];
        const displayBrand = override?.displayBrand ?? p.brand;
        const displayCategory = override?.displayCategory ?? p.category;
        const displaySubcategory = override?.displaySubcategory ?? p.subcategory;
        return {
          ...p,
          displayBrand,
          displayCategory,
          displaySubcategory,
          missingBrand: !displayBrand?.trim(),
          missingCategory: !displayCategory?.trim(),
          missingSubcategory: !displaySubcategory?.trim(),
        };
      })
      .filter((p) => p.missingBrand || p.missingCategory);

    return {
      items: enriched,
      total: await this.countIncomplete(),
      limit,
      offset,
    };
  }

  async assignProduct(input: {
    provider: string;
    externalId: string;
    displayBrand?: string | null;
    displayCategory?: string | null;
    displaySubcategory?: string | null;
    source?: CatalogEnrichmentSource;
  }) {
    const product = await this.prisma.providerSyncCache.findUnique({
      where: {
        provider_externalId: { provider: input.provider, externalId: input.externalId },
      },
    });
    if (!product) throw new NotFoundException("Producto no encontrado");

    const source = input.source ?? "MANUAL";
    const row = await this.prisma.platformProductCatalogOverride.upsert({
      where: {
        provider_externalId: { provider: input.provider, externalId: input.externalId },
      },
      create: {
        provider: input.provider,
        externalId: input.externalId,
        displayBrand: input.displayBrand?.trim() || null,
        displayCategory: input.displayCategory?.trim() || null,
        displaySubcategory: input.displaySubcategory?.trim() || null,
        source,
      },
      update: {
        ...(input.displayBrand !== undefined
          ? { displayBrand: input.displayBrand?.trim() || null }
          : {}),
        ...(input.displayCategory !== undefined
          ? { displayCategory: input.displayCategory?.trim() || null }
          : {}),
        ...(input.displaySubcategory !== undefined
          ? { displaySubcategory: input.displaySubcategory?.trim() || null }
          : {}),
        source,
      },
    });

    if (row.displayBrand) {
      await this.ensureTerm({ kind: "BRAND", label: row.displayBrand, source });
    }
    if (row.displayCategory) {
      await this.ensureTerm({ kind: "CATEGORY", label: row.displayCategory, source });
    }
    if (row.displaySubcategory) {
      await this.ensureTerm({ kind: "SUBCATEGORY", label: row.displaySubcategory, source });
    }

    await this.refreshCache(true);
    return row;
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
    const provider = input.provider?.trim() || "";
    return this.linkRaws({
      kind: input.kind,
      items: rawKeys.map((rawKey) => ({ provider, rawKey })),
      label: input.label,
      termId: input.groupId,
      source: input.source,
    });
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

  async aiSuggestMerges(
    kind: CatalogAliasKind = "CATEGORY",
    opts?: { excludeKeys?: string[]; offset?: number }
  ) {
    const board = await this.getBoard(kind);
    const unlinked = board.rows.filter((r) => !r.termId);
    const knownLabels = board.terms.map((t) => t.label);
    const exclude = new Set(opts?.excludeKeys ?? []);

    // 1) Heurística por filas (clave para marcas: ASUS en todos los distros)
    const rowClusters = suggestRowMerges(
      unlinked.map((r) => ({ provider: r.provider, rawKey: r.rawKey, count: r.count })),
      kind
    ).map((c) => ({
      label: c.label,
      confidence: c.confidence,
      reason: c.reason,
      members: c.members,
    }));

    // 2) IA / heurística de strings para lo que aún no entró en un grupo
    const covered = new Set(
      rowClusters.flatMap((c) => c.members.map((m) => `${m.provider}:${m.rawKey}`))
    );
    const leftover = unlinked.filter((r) => !covered.has(`${r.provider}:${r.rawKey}`));
    let usedAi = false;
    const aiExtra: typeof rowClusters = [];

    if (leftover.length >= 2) {
      const values = [...new Set(leftover.map((s) => s.rawKey))];
      if (values.length >= 2) {
        const result = await this.ai.suggestCategoryClusters(values, knownLabels);
        usedAi = result.usedAi;
        for (const c of result.clusters) {
          const seed = leftover.filter((s) =>
            c.members.some((m) =>
              kind === "BRAND"
                ? normalizeBrandKey(m) === normalizeBrandKey(s.rawKey) || m === s.rawKey
                : normalizeCatalogLabel(m) === normalizeCatalogLabel(s.rawKey) || m === s.rawKey
            )
          );
          if (seed.length < 1) continue;
          // Expandir a todos los unlinked con la misma clave (todas las Asus, etc.)
          const keys =
            kind === "BRAND"
              ? new Set(seed.map((m) => normalizeBrandKey(m.rawKey)))
              : new Set(seed.map((m) => normalizeCatalogLabel(m.rawKey)));
          const members = unlinked
            .filter((s) =>
              kind === "BRAND"
                ? keys.has(normalizeBrandKey(s.rawKey))
                : keys.has(normalizeCatalogLabel(s.rawKey))
            )
            .map((s) => ({ provider: s.provider, rawKey: s.rawKey, count: s.count }));
          if (members.length < 2) continue;
          aiExtra.push({
            label: c.label,
            confidence: (c.confidence as "alta" | "media" | "baja") || "media",
            reason: usedAi
              ? kind === "BRAND"
                ? "Sugerencia IA (marca)"
                : "Sugerencia IA"
              : "Nombres parecidos",
            members,
          });
        }
      }
    }

    const merged = [...rowClusters, ...aiExtra];
    const seen = new Set<string>();
    const clusters = merged
      .filter((c) => {
        if (c.members.length < 2) return false;
        const fingerprint = c.members
          .map((m) => `${m.provider}:${m.rawKey}`)
          .sort()
          .join("|");
        if (seen.has(fingerprint) || exclude.has(`cluster:${fingerprint}`)) return false;
        const keys = c.members.map((m) => `${m.provider}:${m.rawKey}`);
        if (keys.every((k) => exclude.has(k))) return false;
        seen.add(fingerprint);
        return true;
      })
      .sort(
        (a, b) =>
          b.members.reduce((s, m) => s + m.count, 0) - a.members.reduce((s, m) => s + m.count, 0) ||
          a.label.localeCompare(b.label, "es")
      );

    const offset = Math.max(0, opts?.offset ?? 0);
    const pageSize = kind === "BRAND" ? 25 : 15;
    const page = clusters.slice(offset, offset + pageSize);

    return {
      clusters: page,
      usedAi,
      kind,
      total: clusters.length,
      offset,
      hasMore: offset + pageSize < clusters.length,
      unlinkedCount: unlinked.length,
    };
  }

  async aiCategoryClusters(provider?: string) {
    const r = await this.aiSuggestMerges("CATEGORY");
    if (provider) {
      return {
        clusters: r.clusters
          .map((c) => ({
            label: c.label,
            members: c.members.filter((m) => m.provider === provider).map((m) => m.rawKey),
          }))
          .filter((c) => c.members.length >= 1),
        usedAi: r.usedAi,
      };
    }
    return {
      clusters: r.clusters.map((c) => ({
        label: c.label,
        members: c.members.map((m) => m.rawKey),
      })),
      usedAi: r.usedAi,
    };
  }

  async aiProductHint(provider: string, externalId: string) {
    const product = await this.prisma.providerSyncCache.findUnique({
      where: { provider_externalId: { provider, externalId } },
    });
    if (!product) throw new NotFoundException("Producto no encontrado");

    const [brands, categories] = await Promise.all([
      this.listTerms("BRAND"),
      this.listTerms("CATEGORY"),
    ]);

    return this.ai.suggestProductMetadata({
      name: product.name,
      provider: product.provider,
      brand: product.brand,
      category: product.category,
      subcategory: product.subcategory,
      ean: product.ean,
      partNumber: product.partNumber,
      knownBrands: brands.map((s) => s.label),
      knownCategories: categories.map((s) => s.label),
    });
  }

  async previewProducts(input: {
    kind: CatalogAliasKind;
    provider?: string | null;
    rawKey?: string;
    termId?: string;
    limit?: number;
  }) {
    const field = this.fieldForKind(input.kind);
    const take = Math.min(Number(input.limit) || 12, 40);
    const select = {
      provider: true,
      externalId: true,
      name: true,
      brand: true,
      category: true,
      subcategory: true,
      sku: true,
      partNumber: true,
    } as const;

    if (input.termId) {
      const aliases = await this.prisma.platformCatalogAlias.findMany({
        where: { termId: input.termId, kind: input.kind },
        select: { rawKey: true },
      });
      const keys = [...new Set(aliases.map((a) => a.rawKey).filter(Boolean))];
      if (keys.length === 0) return [];
      return this.prisma.providerSyncCache.findMany({
        where: { [field]: { in: keys } },
        select,
        take,
        orderBy: { name: "asc" },
      });
    }

    const rawKey = (input.rawKey ?? "").trim();
    if (!rawKey) throw new BadRequestException("Falta rawKey o termId");

    return this.prisma.providerSyncCache.findMany({
      where: {
        ...(input.provider ? { provider: input.provider } : {}),
        [field]: rawKey,
      },
      select,
      take,
      orderBy: { name: "asc" },
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
