import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PROVIDER_LABELS, type Provider } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { compileBrandHtml } from "./brand-html";
import { BrandActionsService } from "./brand-actions.service";
import { brandPresence, hasBrandContact, hasBrandSpace } from "./brand-presence";

@Injectable()
export class BrandHubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actions: BrandActionsService
  ) {}

  async getForClient(tenant: TenantContext, linkId: string) {
    if (tenant.tenantType !== "RETAILER" && tenant.tenantType !== "DISTRIBUTOR") {
      throw new ForbiddenException("Esto es de quien está vinculado con la marca");
    }
    const link = await this.prisma.tenantLink.findFirst({
      where: {
        id: linkId,
        clientTenantId: tenant.tenantId,
        status: { in: ["ACTIVE", "SUSPENDED"] },
        supplierTenant: { type: "BRAND" },
      },
      include: {
        supplierTenant: {
          select: {
            id: true,
            name: true,
            brandLanding: true,
          },
        },
      },
    });
    if (!link) throw new NotFoundException("Esa marca no está vinculada");
    const brandId = link.supplierTenant.id;
    const landing = link.supplierTenant.brandLanding;
    const now = new Date();
    const [actionRows, signals, resources] = await Promise.all([
      this.prisma.brandAction.findMany({
        where: {
          tenantId: brandId,
          status: "ACTIVE",
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
        include: { scopes: true },
      }),
      this.prisma.brandSkuSignal.findMany({
        where: { tenantId: brandId },
        orderBy: [{ light: "asc" }, { name: "asc" }],
      }),
      this.prisma.brandResource.findMany({
        where: { tenantId: brandId },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const visibleActions = actionRows.filter((row) =>
      this.actionVisible(row.scopes, tenant.tenantId, tenant.tenantType)
    );
    const withP = await Promise.all(visibleActions.map((row) => this.actions.progressForClient(row, tenant.tenantId)));
    const materials = resources.filter((r) => r.kind === "MATERIAL");
    const trainings = resources.filter((r) => r.kind === "TRAINING");
    const compiled = compileBrandHtml(landing?.html ?? "");
    const presence = brandPresence({
      signalCount: signals.length,
      actionCount: withP.length,
      materialCount: materials.length,
      trainingCount: trainings.length,
      hasContact: hasBrandContact(landing ?? {}),
      hasSpace: hasBrandSpace(landing ?? {}),
    });
    return {
      linkId: link.id,
      tenantId: brandId,
      name: link.supplierTenant.name,
      status: link.status,
      connectedAt: link.createdAt.toISOString(),
      presence,
      theme: {
        primaryColor: landing?.primaryColor ?? null,
        backgroundColor: landing?.backgroundColor ?? null,
        textColor: landing?.textColor ?? null,
        fontFamily: landing?.fontFamily ?? null,
        logoUrl: landing?.logoUrl ?? null,
        heroUrl: landing?.heroUrl ?? null,
        headline: landing?.headline ?? link.supplierTenant.name,
        about: landing?.about ?? null,
      },
      contact: {
        websiteUrl: landing?.websiteUrl ?? null,
        supportEmail: landing?.supportEmail ?? null,
        supportPhone: landing?.supportPhone ?? null,
      },
      htmlDocument: compiled.html,
      htmlSlots: compiled.slots,
      htmlParts: compiled.parts,
      actions: withP,
      signals: signals.map((row) => ({
        id: row.id,
        provider: row.provider,
        providerName: PROVIDER_LABELS[row.provider as Provider] ?? row.provider,
        externalId: row.externalId,
        name: row.name,
        sku: row.sku,
        imageUrl: row.imageUrl,
        light: row.light,
        suggestedPrice: row.suggestedPrice == null ? null : Number(row.suggestedPrice),
        qtyEstimate: row.qtyEstimate,
        incomingAt: row.incomingAt?.toISOString() ?? null,
        notes: row.notes,
      })),
      materials,
      trainings,
    };
  }

  private actionVisible(
    scopes: { kind: string; refId: string }[],
    clientId: string,
    clientType: TenantContext["tenantType"]
  ) {
    if (clientType === "RETAILER") {
      const retailers = scopes.filter((s) => s.kind === "RETAILER").map((s) => s.refId);
      return retailers.length === 0 || retailers.includes(clientId);
    }
    const distros = scopes.filter((s) => s.kind === "DISTRIBUTOR").map((s) => s.refId);
    return distros.length === 0 || distros.includes(clientId);
  }
}
