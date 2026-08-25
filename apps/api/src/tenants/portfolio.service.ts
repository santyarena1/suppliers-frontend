import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  PROVIDER_LABELS,
  TENANT_ROLES_CAN_MANAGE_DISTRIBUTOR,
  TENANT_ROLES_CAN_SEE_PORTFOLIO,
  TENANT_ROLES_INVITABLE_DISTRIBUTOR,
  type Provider,
  type TenantRole,
} from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateClientLinkDto } from "./dto/tenant.dto";
import { assertTenantRole, assertTenantType } from "./tenant-roles";
import type { TenantContext } from "./tenant-context.service";

const LINK_INCLUDE = {
  clientTenant: {
    select: { id: true, name: true, contactEmail: true, contactPhone: true, type: true },
  },
  accountManager: { select: { id: true, username: true, email: true } },
} satisfies Prisma.TenantLinkInclude;

/**
 * Cartera del distribuidor: clientes, descuento, vendedor asignado y pedidos
 * que esos comercios le hicieron. Ver docs/PLAN_TIPO2.md.
 */
@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  async listClients(tenant: TenantContext, userId: string) {
    this.assertCanSeePortfolio(tenant);
    const [links, providerKey, sellers] = await Promise.all([
      this.prisma.tenantLink.findMany({
        where: this.linksWhere(tenant, userId),
        include: LINK_INCLUDE,
        orderBy: { createdAt: "desc" },
      }),
      this.providerKeyOf(tenant.tenantId),
      this.isManager(tenant) ? this.listAssignableSellers(tenant.tenantId) : Promise.resolve([]),
    ]);

    const summaries = await this.orderSummaries(
      links.map((link) => link.clientTenantId),
      providerKey
    );
    const lastMessages = await this.lastMessages(links.map((link) => link.id));

    return {
      providerName: tenant.tenantName,
      canAssignSeller: this.isManager(tenant),
      canEditDiscount: tenant.tenantRole !== "VIEWER",
      sellers,
      clients: links.map((link) =>
        this.serializeClient(link, summaries.get(link.clientTenantId), lastMessages.get(link.id), tenant)
      ),
    };
  }

  async getClient(tenant: TenantContext, userId: string, linkId: string) {
    this.assertCanSeePortfolio(tenant);
    const link = await this.requireLink(tenant, userId, linkId);
    const providerKey = await this.providerKeyOf(tenant.tenantId);
    const [summary, lastMessage, orders, sellers] = await Promise.all([
      this.orderSummaries([link.clientTenantId], providerKey),
      this.lastMessages([link.id]),
      this.ordersOf(link.clientTenantId, providerKey, 20),
      this.isManager(tenant) ? this.listAssignableSellers(tenant.tenantId) : Promise.resolve([]),
    ]);
    return {
      ...this.serializeClient(link, summary.get(link.clientTenantId), lastMessage.get(link.id), tenant),
      canAssignSeller: this.isManager(tenant),
      canEditDiscount: tenant.tenantRole !== "VIEWER",
      sellers,
      orders,
    };
  }

  async updateClient(tenant: TenantContext, userId: string, linkId: string, dto: UpdateClientLinkDto) {
    this.assertCanSeePortfolio(tenant);
    if (tenant.tenantRole === "VIEWER") {
      throw new ForbiddenException(`Tu rol en ${tenant.tenantName} es de solo lectura`);
    }
    const link = await this.requireLink(tenant, userId, linkId);

    if (dto.accountManagerId !== undefined) {
      assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_DISTRIBUTOR);
      if (dto.accountManagerId) await this.assertAssignableSeller(tenant.tenantId, dto.accountManagerId);
    }

    const updated = await this.prisma.tenantLink.update({
      where: { id: link.id },
      data: {
        ...(dto.accountManagerId === undefined ? {} : { accountManagerId: dto.accountManagerId }),
        ...(dto.discountPercent === undefined ? {} : { discountPercent: dto.discountPercent }),
        ...(dto.notes === undefined ? {} : { notes: dto.notes }),
      },
      include: LINK_INCLUDE,
    });
    const providerKey = await this.providerKeyOf(tenant.tenantId);
    const [summary, lastMessage] = await Promise.all([
      this.orderSummaries([updated.clientTenantId], providerKey),
      this.lastMessages([updated.id]),
    ]);
    return this.serializeClient(updated, summary.get(updated.clientTenantId), lastMessage.get(updated.id), tenant);
  }

  async listClientOrders(tenant: TenantContext, userId: string, linkId?: string) {
    this.assertCanSeePortfolio(tenant);
    const providerKey = await this.providerKeyOf(tenant.tenantId);
    if (!providerKey) return [];

    const links = await this.prisma.tenantLink.findMany({
      where: {
        ...this.linksWhere(tenant, userId),
        ...(linkId ? { id: linkId } : {}),
      },
      select: { id: true, clientTenantId: true, clientTenant: { select: { name: true } } },
    });
    if (linkId && links.length === 0) throw new NotFoundException("Cliente no encontrado");

    const byTenant = new Map(links.map((link) => [link.clientTenantId, link]));
    const rows = await this.prisma.providerOrder.findMany({
      where: {
        tenantId: { in: [...byTenant.keys()] },
        provider: providerKey,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { createdBy: { select: { username: true } } },
    });

    return rows.map((row) => {
      const link = byTenant.get(row.tenantId);
      const items = Array.isArray(row.items) ? row.items : [];
      return {
        id: row.id,
        linkId: link?.id ?? null,
        commerceName: link?.clientTenant.name ?? "Comercio",
        status: row.status,
        approvalStatus: row.approvalStatus,
        total: row.total == null ? null : Number(row.total),
        itemsCount: items.length,
        createdBy: row.createdBy?.username ?? null,
        createdAt: row.createdAt.toISOString(),
        providerName: PROVIDER_LABELS[row.provider as Provider] ?? tenant.tenantName,
      };
    });
  }

  async listAccessCodes(tenant: TenantContext) {
    assertTenantType(tenant, ["DISTRIBUTOR", "BRAND"]);
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_DISTRIBUTOR);
    const codes = await this.prisma.tenantAccessCode.findMany({
      where: { tenantId: tenant.tenantId },
      include: { redemptions: true },
      orderBy: { createdAt: "desc" },
    });
    const commerceIds = [...new Set(codes.flatMap((code) => code.redemptions.map((row) => row.redeemedByTenantId)))];
    const commerces = commerceIds.length
      ? await this.prisma.tenant.findMany({
          where: { id: { in: commerceIds } },
          select: { id: true, name: true },
        })
      : [];
    const names = new Map(commerces.map((row) => [row.id, row.name]));
    return codes.map((code) => ({
      id: code.id,
      code: code.code,
      label: code.label,
      maxUses: code.maxUses,
      usedCount: code.usedCount,
      expiresAt: code.expiresAt?.toISOString() ?? null,
      revoked: code.revoked,
      createdAt: code.createdAt.toISOString(),
      redemptions: code.redemptions.map((row) => ({
        redeemedAt: row.redeemedAt.toISOString(),
        commerceName: names.get(row.redeemedByTenantId) ?? "Comercio",
      })),
    }));
  }

  async setAdvertising(tenant: TenantContext, advertisingEnabled: boolean) {
    assertTenantType(tenant, ["DISTRIBUTOR", "BRAND"]);
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_DISTRIBUTOR);
    const row = await this.prisma.tenant.update({
      where: { id: tenant.tenantId },
      data: { advertisingEnabled },
      select: { advertisingEnabled: true },
    });
    return row;
  }

  assertInvitableRole(tenant: TenantContext, role: TenantRole) {
    if (tenant.tenantType !== "DISTRIBUTOR") return;
    if ((TENANT_ROLES_INVITABLE_DISTRIBUTOR as readonly string[]).includes(role)) return;
    throw new BadRequestException("Ese rol no se invita desde acá");
  }

  private assertCanSeePortfolio(tenant: TenantContext) {
    assertTenantType(tenant, ["DISTRIBUTOR"]);
    if (tenant.tenantRole === "PRODUCT_MANAGER") {
      throw new ForbiddenException("El Product Manager no entra a la cartera");
    }
    assertTenantRole(tenant, TENANT_ROLES_CAN_SEE_PORTFOLIO);
  }

  private isManager(tenant: TenantContext) {
    return (TENANT_ROLES_CAN_MANAGE_DISTRIBUTOR as readonly string[]).includes(tenant.tenantRole);
  }

  private linksWhere(tenant: TenantContext, userId: string): Prisma.TenantLinkWhereInput {
    const base: Prisma.TenantLinkWhereInput = {
      supplierTenantId: tenant.tenantId,
      status: { not: "REVOKED" },
    };
    if (tenant.tenantRole === "SELLER") {
      return { ...base, accountManagerId: userId };
    }
    return base;
  }

  private async requireLink(tenant: TenantContext, userId: string, linkId: string) {
    const link = await this.prisma.tenantLink.findFirst({
      where: { id: linkId, ...this.linksWhere(tenant, userId) },
      include: LINK_INCLUDE,
    });
    if (!link) throw new NotFoundException("Cliente no encontrado");
    return link;
  }

  private async providerKeyOf(tenantId: string) {
    const row = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { providerKey: true },
    });
    return row?.providerKey ?? null;
  }

  private async listAssignableSellers(tenantId: string) {
    const members = await this.prisma.tenantMembership.findMany({
      where: {
        tenantId,
        active: true,
        role: { in: ["OWNER", "ADMIN", "SELLER"] },
        user: { active: true },
      },
      include: { user: { select: { id: true, username: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return members.map((member) => ({
      id: member.user.id,
      username: member.user.username,
      email: member.user.email,
      role: member.role,
    }));
  }

  private async assertAssignableSeller(tenantId: string, userId: string) {
    const membership = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!membership?.active || !["OWNER", "ADMIN", "SELLER"].includes(membership.role)) {
      throw new BadRequestException("Esa persona no puede ser el vendedor de un cliente");
    }
  }

  private async orderSummaries(clientIds: string[], providerKey: string | null) {
    const map = new Map<string, { total: number; lastOrderAt: string | null; pendingApproval: number }>();
    for (const id of clientIds) {
      map.set(id, { total: 0, lastOrderAt: null, pendingApproval: 0 });
    }
    if (!providerKey || clientIds.length === 0) return map;

    const grouped = await this.prisma.providerOrder.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: clientIds }, provider: providerKey },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const pending = await this.prisma.providerOrder.groupBy({
      by: ["tenantId"],
      where: {
        tenantId: { in: clientIds },
        provider: providerKey,
        approvalStatus: "PENDING_APPROVAL",
      },
      _count: { _all: true },
    });
    const pendingBy = new Map(pending.map((row) => [row.tenantId, row._count._all]));
    for (const row of grouped) {
      map.set(row.tenantId, {
        total: row._count._all,
        lastOrderAt: row._max.createdAt?.toISOString() ?? null,
        pendingApproval: pendingBy.get(row.tenantId) ?? 0,
      });
    }
    return map;
  }

  private async lastMessages(linkIds: string[]) {
    const map = new Map<string, { body: string; createdAt: string; senderTenantId: string }>();
    if (linkIds.length === 0) return map;
    const rows = await Promise.all(
      linkIds.map((linkId) =>
        this.prisma.tenantLinkMessage.findFirst({
          where: { linkId },
          orderBy: { createdAt: "desc" },
          select: { linkId: true, body: true, createdAt: true, senderTenantId: true },
        })
      )
    );
    for (const row of rows) {
      if (!row) continue;
      map.set(row.linkId, {
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        senderTenantId: row.senderTenantId,
      });
    }
    return map;
  }

  private async ordersOf(clientTenantId: string, providerKey: string | null, take: number) {
    if (!providerKey) return [];
    const rows = await this.prisma.providerOrder.findMany({
      where: { tenantId: clientTenantId, provider: providerKey },
      orderBy: { createdAt: "desc" },
      take,
      include: { createdBy: { select: { username: true } } },
    });
    return rows.map((row) => {
      const items = Array.isArray(row.items) ? row.items : [];
      return {
        id: row.id,
        status: row.status,
        approvalStatus: row.approvalStatus,
        total: row.total == null ? null : Number(row.total),
        itemsCount: items.length,
        createdBy: row.createdBy?.username ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  private serializeClient(
    link: {
      id: string;
      status: string;
      discountPercent: Prisma.Decimal | null;
      notes: string | null;
      clientTenant: { id: string; name: string; contactEmail: string | null; contactPhone: string | null };
      accountManager: { id: string; username: string; email: string } | null;
    },
    summary: { total: number; lastOrderAt: string | null; pendingApproval: number } | undefined,
    lastMessage: { body: string; createdAt: string; senderTenantId: string } | undefined,
    tenant: TenantContext
  ) {
    return {
      linkId: link.id,
      status: link.status,
      discountPercent: link.discountPercent == null ? null : Number(link.discountPercent),
      notes: link.notes,
      commerce: {
        id: link.clientTenant.id,
        name: link.clientTenant.name,
        contactEmail: link.clientTenant.contactEmail,
        contactPhone: link.clientTenant.contactPhone,
      },
      accountManager: link.accountManager,
      orderSummary: summary ?? { total: 0, lastOrderAt: null, pendingApproval: 0 },
      lastMessage: lastMessage
        ? {
            body: lastMessage.body,
            createdAt: lastMessage.createdAt,
            fromUs: lastMessage.senderTenantId === tenant.tenantId,
          }
        : null,
    };
  }
}
