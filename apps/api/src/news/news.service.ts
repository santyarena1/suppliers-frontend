import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { NewsKind, NewsStatus, RelatedNewsSku, TenantType } from "@nodo/shared";
import { NEWS_WRITERS_BY_TYPE } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { commercialId, type TenantContext } from "../tenants/tenant-context.service";
import { newPublicKey } from "../brands/brand-orgs";
import { compileBrandHtml, sanitizeBrandHtml } from "../brands/brand-html";
import { AdsService } from "../ads/ads.service";
import { NewsVisibilityService } from "./news-visibility.service";
import { visibleNewsAttachments } from "./news-visibility";
import type { UpsertNewsDto } from "./dto/news.dto";

function liveWhere(now = new Date()): Prisma.NewsArticleWhereInput {
  return {
    status: "PUBLISHED",
    publishedAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: NewsVisibilityService,
    private readonly ads: AdsService
  ) {}

  async feed(
    tenant: TenantContext,
    query: { kind?: string; authorType?: string; q?: string; cursor?: string; take?: number }
  ) {
    const authorIds = await this.visibility.authorIdsFor(tenant);
    const take = Math.min(Math.max(query.take ?? 24, 1), 48);
    const now = new Date();
    const where: Prisma.NewsArticleWhereInput = {
      ...liveWhere(now),
      tenantId: { in: authorIds.length ? authorIds : ["__none__"] },
      ...(query.kind ? { kind: query.kind as NewsKind } : {}),
      ...(query.authorType ? { tenant: { type: query.authorType as TenantType } } : {}),
      ...(query.q?.trim()
        ? {
            OR: [
              { title: { contains: query.q.trim(), mode: "insensitive" } },
              { excerpt: { contains: query.q.trim(), mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.newsArticle.findMany({
      where: query.cursor
        ? { AND: [where, { publishedAt: { lt: new Date(query.cursor) } }] }
        : where,
      include: this.cardInclude(),
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: take + 1,
    });
    const linked = await this.visibility.linkedSupplierIds(commercialId(tenant));
    const page = rows.slice(0, take);
    const last = page[page.length - 1];
    return {
      items: page.map((row) => this.serializeCard(row, linked.has(row.tenantId))),
      nextCursor: rows.length > take && last?.publishedAt ? last.publishedAt.toISOString() : null,
    };
  }

  async hero(tenant: TenantContext) {
    const viewer = await this.prisma.tenant.findUnique({
      where: { id: commercialId(tenant) },
      select: { type: true },
    });
    if ((viewer?.type ?? tenant.tenantType) !== "RETAILER") {
      return { slides: [] as ReturnType<NewsService["serializeHero"]>[] };
    }
    await this.ads.ensureSlots();
    const now = new Date();
    const campaigns = await this.prisma.adCampaign.findMany({
      where: {
        status: "ACTIVE",
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        slot: { key: "news_hero", enabled: true },
        tenant: { active: true, advertisingEnabled: true, type: { in: ["DISTRIBUTOR", "BRAND"] } },
      },
      include: {
        tenant: { select: { id: true, name: true, type: true, brandLanding: { select: { logoUrl: true } } } },
        article: { include: this.cardInclude() },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    });
    const linked = await this.visibility.linkedSupplierIds(commercialId(tenant));
    const slides = [];
    for (const campaign of campaigns) {
      const article =
        campaign.article && this.isLive(campaign.article, now)
          ? campaign.article
          : await this.prisma.newsArticle.findFirst({
              where: { tenantId: campaign.tenantId, ...liveWhere(now) },
              include: this.cardInclude(),
              orderBy: { publishedAt: "desc" },
            });
      if (!article) continue;
      slides.push(this.serializeHero(article, campaign, linked.has(article.tenantId)));
    }
    return { slides };
  }

  async getOne(tenant: TenantContext, id: string) {
    const row = await this.prisma.newsArticle.findUnique({
      where: { id },
      include: this.detailInclude(),
    });
    if (!row) throw new NotFoundException("Nota no encontrada");
    if (row.tenantId === tenant.tenantId) {
      return this.withStats(
        this.serializeDetail(row, { linked: true, advertised: false, viewerType: tenant.tenantType })
      );
    }
    const authorIds = await this.visibility.authorIdsFor(tenant);
    if (!authorIds.includes(row.tenantId) || !this.isLive(row)) {
      throw new NotFoundException("Nota no encontrada");
    }
    const linked = await this.visibility.linkedSupplierIds(commercialId(tenant));
    return this.serializeDetail(row, {
      linked: linked.has(row.tenantId),
      advertised: !linked.has(row.tenantId),
      viewerType: tenant.tenantType,
    });
  }

  async getPublic(publicKey: string) {
    const row = await this.prisma.newsArticle.findUnique({
      where: { publicKey },
      include: this.detailInclude(),
    });
    if (!row?.isPublic || !this.isLive(row) || !row.tenant.active) {
      throw new NotFoundException("Nota no encontrada");
    }
    return this.serializeDetail(row, { linked: false, advertised: false, viewerType: null, publicView: true });
  }

  async getMine(tenant: TenantContext, id: string) {
    this.assertPublisher(tenant);
    const row = await this.prisma.newsArticle.findUnique({
      where: { id },
      include: this.detailInclude(),
    });
    if (!row || row.tenantId !== tenant.tenantId) throw new NotFoundException("Nota no encontrada");
    return this.withStats(
      this.serializeDetail(row, { linked: true, advertised: false, viewerType: tenant.tenantType })
    );
  }

  async listMine(tenant: TenantContext) {
    this.assertPublisher(tenant);
    const rows = await this.prisma.newsArticle.findMany({
      where: { tenantId: tenant.tenantId },
      include: this.cardInclude(),
      orderBy: [{ updatedAt: "desc" }],
      take: 80,
    });
    const stats = await this.statsFor(rows.map((r) => r.id));
    return {
      canWrite: this.canWrite(tenant),
      items: rows.map((row) => ({
        ...this.serializeCard(row, true),
        status: row.status,
        isPublic: row.isPublic,
        stats: stats.get(row.id) ?? { views: 0, attachmentClicks: 0 },
      })),
    };
  }

  async create(tenant: TenantContext, dto: UpsertNewsDto) {
    this.assertCanWrite(tenant);
    await this.assertPmScope(tenant, dto.scopeBrandName);
    if (!dto.title?.trim()) throw new BadRequestException("La nota necesita un título");
    const status = dto.status ?? "DRAFT";
    if (status === "PUBLISHED") this.assertPublishable(dto);
    const row = await this.prisma.newsArticle.create({
      data: {
        tenantId: tenant.tenantId,
        publicKey: newPublicKey(),
        title: dto.title.trim(),
        excerpt: (dto.excerpt ?? "").trim().slice(0, 280),
        bodyHtml: dto.bodyHtml?.trim() ? sanitizeBrandHtml(dto.bodyHtml) : "",
        coverUrl: dto.coverUrl?.trim() || null,
        kind: dto.kind ?? "OTHER",
        status,
        isPublic: Boolean(dto.isPublic),
        notifyOnPublish: Boolean(dto.notifyOnPublish),
        scopeBrandName: dto.scopeBrandName?.trim() || null,
        publishedAt: status === "PUBLISHED" ? this.parseDate(dto.publishedAt) ?? new Date() : this.parseDate(dto.publishedAt),
        expiresAt: this.parseDate(dto.expiresAt),
        relatedSkus: (dto.relatedSkus ?? []) as unknown as Prisma.InputJsonValue,
        createdByUserId: tenant.userId,
        attachments: { create: this.attachmentCreates(dto.attachments) },
        images: { create: this.imageCreates(dto.images) },
      },
      include: this.detailInclude(),
    });
    if (status === "PUBLISHED" && dto.notifyOnPublish) {
      await this.notifyLinked(tenant, row);
    }
    return this.withStats(
      this.serializeDetail(row, { linked: true, advertised: false, viewerType: tenant.tenantType })
    );
  }

  async update(tenant: TenantContext, id: string, dto: UpsertNewsDto) {
    this.assertCanWrite(tenant);
    const existing = await this.prisma.newsArticle.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== tenant.tenantId) throw new NotFoundException("Nota no encontrada");
    await this.assertPmScope(tenant, dto.scopeBrandName ?? existing.scopeBrandName);
    const nextStatus = dto.status ?? existing.status;
    const merged = {
      title: dto.title ?? existing.title,
      coverUrl: dto.coverUrl === undefined ? existing.coverUrl : dto.coverUrl,
      bodyHtml: dto.bodyHtml === undefined ? existing.bodyHtml : dto.bodyHtml,
    };
    if (nextStatus === "PUBLISHED") this.assertPublishable(merged);
    const becomingPublic = existing.status !== "PUBLISHED" && nextStatus === "PUBLISHED";
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.attachments) {
        await tx.newsAttachment.deleteMany({ where: { articleId: id } });
      }
      if (dto.images) {
        await tx.newsImage.deleteMany({ where: { articleId: id } });
      }
      return tx.newsArticle.update({
        where: { id },
        data: {
          ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
          ...(dto.excerpt === undefined ? {} : { excerpt: dto.excerpt.trim().slice(0, 280) }),
          ...(dto.bodyHtml === undefined ? {} : { bodyHtml: dto.bodyHtml.trim() ? sanitizeBrandHtml(dto.bodyHtml) : "" }),
          ...(dto.coverUrl === undefined ? {} : { coverUrl: dto.coverUrl?.trim() || null }),
          ...(dto.kind === undefined ? {} : { kind: dto.kind }),
          ...(dto.status === undefined ? {} : { status: dto.status }),
          ...(dto.isPublic === undefined ? {} : { isPublic: dto.isPublic }),
          ...(dto.notifyOnPublish === undefined ? {} : { notifyOnPublish: dto.notifyOnPublish }),
          ...(dto.scopeBrandName === undefined ? {} : { scopeBrandName: dto.scopeBrandName?.trim() || null }),
          ...(dto.publishedAt === undefined && !becomingPublic
            ? {}
            : { publishedAt: this.parseDate(dto.publishedAt) ?? (becomingPublic ? new Date() : existing.publishedAt) }),
          ...(dto.expiresAt === undefined ? {} : { expiresAt: this.parseDate(dto.expiresAt) }),
          ...(dto.relatedSkus === undefined ? {} : { relatedSkus: dto.relatedSkus as unknown as Prisma.InputJsonValue }),
          ...(dto.attachments ? { attachments: { create: this.attachmentCreates(dto.attachments) } } : {}),
          ...(dto.images ? { images: { create: this.imageCreates(dto.images) } } : {}),
        },
        include: this.detailInclude(),
      });
    });
    if (becomingPublic && (dto.notifyOnPublish ?? existing.notifyOnPublish)) {
      await this.notifyLinked(tenant, row);
    }
    return this.withStats(
      this.serializeDetail(row, { linked: true, advertised: false, viewerType: tenant.tenantType })
    );
  }

  async remove(tenant: TenantContext, id: string) {
    this.assertCanWrite(tenant);
    const existing = await this.prisma.newsArticle.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== tenant.tenantId) throw new NotFoundException("Nota no encontrada");
    await this.prisma.newsArticle.delete({ where: { id } });
    return { ok: true };
  }

  async track(tenant: TenantContext, id: string, kind: "view" | "attachment_click") {
    const authorIds = await this.visibility.authorIdsFor(tenant);
    const row = await this.prisma.newsArticle.findUnique({ where: { id }, select: { id: true, tenantId: true, status: true, publishedAt: true, expiresAt: true } });
    if (!row || !authorIds.includes(row.tenantId) || !this.isLive(row)) return { ok: false };
    await this.prisma.newsEvent.create({ data: { articleId: id, kind } });
    return { ok: true };
  }

  async adminList() {
    const rows = await this.prisma.newsArticle.findMany({
      include: this.cardInclude(),
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
    });
    return {
      items: rows.map((row) => ({
        ...this.serializeCard(row, true),
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async adminRemove(id: string) {
    const existing = await this.prisma.newsArticle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Nota no encontrada");
    await this.prisma.newsArticle.delete({ where: { id } });
    return { ok: true };
  }

  async hubNews(brandTenantId: string, take = 3) {
    const rows = await this.prisma.newsArticle.findMany({
      where: { tenantId: brandTenantId, ...liveWhere() },
      include: this.cardInclude(),
      orderBy: { publishedAt: "desc" },
      take,
    });
    return rows.map((row) => this.serializeCard(row, true));
  }

  private assertPublisher(tenant: TenantContext) {
    if (tenant.tenantType !== "DISTRIBUTOR" && tenant.tenantType !== "BRAND") {
      throw new ForbiddenException("Las noticias las publican marcas y distribuidores");
    }
  }

  private canWrite(tenant: TenantContext) {
    if (tenant.tenantType !== "DISTRIBUTOR" && tenant.tenantType !== "BRAND") return false;
    const allowed = NEWS_WRITERS_BY_TYPE[tenant.tenantType];
    return (allowed as readonly string[]).includes(tenant.tenantRole);
  }

  private assertCanWrite(tenant: TenantContext) {
    this.assertPublisher(tenant);
    if (!this.canWrite(tenant)) throw new ForbiddenException("No podés publicar noticias");
  }

  private async assertPmScope(tenant: TenantContext, brandName?: string | null) {
    if (tenant.tenantRole !== "PRODUCT_MANAGER") return;
    const scopes = await this.prisma.productManagerScope.findMany({
      where: { tenantId: tenant.tenantId, userId: tenant.userId },
      select: { brandName: true },
    });
    const names = new Set(scopes.map((s) => s.brandName.toLowerCase()));
    if (!brandName?.trim() || !names.has(brandName.trim().toLowerCase())) {
      throw new ForbiddenException("El product manager solo publica notas de las marcas que tiene asignadas");
    }
  }

  private assertPublishable(dto: { title?: string | null; coverUrl?: string | null; bodyHtml?: string | null }) {
    if (!dto.title?.trim()) throw new BadRequestException("La nota necesita un título");
    if (!dto.coverUrl?.trim()) throw new BadRequestException("Para publicar hace falta una foto de portada");
    if (!dto.bodyHtml?.trim()) throw new BadRequestException("La nota está vacía");
  }

  private parseDate(value?: string | null) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private isLive(
    row: { status: string; publishedAt: Date | null; expiresAt: Date | null },
    now = new Date()
  ) {
    if (row.status !== "PUBLISHED" || !row.publishedAt || row.publishedAt > now) return false;
    if (row.expiresAt && row.expiresAt <= now) return false;
    return true;
  }

  private attachmentCreates(items?: UpsertNewsDto["attachments"]) {
    return (items ?? []).map((item, index) => ({
      kind: item.kind,
      title: item.title.trim(),
      fileUrl: item.fileUrl?.trim() || null,
      contentUrl: item.contentUrl?.trim() || null,
      resourceId: item.resourceId?.trim() || null,
      visibility: item.kind === "PRICE_LIST" ? "IN_APP" : item.visibility ?? "IN_APP",
      sortOrder: index,
    }));
  }

  private imageCreates(items?: UpsertNewsDto["images"]) {
    return (items ?? []).map((item, index) => ({
      url: item.url,
      caption: item.caption?.trim() || null,
      sortOrder: index,
    }));
  }

  private async notifyLinked(tenant: TenantContext, article: { id: string; title: string; isPublic: boolean; publicKey: string }) {
    const recipients =
      tenant.tenantType === "BRAND"
        ? await this.prisma.tenantLink.findMany({
            where: { supplierTenantId: tenant.tenantId, status: { in: ["ACTIVE", "SUSPENDED"] } },
            select: { clientTenantId: true },
          })
        : await this.prisma.tenantLink.findMany({
            where: { supplierTenantId: tenant.tenantId, status: { in: ["ACTIVE", "SUSPENDED"] } },
            select: { clientTenantId: true },
          });
    const ids = [...new Set(recipients.map((r) => r.clientTenantId))];
    if (ids.length === 0) return;
    await this.prisma.orgNotification.createMany({
      data: ids.map((toTenantId) => ({
        toTenantId,
        fromTenantId: tenant.tenantId,
        kind: "NEWS",
        title: `Nueva nota: ${article.title}`,
        body: `${tenant.tenantName} publicó una novedad.`,
        landingKey: article.isPublic ? article.publicKey : null,
      })),
    });
  }

  private async statsFor(ids: string[]) {
    const map = new Map(ids.map((id) => [id, { views: 0, attachmentClicks: 0 }]));
    if (ids.length === 0) return map;
    const grouped = await this.prisma.newsEvent.groupBy({
      by: ["articleId", "kind"],
      where: { articleId: { in: ids } },
      _count: { id: true },
    });
    for (const row of grouped) {
      const current = map.get(row.articleId);
      if (!current) continue;
      if (row.kind === "attachment_click") current.attachmentClicks = row._count.id;
      else current.views = row._count.id;
    }
    return map;
  }

  private async withStats<T extends { id: string }>(detail: T) {
    const stats = await this.statsFor([detail.id]);
    return { ...detail, stats: stats.get(detail.id) ?? { views: 0, attachmentClicks: 0 } };
  }

  private cardInclude() {
    return {
      tenant: { select: { id: true, name: true, type: true, brandLanding: { select: { logoUrl: true, primaryColor: true } } } },
      images: { orderBy: { sortOrder: "asc" as const }, take: 1 },
    };
  }

  private detailInclude() {
    return {
      tenant: { select: { id: true, name: true, type: true, active: true, brandLanding: { select: { logoUrl: true, primaryColor: true } } } },
      images: { orderBy: { sortOrder: "asc" as const } },
      attachments: { orderBy: { sortOrder: "asc" as const } },
    };
  }

  private authorOf(row: {
    tenant: { id: string; name: string; type: TenantType | string; brandLanding?: { logoUrl: string | null; primaryColor?: string | null } | null };
  }) {
    return {
      tenantId: row.tenant.id,
      name: row.tenant.name,
      type: row.tenant.type,
      logoUrl: row.tenant.brandLanding?.logoUrl ?? null,
      primaryColor: row.tenant.brandLanding?.primaryColor ?? null,
    };
  }

  private serializeCard(
    row: {
      id: string;
      publicKey: string;
      title: string;
      excerpt: string;
      kind: NewsKind;
      coverUrl: string | null;
      isPublic: boolean;
      publishedAt: Date | null;
      expiresAt: Date | null;
      tenant: { id: string; name: string; type: string; brandLanding?: { logoUrl: string | null; primaryColor?: string | null } | null };
    },
    linked: boolean
  ) {
    return {
      id: row.id,
      publicKey: row.publicKey,
      title: row.title,
      excerpt: row.excerpt,
      kind: row.kind,
      coverUrl: row.coverUrl,
      isPublic: row.isPublic,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      author: this.authorOf(row),
      linked,
    };
  }

  private serializeHero(
    article: Parameters<NewsService["serializeCard"]>[0],
    campaign: { id: string; title: string },
    linked: boolean
  ) {
    return {
      ...this.serializeCard(article, linked),
      campaignId: campaign.id,
      advertised: true,
      campaignTitle: campaign.title,
    };
  }

  private serializeDetail(
    row: {
      id: string;
      publicKey: string;
      status: NewsStatus;
      kind: NewsKind;
      title: string;
      excerpt: string;
      bodyHtml: string;
      coverUrl: string | null;
      isPublic: boolean;
      notifyOnPublish: boolean;
      scopeBrandName: string | null;
      publishedAt: Date | null;
      expiresAt: Date | null;
      relatedSkus: Prisma.JsonValue;
      createdAt: Date;
      tenant: { id: string; name: string; type: string; active: boolean; brandLanding?: { logoUrl: string | null; primaryColor?: string | null } | null };
      images: { id: string; url: string; caption: string | null; sortOrder: number }[];
      attachments: {
        id: string;
        kind: string;
        title: string;
        fileUrl: string | null;
        contentUrl: string | null;
        resourceId: string | null;
        visibility: string;
      }[];
    },
    opts: {
      linked: boolean;
      advertised: boolean;
      viewerType: TenantType | null;
      publicView?: boolean;
    }
  ) {
    const compiled = compileBrandHtml(row.bodyHtml ?? "");
    const canDownloadCommercial = opts.linked && !opts.publicView;
    const attachments = visibleNewsAttachments(row.attachments, {
      linked: opts.linked,
      publicView: opts.publicView,
    }).map((a) => ({
        id: a.id,
        kind: a.kind,
        title: a.title,
        fileUrl: a.fileUrl,
        contentUrl: a.contentUrl,
        visibility: a.visibility,
      }));
    const skus = (Array.isArray(row.relatedSkus) ? row.relatedSkus : []) as RelatedNewsSku[];
    return {
      id: row.id,
      publicKey: row.publicKey,
      status: row.status,
      kind: row.kind,
      title: row.title,
      excerpt: row.excerpt,
      bodyHtml: compiled.html,
      bodyRaw: row.bodyHtml,
      coverUrl: row.coverUrl,
      isPublic: row.isPublic,
      notifyOnPublish: row.notifyOnPublish,
      scopeBrandName: row.scopeBrandName,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      author: { ...this.authorOf(row), linked: opts.linked, advertised: opts.advertised },
      images: row.images.map((img) => ({ id: img.id, url: img.url, caption: img.caption })),
      attachments,
      canDownloadCommercial,
      relatedSkus: opts.linked && !opts.publicView ? skus : [],
      publicPath: row.isPublic ? `/n/${row.publicKey}` : null,
    };
  }
}
