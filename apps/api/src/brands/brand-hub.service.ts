import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { compileBrandHtml } from "./brand-html";
import { BrandActionsService } from "./brand-actions.service";
import { BrandItemsService } from "./brand-items.service";
import { BrandLaunchesService } from "./brand-launches.service";
import { brandPresence, hasBrandContact, hasBrandSpace } from "./brand-presence";

@Injectable()
export class BrandHubService {
  private readonly logger = new Logger(BrandHubService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly actions: BrandActionsService,
    private readonly items: BrandItemsService,
    private readonly launches: BrandLaunchesService
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
    const [actionRows, availability, resources, news] = await Promise.all([
      this.prisma.brandAction.findMany({
        where: {
          tenantId: brandId,
          status: "ACTIVE",
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
        include: { scopes: true },
      }),
      // El semáforo no puede tumbar el espacio de la marca: si falla, se muestra sin productos.
      this.items.clientViewFor(tenant, brandId).catch((err: unknown) => {
        this.logger.error(`Disponibilidad de la marca ${brandId} para ${tenant.tenantId}: ${String(err)}`);
        return { mode: "AUTO" as const, items: [] };
      }),
      this.prisma.brandResource.findMany({
        where: { tenantId: brandId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.newsArticle.findMany({
        where: {
          tenantId: brandId,
          status: "PUBLISHED",
          publishedAt: { lte: now },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: {
          id: true,
          publicKey: true,
          title: true,
          excerpt: true,
          kind: true,
          coverUrl: true,
          isPublic: true,
          publishedAt: true,
        },
        orderBy: { publishedAt: "desc" },
        take: 8,
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
      signalCount: availability.items.length,
      actionCount: withP.length,
      materialCount: materials.length,
      trainingCount: trainings.length,
      hasContact: hasBrandContact(landing ?? {}),
      hasSpace: hasBrandSpace(landing ?? {}),
    });
    // Lanzamientos y eventos son un extra del espacio: si fallan, el espacio igual abre.
    const [launches, events] = await Promise.all([
      this.launches.launchesFor(brandId, "client").catch((err: unknown) => {
        this.logger.error(`Lanzamientos de la marca ${brandId}: ${String(err)}`);
        return [];
      }),
      this.launches.eventsFor(brandId, "client").catch((err: unknown) => {
        this.logger.error(`Eventos de la marca ${brandId}: ${String(err)}`);
        return [];
      }),
    ]);
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
      availability: availability.items,
      launches,
      events,
      stockMode: availability.mode,
      materials,
      trainings,
      news: news.map((row) => ({
        id: row.id,
        publicKey: row.publicKey,
        title: row.title,
        excerpt: row.excerpt,
        kind: row.kind,
        coverUrl: row.coverUrl,
        isPublic: row.isPublic,
        publishedAt: row.publishedAt?.toISOString() ?? null,
      })),
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
