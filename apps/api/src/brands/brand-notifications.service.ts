import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { OrgNotificationKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";

@Injectable()
export class BrandNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notifyMany(params: {
    toTenantIds: string[];
    fromTenantId?: string | null;
    kind: OrgNotificationKind;
    title: string;
    body: string;
    actionId?: string | null;
    landingKey?: string | null;
  }) {
    const ids = [...new Set(params.toTenantIds.filter(Boolean))];
    if (ids.length === 0) return { created: 0 };
    await this.prisma.orgNotification.createMany({
      data: ids.map((toTenantId) => ({
        toTenantId,
        fromTenantId: params.fromTenantId ?? null,
        kind: params.kind,
        title: params.title,
        body: params.body,
        actionId: params.actionId ?? null,
        landingKey: params.landingKey ?? null,
      })),
    });
    return { created: ids.length };
  }

  async listForRetailer(tenant: TenantContext) {
    if (tenant.tenantType !== "RETAILER") {
      throw new ForbiddenException("Los avisos son del comercio");
    }
    return this.prisma.orgNotification.findMany({
      where: { toTenantId: tenant.tenantId },
      include: { fromTenant: { select: { id: true, name: true, type: true } } },
      orderBy: { createdAt: "desc" },
      take: 80,
    });
  }

  async markRead(tenant: TenantContext, id: string) {
    if (tenant.tenantType !== "RETAILER") {
      throw new ForbiddenException("Los avisos son del comercio");
    }
    await this.prisma.orgNotification.updateMany({
      where: { id, toTenantId: tenant.tenantId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  /** Marca o distro avisa a un comercio con el que está vinculado. */
  async sendToRetailer(
    tenant: TenantContext,
    dto: { retailerTenantId: string; title: string; body: string }
  ) {
    if (tenant.tenantType === "RETAILER") {
      throw new ForbiddenException("El comercio no manda avisos a otros comercios");
    }
    if (tenant.tenantRole === "VIEWER") {
      throw new ForbiddenException("No podés mandar avisos");
    }
    const link = await this.prisma.tenantLink.findFirst({
      where: {
        clientTenantId: dto.retailerTenantId,
        supplierTenantId: tenant.tenantId,
        status: { in: ["ACTIVE", "SUSPENDED"] },
      },
    });
    if (!link) throw new BadRequestException("Ese comercio no está vinculado con tu organización");
    const kind: OrgNotificationKind = tenant.tenantType === "BRAND" ? "SYSTEM" : "DISTRIBUTOR_NOTE";
    await this.notifyMany({
      toTenantIds: [dto.retailerTenantId],
      fromTenantId: tenant.tenantId,
      kind,
      title: dto.title.trim(),
      body: dto.body.trim(),
    });
    return { ok: true };
  }
}
