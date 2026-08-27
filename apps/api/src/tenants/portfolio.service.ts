import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  PROVIDER_LABELS,
  TENANT_ROLES_CAN_MANAGE_PORTFOLIO,
  type Provider,
  type TenantRole,
} from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateOwnClientDto } from "./dto/tenant.dto";
import {
  canEditClientTerms,
  clientIsInactive,
  clientLinkVisibleTo,
  orderMatchesPmScope,
} from "./portfolio";
import type { TenantContext } from "./tenant-context.service";

const LINK_INCLUDE = {
  clientTenant: { select: { id: true, name: true, type: true, contactEmail: true, contactPhone: true } },
  accountManager: { select: { id: true, username: true, email: true } },
} satisfies Prisma.TenantLinkInclude;

@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  async listClients(tenant: TenantContext) {
    this.assertDistributor(tenant);
    const [links, sellers] = await Promise.all([
      this.prisma.tenantLink.findMany({
        where: { supplierTenantId: tenant.tenantId },
        include: LINK_INCLUDE,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.tenantMembership.findMany({
        where: {
          tenantId: tenant.tenantId,
          active: true,
          role: { in: ["OWNER", "ADMIN", "SELLER"] },
          user: { active: true },
        },
        include: { user: { select: { id: true, username: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const visible = links.filter((link) =>
      clientLinkVisibleTo(link, { tenantRole: tenant.tenantRole, userId: tenant.userId })
    );
    const clientIds = visible.map((link) => link.clientTenantId);
    const orderStats = await this.orderStatsFor(tenant, clientIds);

    return {
      canManage: TENANT_ROLES_CAN_MANAGE_PORTFOLIO.includes(tenant.tenantRole),
      canAssignSeller: TENANT_ROLES_CAN_MANAGE_PORTFOLIO.includes(tenant.tenantRole),
      canEditTerms: canEditClientTerms(tenant.tenantRole),
      sellers: sellers.map((membership) => ({
        userId: membership.user.id,
        username: membership.user.username,
        email: membership.user.email,
        tenantRole: membership.role as TenantRole,
        title: membership.title,
      })),
      clients: visible.map((link) => {
        const stats = orderStats.get(link.clientTenantId) ?? { count: 0, lastAt: null, lastTotal: null };
        return {
          ...this.serializeClient(link),
          ordersCount: stats.count,
          lastOrderAt: stats.lastAt,
          lastOrderTotal: stats.lastTotal,
          inactive: clientIsInactive(link.status, stats.lastAt),
        };
      }),
    };
  }

  async getClient(tenant: TenantContext, linkId: string) {
    const link = await this.requireClientLink(tenant, linkId);
    const orders = await this.ordersOf(tenant, link.clientTenantId);
    const last = orders[0];
    return {
      ...this.serializeClient(link),
      ordersCount: orders.length,
      lastOrderAt: last?.createdAt ?? null,
      lastOrderTotal: last?.total ?? null,
      inactive: clientIsInactive(link.status, last?.createdAt ?? null),
      canEditTerms: canEditClientTerms(tenant.tenantRole),
      canAssignSeller: TENANT_ROLES_CAN_MANAGE_PORTFOLIO.includes(tenant.tenantRole),
      orders,
    };
  }

  async updateClient(tenant: TenantContext, linkId: string, dto: UpdateOwnClientDto) {
    const link = await this.requireClientLink(tenant, linkId);
    const sellerOnly = tenant.tenantRole === "SELLER";
    if (sellerOnly) {
      if (dto.accountManagerId !== undefined || dto.status !== undefined) {
        throw new ForbiddenException("Un vendedor no reasigna cuentas ni cambia el estado del vínculo");
      }
    } else if (!TENANT_ROLES_CAN_MANAGE_PORTFOLIO.includes(tenant.tenantRole)) {
      throw new ForbiddenException("No podés editar la cartera");
    }

    if (dto.accountManagerId) {
      const member = await this.prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: tenant.tenantId, userId: dto.accountManagerId } },
      });
      if (!member) throw new BadRequestException("El vendedor no pertenece a tu organización");
    }

    const updated = await this.prisma.tenantLink.update({
      where: { id: link.id },
      data: {
        ...(dto.accountManagerId === undefined ? {} : { accountManagerId: dto.accountManagerId }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.discountPercent === undefined ? {} : { discountPercent: dto.discountPercent }),
        ...(dto.notes === undefined ? {} : { notes: dto.notes }),
      },
      include: LINK_INCLUDE,
    });
    return this.serializeClient(updated);
  }

  async listClientOrders(tenant: TenantContext, linkId?: string) {
    this.assertDistributor(tenant);
    if (linkId) {
      const link = await this.requireClientLink(tenant, linkId);
      return this.ordersOf(tenant, link.clientTenantId);
    }
    const links = await this.prisma.tenantLink.findMany({
      where: { supplierTenantId: tenant.tenantId },
      select: { clientTenantId: true, accountManagerId: true, clientTenant: { select: { id: true, name: true } } },
    });
    const visible = links.filter((link) =>
      clientLinkVisibleTo(link, { tenantRole: tenant.tenantRole, userId: tenant.userId })
    );
    const byClient = new Map(visible.map((link) => [link.clientTenantId, link.clientTenant.name]));
    const rows = await this.prisma.providerOrder.findMany({
      where: { tenantId: { in: [...byClient.keys()] } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        createdBy: { select: { username: true } },
        approvedBy: { select: { username: true } },
      },
    });
    const filtered = await this.filterOrdersForPm(tenant, rows);
    return filtered.map((row) => ({
      ...this.serializeOrder(row),
      clientName: byClient.get(row.tenantId) ?? null,
    }));
  }

  private assertDistributor(tenant: TenantContext) {
    if (tenant.tenantType !== "DISTRIBUTOR") {
      throw new ForbiddenException("La cartera es del distribuidor");
    }
  }

  private async requireClientLink(tenant: TenantContext, linkId: string) {
    this.assertDistributor(tenant);
    const link = await this.prisma.tenantLink.findUnique({
      where: { id: linkId },
      include: LINK_INCLUDE,
    });
    if (!link || link.supplierTenantId !== tenant.tenantId) {
      throw new NotFoundException("Cliente no encontrado");
    }
    if (!clientLinkVisibleTo(link, { tenantRole: tenant.tenantRole, userId: tenant.userId })) {
      throw new NotFoundException("Cliente no encontrado");
    }
    return link;
  }

  private serializeClient(
    link: Prisma.TenantLinkGetPayload<{ include: typeof LINK_INCLUDE }>
  ) {
    return {
      linkId: link.id,
      status: link.status,
      discountPercent: link.discountPercent == null ? null : Number(link.discountPercent),
      notes: link.notes,
      accountManager: link.accountManager,
      client: link.clientTenant,
    };
  }

  private async orderStatsFor(tenant: TenantContext, clientIds: string[]) {
    const stats = new Map<string, { count: number; lastAt: string | null; lastTotal: number | null }>();
    if (clientIds.length === 0) return stats;

    if (tenant.tenantRole === "PRODUCT_MANAGER") {
      const rows = await this.prisma.providerOrder.findMany({
        where: { tenantId: { in: clientIds } },
        orderBy: { createdAt: "desc" },
        take: 1000,
        select: { id: true, tenantId: true, provider: true, items: true, createdAt: true, total: true },
      });
      const filtered = await this.filterOrdersForPm(tenant, rows);
      for (const row of filtered) {
        const current = stats.get(row.tenantId);
        if (!current) {
          stats.set(row.tenantId, {
            count: 1,
            lastAt: row.createdAt.toISOString(),
            lastTotal: row.total == null ? null : Number(row.total),
          });
        } else {
          current.count += 1;
        }
      }
      return stats;
    }

    const grouped = await this.prisma.providerOrder.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: clientIds } },
      _count: { id: true },
      _max: { createdAt: true },
    });
    const lastIds = grouped
      .map((row) => row._max.createdAt)
      .filter((value): value is Date => value != null);
    const lasts =
      lastIds.length === 0
        ? []
        : await this.prisma.providerOrder.findMany({
            where: { tenantId: { in: clientIds }, createdAt: { in: lastIds } },
            select: { tenantId: true, createdAt: true, total: true },
          });
    for (const row of grouped) {
      const last = lasts
        .filter((order) => order.tenantId === row.tenantId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      stats.set(row.tenantId, {
        count: row._count.id,
        lastAt: last?.createdAt.toISOString() ?? null,
        lastTotal: last?.total == null ? null : Number(last.total),
      });
    }
    return stats;
  }

  private async ordersOf(tenant: TenantContext, clientTenantId: string) {
    const rows = await this.prisma.providerOrder.findMany({
      where: { tenantId: clientTenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        createdBy: { select: { username: true } },
        approvedBy: { select: { username: true } },
      },
    });
    const filtered = await this.filterOrdersForPm(tenant, rows);
    return filtered.map((row) => this.serializeOrder(row));
  }

  private async filterOrdersForPm<T extends { tenantId: string; provider: string; items: Prisma.JsonValue }>(
    tenant: TenantContext,
    rows: T[]
  ): Promise<T[]> {
    if (tenant.tenantRole !== "PRODUCT_MANAGER") return rows;
    const scopes = await this.prisma.productManagerScope.findMany({
      where: { tenantId: tenant.tenantId, userId: tenant.userId },
      select: { brandName: true },
    });
    const brandNames = scopes.map((scope) => scope.brandName);
    if (brandNames.length === 0) return [];
    const clientIds = [...new Set(rows.map((row) => row.tenantId))];
    const offers =
      clientIds.length === 0
        ? []
        : await this.prisma.tenantProductOffer.findMany({
            where: {
              tenantId: { in: clientIds },
              product: { OR: brandNames.map((name) => ({ brand: { equals: name, mode: "insensitive" } })) },
            },
            select: { tenantId: true, provider: true, externalId: true },
          });
    const allowedSkuKeys = new Set(offers.map((offer) => `${offer.tenantId}:${offer.provider}:${offer.externalId}`));
    return rows.filter((row) => orderMatchesPmScope(row, brandNames, allowedSkuKeys));
  }

  private serializeOrder(
    row: Prisma.ProviderOrderGetPayload<{
      include: { createdBy: { select: { username: true } }; approvedBy: { select: { username: true } } };
    }>
  ) {
    return {
      id: row.id,
      provider: row.provider,
      providerName: PROVIDER_LABELS[row.provider as Provider] ?? row.provider,
      status: row.status,
      approvalStatus: row.approvalStatus,
      total: row.total == null ? null : Number(row.total),
      createdBy: row.createdBy?.username ?? null,
      approvedBy: row.approvedBy?.username ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
