import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { TENANT_ROLES_CAN_MANAGE_PORTFOLIO } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { UpdateAdSlotDto, UpsertAdCampaignDto } from "./dto/ads.dto";
import { DEFAULT_AD_SLOTS } from "./ads.slots";

@Injectable()
export class AdsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureSlots() {
    for (const slot of DEFAULT_AD_SLOTS) {
      await this.prisma.adSlot.upsert({
        where: { key: slot.key },
        create: slot,
        update: {},
      });
    }
  }

  async adminList() {
    await this.ensureSlots();
    const slots = await this.prisma.adSlot.findMany({ orderBy: { monthlyPriceUsd: "desc" } });
    const campaigns = await this.prisma.adCampaign.findMany({
      include: { tenant: { select: { id: true, name: true, type: true } }, slot: true },
      orderBy: { updatedAt: "desc" },
      take: 80,
    });
    const stats = await this.statsFor(campaigns.map((row) => row.id));
    return {
      slots: slots.map((slot) => this.serializeSlot(slot)),
      campaigns: campaigns.map((row) => ({ ...this.serializeCampaign(row), stats: stats.get(row.id) })),
    };
  }

  async adminUpdateSlot(slotId: string, dto: UpdateAdSlotDto) {
    const existing = await this.prisma.adSlot.findUnique({ where: { id: slotId } });
    if (!existing) throw new NotFoundException("Espacio no encontrado");
    const updated = await this.prisma.adSlot.update({
      where: { id: slotId },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.description === undefined ? {} : { description: dto.description }),
        ...(dto.monthlyPriceUsd === undefined ? {} : { monthlyPriceUsd: dto.monthlyPriceUsd }),
        ...(dto.maxConcurrent === undefined ? {} : { maxConcurrent: dto.maxConcurrent }),
        ...(dto.enabled === undefined ? {} : { enabled: dto.enabled }),
      },
    });
    return this.serializeSlot(updated);
  }

  async myOverview(tenant: TenantContext) {
    this.assertAdvertiser(tenant);
    await this.ensureSlots();
    const allowed = await this.tenantPays(tenant.tenantId);
    const slots = await this.prisma.adSlot.findMany({ orderBy: { monthlyPriceUsd: "desc" } });
    const campaigns = await this.prisma.adCampaign.findMany({
      where: { tenantId: tenant.tenantId },
      include: { slot: true },
      orderBy: { updatedAt: "desc" },
    });
    const stats = await this.statsFor(
      campaigns.map((row) => row.id)
    );
    const monthlyDue = campaigns
      .filter((row) => row.status === "ACTIVE")
      .reduce((sum, row) => sum + Number(row.slot.monthlyPriceUsd), 0);
    return {
      allowed,
      monthlyDue,
      slots: slots.map((slot) => this.serializeSlot(slot)),
      campaigns: campaigns.map((row) => ({ ...this.serializeCampaign(row), stats: stats.get(row.id) })),
    };
  }

  async upsertCampaign(tenant: TenantContext, dto: UpsertAdCampaignDto, campaignId?: string) {
    this.assertCanBuy(tenant);
    await this.assertPays(tenant);
    const slot = await this.prisma.adSlot.findUnique({ where: { id: dto.slotId } });
    if (!slot) throw new NotFoundException("Ese espacio no existe");
    if (!slot.enabled) throw new BadRequestException("Ese espacio no está a la venta");

    if (dto.status === "ACTIVE") {
      const taken = await this.prisma.adCampaign.count({
        where: {
          slotId: slot.id,
          status: "ACTIVE",
          ...(campaignId ? { id: { not: campaignId } } : {}),
        },
      });
      if (taken >= slot.maxConcurrent) {
        throw new BadRequestException("Ese espacio ya está ocupado. Pedile otro al administrador o esperá que se libere.");
      }
    }

    if (dto.articleId?.trim()) {
      const article = await this.prisma.newsArticle.findFirst({
        where: { id: dto.articleId.trim(), tenantId: tenant.tenantId },
        select: { id: true, status: true },
      });
      if (!article) throw new BadRequestException("Esa nota no es de tu organización");
      if (slot.key === "news_hero" && article.status !== "PUBLISHED") {
        throw new BadRequestException("El hero de noticias solo admite una nota publicada");
      }
    } else if (slot.key === "news_hero" && dto.status === "ACTIVE") {
      throw new BadRequestException("El hero de noticias necesita una nota publicada");
    }

    const data = {
      tenantId: tenant.tenantId,
      slotId: slot.id,
      title: dto.title.trim(),
      subtitle: (dto.subtitle ?? "").trim(),
      imageUrl: dto.imageUrl ?? null,
      linkUrl: dto.linkUrl ?? null,
      status: dto.status ?? "DRAFT",
      ...(dto.articleId !== undefined ? { articleId: dto.articleId?.trim() || null } : {}),
    };

    const row = campaignId
      ? await this.prisma.adCampaign.update({
          where: { id: await this.requireOwnCampaign(tenant, campaignId) },
          data,
          include: { slot: true },
        })
      : await this.prisma.adCampaign.create({ data, include: { slot: true } });
    return this.serializeCampaign(row);
  }

  async track(campaignId: string, kind: "impression" | "click", path?: string) {
    const campaign = await this.prisma.adCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status !== "ACTIVE") return { ok: false };
    await this.prisma.adEvent.create({ data: { campaignId, kind, path: path ?? null } });
    return { ok: true };
  }

  async publicCreatives(placement?: string) {
    await this.ensureSlots();
    const now = new Date();
    const rows = await this.prisma.adCampaign.findMany({
      where: {
        status: "ACTIVE",
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        slot: { enabled: true, ...(placement ? { placement } : {}) },
      },
      include: { slot: true, tenant: { select: { name: true, providerKey: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((row) => ({
      campaignId: row.id,
      slot: row.slot.key,
      placement: row.slot.placement,
      title: row.title,
      subtitle: row.subtitle,
      imageUrl: row.imageUrl,
      linkUrl: row.linkUrl,
      advertiser: row.tenant.name,
      provider: row.tenant.providerKey,
    }));
  }

  async advertisedDistributorIds() {
    const now = new Date();
    const rows = await this.prisma.adCampaign.findMany({
      where: {
        status: "ACTIVE",
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        slot: { key: "discovery", enabled: true },
        tenant: { type: "DISTRIBUTOR", active: true, advertisingEnabled: true, providerKey: { not: null } },
      },
      select: { tenantId: true },
    });
    return [...new Set(rows.map((row) => row.tenantId))];
  }

  private async statsFor(campaignIds: string[]) {
    const map = new Map(campaignIds.map((id) => [id, { impressions: 0, clicks: 0 }]));
    if (campaignIds.length === 0) return map;
    const grouped = await this.prisma.adEvent.groupBy({
      by: ["campaignId", "kind"],
      where: { campaignId: { in: campaignIds } },
      _count: { id: true },
    });
    for (const row of grouped) {
      const current = map.get(row.campaignId);
      if (!current) continue;
      if (row.kind === "click") current.clicks = row._count.id;
      else current.impressions = row._count.id;
    }
    return map;
  }

  private serializeSlot(slot: {
    id: string;
    key: string;
    name: string;
    description: string;
    placement: string;
    monthlyPriceUsd: Prisma.Decimal | number;
    maxConcurrent: number;
    enabled: boolean;
  }) {
    return {
      id: slot.id,
      key: slot.key,
      name: slot.name,
      description: slot.description,
      placement: slot.placement,
      monthlyPriceUsd: Number(slot.monthlyPriceUsd),
      maxConcurrent: slot.maxConcurrent,
      enabled: slot.enabled,
    };
  }

  private serializeCampaign(row: {
    id: string;
    tenantId: string;
    status: string;
    title: string;
    subtitle: string;
    imageUrl: string | null;
    linkUrl: string | null;
    articleId?: string | null;
    startsAt: Date;
    endsAt: Date | null;
    slot: { id: string; key: string; name: string; monthlyPriceUsd: Prisma.Decimal | number; placement: string };
    tenant?: { id: string; name: string; type: string };
  }) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      advertiser: row.tenant?.name,
      status: row.status,
      title: row.title,
      subtitle: row.subtitle,
      imageUrl: row.imageUrl,
      linkUrl: row.linkUrl,
      articleId: row.articleId ?? null,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
      slot: {
        id: row.slot.id,
        key: row.slot.key,
        name: row.slot.name,
        placement: row.slot.placement,
        monthlyPriceUsd: Number(row.slot.monthlyPriceUsd),
      },
    };
  }

  private assertAdvertiser(tenant: TenantContext) {
    if (tenant.tenantType === "RETAILER") {
      throw new ForbiddenException("La publicidad la contratan distribuidores y marcas");
    }
  }

  private assertCanBuy(tenant: TenantContext) {
    this.assertAdvertiser(tenant);
    if (!TENANT_ROLES_CAN_MANAGE_PORTFOLIO.includes(tenant.tenantRole)) {
      throw new ForbiddenException("Solo el dueño o un administrador contratan publicidad");
    }
  }

  private async tenantPays(tenantId: string) {
    const row = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { advertisingEnabled: true } });
    return Boolean(row?.advertisingEnabled);
  }

  private async assertPays(tenant: TenantContext) {
    if (!(await this.tenantPays(tenant.tenantId))) {
      throw new ForbiddenException("La publicidad está deshabilitada. Pedile al administrador de NODO que habilite tu cuenta.");
    }
  }

  private async requireOwnCampaign(tenant: TenantContext, campaignId: string) {
    const row = await this.prisma.adCampaign.findUnique({ where: { id: campaignId } });
    if (!row || row.tenantId !== tenant.tenantId) throw new NotFoundException("Campaña no encontrada");
    return row.id;
  }
}
