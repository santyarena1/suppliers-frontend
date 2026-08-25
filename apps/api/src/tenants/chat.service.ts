import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TENANT_ROLES_CAN_CHAT, TENANT_TYPE_LABELS } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "./tenant-context.service";

/**
 * Chat de un vínculo: el comercio habla con el mayorista (o la marca) al que
 * está unido. El vendedor del mayorista solo entra a los hilos de *sus*
 * clientes. Ver docs/PLAN_TIPO2.md.
 */
@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenant: TenantContext, userId: string) {
    const links = await this.prisma.tenantLink.findMany({
      where: this.linksWhere(tenant, userId),
      include: {
        clientTenant: { select: { id: true, name: true, type: true } },
        supplierTenant: { select: { id: true, name: true, type: true } },
        accountManager: { select: { id: true, username: true, email: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, createdAt: true, senderTenantId: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return links.map((link) => {
      const other = this.otherSide(tenant, link);
      const last = link.messages[0];
      return {
        linkId: link.id,
        otherName: other.name,
        otherType: other.type,
        otherTypeLabel: TENANT_TYPE_LABELS[other.type as keyof typeof TENANT_TYPE_LABELS] ?? other.type,
        accountManager: link.accountManager,
        lastMessage: last
          ? {
              body: last.body,
              createdAt: last.createdAt.toISOString(),
              fromUs: last.senderTenantId === tenant.tenantId,
            }
          : null,
      };
    });
  }

  async listMessages(tenant: TenantContext, userId: string, linkId: string) {
    const link = await this.requireLink(tenant, userId, linkId);
    const rows = await this.prisma.tenantLinkMessage.findMany({
      where: { linkId: link.id },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: {
        senderUser: { select: { id: true, username: true } },
        senderTenant: { select: { id: true, name: true } },
      },
    });
    return {
      linkId: link.id,
      otherName: this.otherSide(tenant, link).name,
      canWrite: this.canWrite(tenant),
      messages: rows.map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        mine: row.senderTenantId === tenant.tenantId,
        sender: {
          userId: row.senderUser.id,
          username: row.senderUser.username,
          tenantName: row.senderTenant.name,
        },
      })),
    };
  }

  async post(tenant: TenantContext, userId: string, linkId: string, body: string) {
    if (!this.canWrite(tenant)) {
      throw new ForbiddenException(`Tu rol en ${tenant.tenantName} es de solo lectura`);
    }
    const link = await this.requireLink(tenant, userId, linkId);
    const texto = body.trim();
    if (!texto) throw new BadRequestException("El mensaje está vacío");

    const row = await this.prisma.tenantLinkMessage.create({
      data: {
        linkId: link.id,
        senderUserId: userId,
        senderTenantId: tenant.tenantId,
        body: texto.slice(0, 2000),
      },
      include: {
        senderUser: { select: { id: true, username: true } },
        senderTenant: { select: { id: true, name: true } },
      },
    });
    await this.prisma.tenantLink.update({
      where: { id: link.id },
      data: { updatedAt: new Date() },
    });
    return {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      mine: true,
      sender: {
        userId: row.senderUser.id,
        username: row.senderUser.username,
        tenantName: row.senderTenant.name,
      },
    };
  }

  private canWrite(tenant: TenantContext) {
    return (TENANT_ROLES_CAN_CHAT as readonly string[]).includes(tenant.tenantRole);
  }

  private linksWhere(tenant: TenantContext, userId: string) {
    const status = { not: "REVOKED" as const };
    if (tenant.tenantType === "RETAILER") {
      return { clientTenantId: tenant.tenantId, status };
    }
    const base = { supplierTenantId: tenant.tenantId, status };
    if (tenant.tenantRole === "SELLER") {
      return { ...base, accountManagerId: userId };
    }
    if (tenant.tenantRole === "PRODUCT_MANAGER") {
      throw new ForbiddenException("El Product Manager no entra al chat de la cartera");
    }
    return base;
  }

  private async requireLink(tenant: TenantContext, userId: string, linkId: string) {
    const link = await this.prisma.tenantLink.findFirst({
      where: { id: linkId, ...this.linksWhere(tenant, userId) },
      include: {
        clientTenant: { select: { id: true, name: true, type: true } },
        supplierTenant: { select: { id: true, name: true, type: true } },
        accountManager: { select: { id: true, username: true, email: true } },
      },
    });
    if (!link) throw new NotFoundException("Conversación no encontrada");
    return link;
  }

  private otherSide(
    tenant: TenantContext,
    link: {
      clientTenant: { id: string; name: string; type: string };
      supplierTenant: { id: string; name: string; type: string };
    }
  ) {
    return tenant.tenantType === "RETAILER" ? link.supplierTenant : link.clientTenant;
  }
}
