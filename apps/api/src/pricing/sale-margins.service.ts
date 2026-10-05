import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  SALE_MARGIN_MAX,
  SALE_MARGIN_MIN,
  resolveSaleMargin,
  saleCategoryKey,
  saleRuleKey,
  type ProviderSaleMargins,
  type SaleMarginBase,
  type SaleMarginCategoryRow,
  type SaleMarginHistoryEntry,
  type SaleMarginProductRow,
  type SaleMarginProductsPage,
  type SaleMarginScope,
} from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CatalogEnrichmentService } from "../catalog/catalog-enrichment.service";
import { resolveCatalogDisplay } from "../catalog/catalog-enrichment";
import { ProvidersService } from "../providers/providers.service";
import { NO_RULES, toProductView } from "../providers/catalog-view";
import { SaleMarginRulesService } from "./sale-margin-rules.service";
import { saleOf } from "./sale-pricing";

/** Tope de productos por cambio masivo (una página grande de selección). */
export const MAX_BULK = 2000;
const PAGE_DEFAULT = 50;
const PAGE_MAX = 200;

type Writer = { tenantId: string; userId: string };

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Valida un margen pedido por la web. `null` = quitar la regla (vuelve a heredar). */
export function parsePercent(value: unknown): number | null {
  if (value === null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new BadRequestException("El margen tiene que ser un número.");
  if (n < SALE_MARGIN_MIN || n > SALE_MARGIN_MAX) {
    throw new BadRequestException(`El margen va de ${SALE_MARGIN_MIN} % a ${SALE_MARGIN_MAX} %.`);
  }
  return Math.round(n * 1000) / 1000;
}

interface RuleWrite {
  ruleKey: string;
  scope: SaleMarginScope;
  provider: string | null;
  categoryKey?: string | null;
  categoryLabel?: string | null;
  externalId?: string | null;
}

/**
 * Márgenes de venta del comercio (docs/PLAN_MODO_VENDEDOR.md §4): lectura para
 * la pantalla del distribuidor y escritura por comercio, distribuidor,
 * categoría y producto, con historial.
 */
@Injectable()
export class SaleMarginsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: SaleMarginRulesService,
    private readonly providers: ProvidersService,
    private readonly enrichment: CatalogEnrichmentService
  ) {}

  // ---------- Comercio ----------

  async storeSettings(tenantId: string) {
    const rules = await this.rules.get(tenantId);
    return { storePercent: rules.rules.get(saleRuleKey.store()) ?? null };
  }

  async setStore(writer: Writer, percent: number | null) {
    await this.write(writer, [{ ruleKey: saleRuleKey.store(), scope: "STORE", provider: null }], percent);
    return this.storeSettings(writer.tenantId);
  }

  // ---------- Distribuidor ----------

  async providerMargins(tenantId: string, provider: string): Promise<ProviderSaleMargins> {
    const [rules, config, categories] = await Promise.all([
      this.rules.get(tenantId),
      this.prisma.providerSyncConfig.findUnique({
        where: { tenantId_provider: { tenantId, provider } },
        select: { saleMarginBase: true },
      }),
      this.categories(tenantId, provider),
    ]);
    return {
      provider,
      base: config?.saleMarginBase === "NET" ? "NET" : "FINAL",
      providerPercent: rules.rules.get(saleRuleKey.provider(provider)) ?? null,
      storePercent: rules.rules.get(saleRuleKey.store()) ?? null,
      categories,
    };
  }

  async setProvider(writer: Writer, provider: string, input: { base?: SaleMarginBase; providerPercent?: number | null }) {
    if (input.base) {
      const res = await this.prisma.providerSyncConfig.updateMany({
        where: { tenantId: writer.tenantId, provider },
        data: { saleMarginBase: input.base },
      });
      if (res.count === 0) {
        throw new BadRequestException("Conectá este distribuidor (cuenta o lista) antes de elegir la base del margen.");
      }
      this.rules.invalidate(writer.tenantId);
    }
    if (input.providerPercent !== undefined) {
      await this.write(writer, [{ ruleKey: saleRuleKey.provider(provider), scope: "PROVIDER", provider }], input.providerPercent);
    }
    return this.providerMargins(writer.tenantId, provider);
  }

  // ---------- Categorías ----------

  async setCategories(writer: Writer, provider: string, keys: string[], percent: number | null) {
    const wanted = [...new Set(keys.map((k) => saleCategoryKey(k)).filter((k): k is string => Boolean(k)))];
    if (wanted.length === 0) throw new BadRequestException("Elegí al menos una categoría.");
    if (wanted.length > MAX_BULK) throw new BadRequestException(`Como máximo ${MAX_BULK} categorías por vez.`);
    const labels = await this.categoryLabels(writer.tenantId, provider);
    const unknown = wanted.filter((k) => !labels.has(k));
    if (unknown.length > 0) throw new BadRequestException(`Categorías que este distribuidor no tiene: ${unknown.slice(0, 5).join(", ")}`);
    await this.write(
      writer,
      wanted.map((key) => ({
        ruleKey: saleRuleKey.category(provider, key),
        scope: "CATEGORY" as const,
        provider,
        categoryKey: key,
        categoryLabel: labels.get(key) ?? key,
      })),
      percent
    );
    return this.providerMargins(writer.tenantId, provider);
  }

  // ---------- Productos ----------

  async products(
    tenantId: string,
    provider: string,
    opts: { category?: string; q?: string; cursor?: string; limit?: number }
  ): Promise<SaleMarginProductsPage> {
    const take = Math.min(Math.max(Number(opts.limit) || PAGE_DEFAULT, 1), PAGE_MAX);
    const where: Prisma.TenantProductOfferWhereInput = {
      tenantId,
      provider,
      active: true,
      OR: [{ price: { gt: 0 } }, { finalPrice: { gt: 0 } }],
    };
    const productWhere: Prisma.ProviderSyncCacheWhereInput = {};
    if (opts.category) {
      const key = saleCategoryKey(opts.category);
      const rawLabels = key ? (await this.categoryRawLabels(tenantId, provider)).get(key) ?? [] : [];
      productWhere.category = { in: rawLabels.length ? rawLabels : ["__sin_categoria__"] };
    }
    const q = opts.q?.trim();
    if (q) {
      productWhere.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { partNumber: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
      ];
    }
    if (Object.keys(productWhere).length > 0) where.product = productWhere;

    const [total, offers, rules, providerRules] = await Promise.all([
      this.prisma.tenantProductOffer.count({ where }),
      this.prisma.tenantProductOffer.findMany({
        where,
        include: { product: true },
        orderBy: [{ product: { name: "asc" } }, { id: "asc" }],
        take: take + 1,
        ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
      }),
      this.rules.get(tenantId),
      this.providers.rulesByProvider(tenantId),
    ]);
    const page = offers.slice(0, take);
    const offerRules = providerRules.get(provider) ?? NO_RULES;
    const items: SaleMarginProductRow[] = page.map((offer) => {
      const view = toProductView(offer.product, offer, offerRules);
      const sale = saleOf(view as never, rules);
      const own = rules.rules.get(saleRuleKey.product(provider, offer.externalId));
      const { percent, source } = resolveSaleMargin(rules.rules, {
        provider,
        externalId: offer.externalId,
        category: view.category,
      });
      return {
        externalId: offer.externalId,
        name: view.name,
        sku: view.sku,
        brand: view.displayBrand ?? view.brand,
        imageUrl: view.imageUrl,
        category: view.category,
        categoryKey: saleCategoryKey(view.category),
        currency: (view.currency || "USD").toUpperCase(),
        cost: { price: view.price, finalPrice: sale?.costFinal ?? view.finalPrice },
        percent: own ?? null,
        effective: percent,
        source,
        sale: { price: sale?.price ?? null, finalPrice: sale?.finalPrice ?? null },
      };
    });
    return { items, nextCursor: offers.length > take ? page[page.length - 1].id : null, total };
  }

  async setProducts(writer: Writer, provider: string, externalIds: string[], percent: number | null) {
    const ids = [...new Set(externalIds.map((id) => String(id).trim()).filter(Boolean))];
    if (ids.length === 0) throw new BadRequestException("Elegí al menos un producto.");
    if (ids.length > MAX_BULK) throw new BadRequestException(`Como máximo ${MAX_BULK} productos por vez.`);
    const found = await this.prisma.tenantProductOffer.count({
      where: { tenantId: writer.tenantId, provider, externalId: { in: ids } },
    });
    if (found !== ids.length) throw new NotFoundException("Hay productos que no están en el catálogo de este distribuidor.");
    await this.write(
      writer,
      ids.map((externalId) => ({ ruleKey: saleRuleKey.product(provider, externalId), scope: "PRODUCT" as const, provider, externalId })),
      percent
    );
    return { updated: ids.length };
  }

  // ---------- Historial ----------

  async history(tenantId: string, opts: { provider?: string; limit?: number }): Promise<SaleMarginHistoryEntry[]> {
    const take = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
    const where: Prisma.SaleMarginChangeWhereInput = { tenantId };
    if (opts.provider) {
      where.OR = [
        { ruleKey: saleRuleKey.provider(opts.provider) },
        { ruleKey: { startsWith: `C:${opts.provider}:` } },
        { ruleKey: { startsWith: `X:${opts.provider}:` } },
        { ruleKey: saleRuleKey.store() },
      ];
    }
    const rows = await this.prisma.saleMarginChange.findMany({ where, orderBy: { createdAt: "desc" }, take });
    const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => Boolean(id)))];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })
      : [];
    const names = new Map(users.map((u) => [u.id, u.username]));
    const labels = await this.historyLabels(tenantId, rows.map((r) => r.ruleKey));
    return rows.map((r) => {
      const parsed = parseRuleKey(r.ruleKey);
      return {
        id: r.id,
        ruleKey: r.ruleKey,
        scope: parsed.scope,
        provider: parsed.provider,
        label: labels.get(r.ruleKey) ?? parsed.fallbackLabel,
        before: num(r.before),
        after: num(r.after),
        userId: r.userId,
        userName: r.userId ? names.get(r.userId) ?? null : null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  // ---------- Internos ----------

  /**
   * Escribe (o borra con `percent = null`) un lote de reglas en una sola
   * transacción y deja el historial de cada una que cambió.
   */
  private async write(writer: Writer, targets: RuleWrite[], rawPercent: number | null) {
    const percent = parsePercent(rawPercent);
    const keys = targets.map((t) => t.ruleKey);
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.saleMarginRule.findMany({
        where: { tenantId: writer.tenantId, ruleKey: { in: keys } },
        select: { ruleKey: true, percent: true },
      });
      const before = new Map(existing.map((e) => [e.ruleKey, num(e.percent)]));
      if (percent == null) {
        await tx.saleMarginRule.deleteMany({ where: { tenantId: writer.tenantId, ruleKey: { in: keys } } });
      } else {
        const fresh = targets.filter((t) => !before.has(t.ruleKey));
        if (before.size > 0) {
          await tx.saleMarginRule.updateMany({
            where: { tenantId: writer.tenantId, ruleKey: { in: [...before.keys()] } },
            data: { percent, updatedById: writer.userId },
          });
        }
        if (fresh.length > 0) {
          await tx.saleMarginRule.createMany({
            data: fresh.map((t) => ({
              tenantId: writer.tenantId,
              scope: t.scope,
              provider: t.provider,
              categoryKey: t.categoryKey ?? null,
              categoryLabel: t.categoryLabel ?? null,
              externalId: t.externalId ?? null,
              ruleKey: t.ruleKey,
              percent,
              updatedById: writer.userId,
            })),
            skipDuplicates: true,
          });
        }
      }
      const changes = keys
        .map((ruleKey) => ({ ruleKey, from: before.get(ruleKey) ?? null }))
        .filter((c) => c.from !== percent);
      if (changes.length > 0) {
        await tx.saleMarginChange.createMany({
          data: changes.map((c) => ({
            tenantId: writer.tenantId,
            userId: writer.userId,
            ruleKey: c.ruleKey,
            before: c.from,
            after: percent,
          })),
        });
      }
    });
    this.rules.invalidate(writer.tenantId);
  }

  /** Categorías crudas del distribuidor agrupadas por clave, con cantidad y un producto de ejemplo. */
  private async categories(tenantId: string, provider: string): Promise<SaleMarginCategoryRow[]> {
    const grouped = await this.prisma.$queryRaw<{ category: string | null; products: number }[]>`
      SELECT c.category AS category, count(*)::int AS products
      FROM "TenantProductOffer" o
      JOIN "ProviderSyncCache" c ON c.provider = o.provider AND c."externalId" = o."externalId"
      WHERE o."tenantId" = ${tenantId} AND o.provider = ${provider} AND o.active = true
        AND (o.price > 0 OR o."finalPrice" > 0)
      GROUP BY c.category`;
    const byKey = new Map<string, { label: string; labelCount: number; products: number }>();
    for (const g of grouped) {
      const key = saleCategoryKey(g.category);
      if (!key || !g.category) continue;
      const cur = byKey.get(key);
      if (!cur) byKey.set(key, { label: g.category.trim(), labelCount: g.products, products: g.products });
      else {
        cur.products += g.products;
        // El nombre que se muestra es el que más productos tiene.
        if (g.products > cur.labelCount) Object.assign(cur, { label: g.category.trim(), labelCount: g.products });
      }
    }
    if (byKey.size === 0) return [];

    const [rules, samples, enrichment, providerRules] = await Promise.all([
      this.rules.get(tenantId),
      this.samples(tenantId, provider),
      this.enrichment.getContext(),
      this.providers.rulesByProvider(tenantId),
    ]);
    const offerRules = providerRules.get(provider) ?? NO_RULES;
    const rows: SaleMarginCategoryRow[] = [];
    for (const [key, info] of byKey) {
      const own = rules.rules.get(saleRuleKey.category(provider, key));
      const sampleOffer = samples.get(key);
      const { percent, source } = resolveSaleMargin(rules.rules, { provider, externalId: "", category: info.label });
      let sample: SaleMarginCategoryRow["sample"] = null;
      let nodoLabel: string | null = null;
      if (sampleOffer) {
        const view = toProductView(sampleOffer.product, sampleOffer, offerRules);
        // El ejemplo usa el margen de la categoría (no el de un producto puntual).
        const sale = saleOf({ ...view, externalId: "" } as never, rules);
        sample = {
          name: view.name,
          cost: sale?.costFinal ?? view.finalPrice ?? view.price,
          sale: sale?.finalPrice ?? null,
          currency: (view.currency || "USD").toUpperCase(),
        };
        const display = resolveCatalogDisplay(sampleOffer.product, enrichment).displayCategory;
        if (display && saleCategoryKey(display) !== key) nodoLabel = display;
      }
      rows.push({
        key,
        label: info.label,
        nodoLabel,
        products: info.products,
        percent: own ?? null,
        effective: percent,
        source,
        sample,
      });
    }
    return rows.sort((a, b) => b.products - a.products || a.label.localeCompare(b.label));
  }

  /** Un producto por categoría (el de costo mediano) para el ejemplo de la tabla. */
  private async samples(tenantId: string, provider: string) {
    const picks = await this.prisma.$queryRaw<{ id: string; category: string }[]>`
      SELECT DISTINCT ON (lower(c.category)) o.id, c.category
      FROM "TenantProductOffer" o
      JOIN "ProviderSyncCache" c ON c.provider = o.provider AND c."externalId" = o."externalId"
      WHERE o."tenantId" = ${tenantId} AND o.provider = ${provider} AND o.active = true
        AND o.price > 0 AND c.category IS NOT NULL
      ORDER BY lower(c.category), o.price`;
    if (picks.length === 0) return new Map();
    const offers = await this.prisma.tenantProductOffer.findMany({
      where: { id: { in: picks.map((p) => p.id) } },
      include: { product: true },
    });
    const out = new Map<string, (typeof offers)[number]>();
    for (const offer of offers) {
      const key = saleCategoryKey(offer.product.category);
      if (key && !out.has(key)) out.set(key, offer);
    }
    return out;
  }

  private async categoryRawLabels(tenantId: string, provider: string): Promise<Map<string, string[]>> {
    const rows = await this.prisma.$queryRaw<{ category: string }[]>`
      SELECT DISTINCT c.category AS category
      FROM "TenantProductOffer" o
      JOIN "ProviderSyncCache" c ON c.provider = o.provider AND c."externalId" = o."externalId"
      WHERE o."tenantId" = ${tenantId} AND o.provider = ${provider} AND c.category IS NOT NULL`;
    const out = new Map<string, string[]>();
    for (const r of rows) {
      const key = saleCategoryKey(r.category);
      if (!key) continue;
      out.set(key, [...(out.get(key) ?? []), r.category]);
    }
    return out;
  }

  private async categoryLabels(tenantId: string, provider: string): Promise<Map<string, string>> {
    const raw = await this.categoryRawLabels(tenantId, provider);
    return new Map([...raw.entries()].map(([key, labels]) => [key, labels[0].trim()]));
  }

  /** Nombres legibles para el historial: categoría guardada o nombre del producto. */
  private async historyLabels(tenantId: string, ruleKeys: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const unique = [...new Set(ruleKeys)];
    const rules = await this.prisma.saleMarginRule.findMany({
      where: { tenantId, ruleKey: { in: unique }, scope: "CATEGORY" },
      select: { ruleKey: true, categoryLabel: true },
    });
    for (const r of rules) if (r.categoryLabel) out.set(r.ruleKey, r.categoryLabel);
    const products = unique.map(parseRuleKey).filter((p) => p.scope === "PRODUCT" && p.provider && p.id);
    if (products.length > 0) {
      const fichas = await this.prisma.providerSyncCache.findMany({
        where: { OR: products.map((p) => ({ provider: p.provider as string, externalId: p.id as string })) },
        select: { provider: true, externalId: true, name: true },
      });
      for (const f of fichas) out.set(saleRuleKey.product(f.provider, f.externalId), f.name);
    }
    return out;
  }
}

/** Lee una clave de regla (`saleRuleKey`). */
export function parseRuleKey(ruleKey: string): {
  scope: SaleMarginScope;
  provider: string | null;
  id: string | null;
  fallbackLabel: string;
} {
  if (ruleKey === "STORE") return { scope: "STORE", provider: null, id: null, fallbackLabel: "Todo el comercio" };
  const [kind, provider, ...rest] = ruleKey.split(":");
  const id = rest.join(":") || null;
  if (kind === "P") return { scope: "PROVIDER", provider, id: null, fallbackLabel: "Todo el distribuidor" };
  if (kind === "C") return { scope: "CATEGORY", provider, id, fallbackLabel: id ?? "Categoría" };
  return { scope: "PRODUCT", provider, id, fallbackLabel: id ?? "Producto" };
}
