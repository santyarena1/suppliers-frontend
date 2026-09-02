import { Injectable } from "@nestjs/common";
import type { TenantType } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { commercialId, type TenantContext } from "../tenants/tenant-context.service";
import { authorIdsForViewer } from "./news-visibility";

@Injectable()
export class NewsVisibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async authorIdsFor(tenant: TenantContext): Promise<string[]> {
    const viewerId = commercialId(tenant);
    const viewer = await this.prisma.tenant.findUnique({
      where: { id: viewerId },
      select: { id: true, type: true },
    });
    const viewerType = (viewer?.type ?? tenant.tenantType) as TenantType;

    const [supplierLinks, clientLinks, advertised] = await Promise.all([
      this.prisma.tenantLink.findMany({
        where: {
          clientTenantId: viewerId,
          status: { in: ["ACTIVE", "SUSPENDED"] },
          supplierTenant: { active: true, type: { in: ["DISTRIBUTOR", "BRAND"] } },
        },
        select: { supplierTenantId: true, supplierTenant: { select: { type: true } } },
      }),
      this.prisma.tenantLink.findMany({
        where: {
          supplierTenantId: viewerId,
          status: { in: ["ACTIVE", "SUSPENDED"] },
          clientTenant: { active: true, type: "DISTRIBUTOR" },
        },
        select: { clientTenantId: true },
      }),
      viewerType === "RETAILER" ? this.advertisedAuthorIds() : Promise.resolve([] as string[]),
    ]);

    const linkedSupplierIds =
      viewerType === "DISTRIBUTOR"
        ? supplierLinks.filter((l) => l.supplierTenant.type === "BRAND").map((l) => l.supplierTenantId)
        : supplierLinks.map((l) => l.supplierTenantId);

    return authorIdsForViewer(viewerType, {
      ownId: tenant.tenantId,
      linkedSupplierIds,
      linkedClientDistributorIds: clientLinks.map((l) => l.clientTenantId),
      advertisedAuthorIds: advertised,
    });
  }

  async linkedSupplierIds(viewerTenantId: string): Promise<Set<string>> {
    const links = await this.prisma.tenantLink.findMany({
      where: {
        clientTenantId: viewerTenantId,
        status: { in: ["ACTIVE", "SUSPENDED"] },
      },
      select: { supplierTenantId: true },
    });
    return new Set(links.map((l) => l.supplierTenantId));
  }

  private async advertisedAuthorIds() {
    const now = new Date();
    const rows = await this.prisma.adCampaign.findMany({
      where: {
        status: "ACTIVE",
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        slot: { enabled: true },
        tenant: { active: true, advertisingEnabled: true, type: { in: ["DISTRIBUTOR", "BRAND"] } },
      },
      select: { tenantId: true },
    });
    return [...new Set(rows.map((r) => r.tenantId))];
  }
}
