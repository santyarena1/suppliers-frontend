import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { NewsVisibilityService } from "./news-visibility.service";

/**
 * Anotarse a un evento publicado como nota (kind EVENT). Se anota una persona
 * en nombre de su organización; el autor ve quiénes van, el resto solo el total.
 */
@Injectable()
export class NewsRsvpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: NewsVisibilityService
  ) {}

  async summary(tenant: TenantContext, articleId: string) {
    const article = await this.article(articleId);
    const isAuthor = article.tenantId === tenant.tenantId;
    if (!isAuthor) await this.assertVisible(tenant, article);
    const rows = await this.prisma.newsRsvp.findMany({
      where: { articleId },
      select: { tenantId: true, userId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const base = {
      enabled: article.rsvpEnabled,
      count: rows.length,
      mine: rows.some((r) => r.userId === tenant.userId),
    };
    if (!isAuthor) return base;

    // El autor ve qué organizaciones y cuántas personas de cada una.
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.tenantId))] } },
      select: { id: true, name: true },
    });
    const names = new Map(tenants.map((t) => [t.id, t.name]));
    const byOrg = new Map<string, number>();
    for (const r of rows) byOrg.set(r.tenantId, (byOrg.get(r.tenantId) ?? 0) + 1);
    return {
      ...base,
      attendees: [...byOrg.entries()]
        .map(([tenantId, people]) => ({ tenantId, name: names.get(tenantId) ?? "Organización", people }))
        .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name)),
    };
  }

  async join(tenant: TenantContext, articleId: string) {
    const article = await this.article(articleId);
    if (article.tenantId === tenant.tenantId) throw new BadRequestException("Es tu propio evento");
    await this.assertVisible(tenant, article);
    if (article.kind !== "EVENT" || !article.rsvpEnabled) {
      throw new BadRequestException("Este evento no tiene inscripción");
    }
    if (article.eventStartsAt && article.eventStartsAt.getTime() < Date.now()) {
      throw new BadRequestException("El evento ya empezó");
    }
    await this.prisma.newsRsvp.upsert({
      where: { articleId_userId: { articleId, userId: tenant.userId } },
      create: { articleId, userId: tenant.userId, tenantId: tenant.tenantId },
      update: {},
    });
    return this.summary(tenant, articleId);
  }

  async leave(tenant: TenantContext, articleId: string) {
    await this.prisma.newsRsvp.deleteMany({ where: { articleId, userId: tenant.userId } });
    return this.summary(tenant, articleId);
  }

  private async article(id: string) {
    const row = await this.prisma.newsArticle.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        kind: true,
        status: true,
        publishedAt: true,
        expiresAt: true,
        rsvpEnabled: true,
        eventStartsAt: true,
      },
    });
    if (!row) throw new NotFoundException("Nota no encontrada");
    return row;
  }

  private async assertVisible(
    tenant: TenantContext,
    article: { tenantId: string; status: string; publishedAt: Date | null; expiresAt: Date | null }
  ) {
    const now = new Date();
    const live =
      article.status === "PUBLISHED" &&
      article.publishedAt !== null &&
      article.publishedAt <= now &&
      (!article.expiresAt || article.expiresAt > now);
    const authors = await this.visibility.authorIdsFor(tenant);
    if (!live || !authors.includes(article.tenantId)) throw new NotFoundException("Nota no encontrada");
  }
}
