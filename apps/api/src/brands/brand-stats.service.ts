import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { hasPermission } from "../tenants/tenant-roles";
import { PrismaService } from "../prisma/prisma.service";
import { commercialId, type TenantContext } from "../tenants/tenant-context.service";
import { COUNTED_ORDER_STATUSES, MAX_INSIGHT_ORDERS, extractOrderLines } from "../orders/purchase-analytics";
import { BrandItemsService } from "./brand-items.service";
import { brandMatchNames } from "./brand-names";
import { buildSkuIndex, summarizeBrandPurchases, type BrandLine, type BrandSkuIndex } from "./brand-stats";

const MONTH_OPTIONS = [3, 6, 12] as const;
const MAX_CATALOG_SKUS = 10000;

export function statsMonths(raw: unknown): number {
  const n = Number(raw);
  return (MONTH_OPTIONS as readonly number[]).includes(n) ? n : 12;
}

function fromDate(months: number, now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
}

/**
 * Estadísticas de una marca:
 * - el comercio vinculado ve sus propias compras de la marca (cuánto, dónde, qué);
 * - la marca ve lo que compran sus cuentas vinculadas por NODO y su presencia de stock.
 */
@Injectable()
export class BrandStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly items: BrandItemsService
  ) {}

  async forClient(tenant: TenantContext, linkId: string, months: number) {
    if (!hasPermission(tenant, "orders.create")) {
      throw new ForbiddenException("Las compras las ven quienes arman pedidos");
    }
    const link = await this.prisma.tenantLink.findFirst({
      where: {
        id: linkId,
        clientTenantId: tenant.tenantId,
        status: { in: ["ACTIVE", "SUSPENDED"] },
        supplierTenant: { type: "BRAND" },
      },
      select: { supplierTenantId: true },
    });
    if (!link) throw new NotFoundException("Esa marca no está vinculada");
    const now = new Date();
    const from = fromDate(months, now);
    const buyerId = commercialId(tenant);
    const [index, found] = await Promise.all([
      this.skuIndex(link.supplierTenantId),
      this.lines([buyerId], from),
    ]);
    return {
      months,
      truncated: found.truncated || index.truncated,
      ...summarizeBrandPurchases(found.lines, index.index, { from, now }),
    };
  }

  async forBrand(tenant: TenantContext, months: number) {
    if (tenant.tenantType !== "BRAND") throw new ForbiddenException("Esto es del panel de marca");
    const links = await this.prisma.tenantLink.findMany({
      where: { supplierTenantId: tenant.tenantId, status: { in: ["ACTIVE", "SUSPENDED"] } },
      select: { clientTenant: { select: { id: true, name: true, type: true } } },
    });
    const accountNames = new Map(links.map((l) => [l.clientTenant.id, l.clientTenant.name]));
    const now = new Date();
    const from = fromDate(months, now);
    const [index, found, view] = await Promise.all([
      this.skuIndex(tenant.tenantId),
      this.lines([...accountNames.keys()], from),
      this.items.brandView(tenant),
    ]);
    return {
      months,
      linkedAccounts: {
        retailers: links.filter((l) => l.clientTenant.type === "RETAILER").length,
        distributors: links.filter((l) => l.clientTenant.type === "DISTRIBUTOR").length,
      },
      /** Se llegó al tope de pedidos o de códigos: los números pueden estar por debajo. */
      truncated: found.truncated || index.truncated,
      ...summarizeBrandPurchases(found.lines, index.index, { from, now, accountNames }),
      presence: presenceByDistributor(view.items),
    };
  }

  private async skuIndex(brandId: string): Promise<{ index: BrandSkuIndex; truncated: boolean }> {
    const names = await brandMatchNames(this.prisma, brandId);
    const [linked, catalog] = await Promise.all([
      this.prisma.brandItemLink.findMany({
        where: { item: { tenantId: brandId } },
        select: { provider: true, externalId: true, item: { select: { id: true, name: true } } },
      }),
      names.length === 0
        ? Promise.resolve([])
        : this.prisma.providerSyncCache.findMany({
            where: { OR: names.map((name) => ({ brand: { equals: name, mode: "insensitive" as const } })) },
            select: { provider: true, externalId: true },
            take: MAX_CATALOG_SKUS,
          }),
    ]);
    return {
      index: buildSkuIndex(
        linked.map((l) => ({ provider: l.provider, externalId: l.externalId, itemId: l.item.id, itemName: l.item.name })),
        catalog
      ),
      truncated: catalog.length >= MAX_CATALOG_SKUS,
    };
  }

  private async lines(tenantIds: string[], from: Date): Promise<{ lines: BrandLine[]; truncated: boolean }> {
    if (tenantIds.length === 0) return { lines: [], truncated: false };
    const orders = await this.prisma.providerOrder.findMany({
      where: {
        tenantId: { in: tenantIds },
        status: { in: [...COUNTED_ORDER_STATUSES] },
        createdAt: { gte: from },
      },
      select: { id: true, tenantId: true, provider: true, status: true, channel: true, items: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: MAX_INSIGHT_ORDERS,
    });
    const lines = orders.flatMap((order) =>
      extractOrderLines(order).map((l) => ({
        tenantId: order.tenantId,
        orderId: l.orderId,
        provider: l.provider,
        createdAt: l.createdAt,
        sku: l.sku,
        name: l.name,
        qty: l.qty,
        spendUsd: l.spendUsd,
      }))
    );
    return { lines, truncated: orders.length >= MAX_INSIGHT_ORDERS };
  }
}

type Status = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "INCOMING" | "DISCONTINUED" | "UNKNOWN";

/** Presencia por distribuidor: de los productos de la marca, cuántos tiene y con qué stock. */
export function presenceByDistributor(
  items: { state: string | null; distributors: { provider: string; label: string; status: Status }[] }[]
) {
  const byProvider = new Map<string, { label: string; products: number; inStock: number; none: number; unknown: number }>();
  const active = items.filter((i) => i.state !== "DISCONTINUED");
  for (const item of active) {
    for (const d of item.distributors) {
      const row = byProvider.get(d.provider) ?? { label: d.label, products: 0, inStock: 0, none: 0, unknown: 0 };
      row.products += 1;
      if (d.status === "LOW" || d.status === "MEDIUM" || d.status === "HIGH") row.inStock += 1;
      else if (d.status === "NONE") row.none += 1;
      else if (d.status === "UNKNOWN") row.unknown += 1;
      byProvider.set(d.provider, row);
    }
  }
  return {
    products: active.length,
    distributors: [...byProvider.entries()]
      .map(([provider, row]) => ({
        provider,
        ...row,
        coverage: active.length > 0 ? Math.round((row.products / active.length) * 100) : 0,
      }))
      .sort((a, b) => b.inStock - a.inStock || b.products - a.products),
  };
}
