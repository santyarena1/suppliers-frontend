import { Injectable } from "@nestjs/common";
import { fichaRaw } from "../../providers/catalog-view";
import { PrismaService } from "../../prisma/prisma.service";
import type { ApiPrincipal } from "../auth/api-principal";
import { Errors } from "./api-error";
import { CatalogQueryService } from "./catalog-query.service";
import { FxService } from "./fx.service";
import { slugId } from "./ids";
import { makeConverter, priceOffer } from "./pricing";

const HISTORY_DAYS = 365;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Taxonomía, distribuidores, historial de precio y datos de la key. */
@Injectable()
export class CatalogInfoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogQueryService,
    private readonly fx: FxService
  ) {}

  async me(principal: ApiPrincipal) {
    const { view, groups, meta } = await this.catalog.allForKey(principal);
    const providers = new Set(view.rows.map((r) => r.row.provider));
    return {
      key: {
        id: principal.clientId,
        name: principal.clientName,
        publicKey: principal.publicKey,
        scopes: principal.scopes,
        rateLimitPerMinute: principal.rateLimitPerMinute,
        createdAt: principal.createdAt.toISOString(),
        expiresAt: principal.expiresAt?.toISOString() ?? null,
      },
      organization: { name: principal.tenantName, plan: principal.plan },
      config: principal.config,
      catalog: { offers: view.rows.length, products: groups().length, providers: providers.size, catalogAt: meta.catalogAt },
    };
  }

  async brands(principal: ApiPrincipal) {
    const { groups } = await this.catalog.allForKey(principal);
    const counts = new Map<string, number>();
    for (const g of groups()) {
      const name = g.lead.brand?.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return {
      data: [...counts.entries()]
        .map(([name, products]) => ({ id: slugId("brd", name), name, products }))
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    };
  }

  /** Árbol categoría → subcategoría con la cantidad de productos agrupados. */
  async categories(principal: ApiPrincipal) {
    const { groups } = await this.catalog.allForKey(principal);
    const tree = new Map<string, { products: number; subs: Map<string, number> }>();
    for (const g of groups()) {
      const cat = g.lead.category?.trim();
      if (!cat) continue;
      const node = tree.get(cat) ?? { products: 0, subs: new Map<string, number>() };
      node.products += 1;
      const sub = g.lead.subcategory?.trim();
      if (sub) node.subs.set(sub, (node.subs.get(sub) ?? 0) + 1);
      tree.set(cat, node);
    }
    return {
      data: [...tree.entries()]
        .map(([name, node]) => ({
          id: slugId("cat", name),
          name,
          products: node.products,
          subcategories: [...node.subs.entries()]
            .map(([sub, products]) => ({ id: slugId("cat", `${name}>${sub}`), name: sub, products }))
            .sort((a, b) => a.name.localeCompare(b.name, "es")),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    };
  }

  async providers(principal: ApiPrincipal) {
    const { view } = await this.catalog.allForKey(principal);
    const snapshot = await this.catalog.snapshotFor(principal);
    const offers = new Map<string, number>();
    for (const { row } of view.rows) offers.set(row.provider, (offers.get(row.provider) ?? 0) + 1);
    const visible = principal.config.providerIdentity === "visible";
    const selected = (key: string) => principal.config.providers.mode === "all" || principal.config.providers.keys.includes(key);
    return {
      data: [...snapshot.providers.values()]
        .filter((p) => selected(p.key))
        .map((p) => ({
          id: p.aliasId,
          name: visible ? p.name : p.aliasName,
          ...(visible ? { key: p.key } : {}),
          offers: offers.get(p.key) ?? 0,
          lastSyncedAt: p.lastSyncedAt?.toISOString() ?? null,
          status: p.status,
          stale: p.stale,
        })),
    };
  }

  async fxRates(principal: ApiPrincipal) {
    const snap = await this.fx.snapshot();
    return {
      rates: snap.rates,
      at: snap.at?.toISOString() ?? null,
      stale: snap.stale,
      key: await this.catalog.fxFor(principal.config),
    };
  }

  /** Cambios de precio de una oferta (12 meses), en la moneda de la key. */
  async priceHistory(principal: ApiPrincipal, offerId: string) {
    const { view, meta } = await this.catalog.allForKey(principal);
    const hit = view.rows.find((r) => r.row.offerId === offerId);
    if (!hit) throw Errors.notFound("La oferta");
    const row = hit.row;
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
    const points = await this.prisma.productPriceHistory.findMany({
      where: { tenantId: principal.catalogTenantId, provider: row.provider, externalId: row.externalId, capturedAt: { gte: since } },
      orderBy: { capturedAt: "asc" },
      select: { capturedAt: true, price: true, currency: true },
    });
    const convert = makeConverter(principal.config.price.currency, meta.fx.rate);
    // La venta del historial guarda la relación venta/costo de hoy (margen y base vigentes).
    const today = priceOffer(
      { currency: row.currency, costNet: row.costNet, costTaxes: row.costTaxes, providerMarginPercent: row.saleMarginPercent, marginBase: row.saleMarginBase, source: row.source },
      { ...principal.config.price, includeCost: true, includeSalePrice: true, includeTaxes: false, rounding: "none" },
      convert
    );
    const saleRatio = today?.cost?.net && today.sale ? today.sale.net / today.cost.net : 1;
    return {
      data: points.map((p) => {
        const net = p.price == null ? null : convert(Number(p.price), p.currency ?? row.currency);
        return {
          at: p.capturedAt.toISOString(),
          costNet: net == null ? null : round2(net),
          saleNet: net == null ? null : round2(net * saleRatio),
        };
      }),
      meta,
    };
  }

  /**
   * Datos crudos del distribuidor (solo si la key los pide con fields.raw). Sin
   * importes de la cuenta que sincronizó la ficha: esos son de cada comercio.
   */
  async rawFor(provider: string, externalId: string): Promise<unknown> {
    const product = await this.prisma.providerSyncCache.findUnique({
      where: { provider_externalId: { provider, externalId } },
      select: { raw: true },
    });
    return product ? fichaRaw(provider, product.raw) : null;
  }
}
