import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { NewsVisibilityService } from "./news-visibility.service";

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

type RsvpStatus = "GOING" | "NOT_GOING";

interface EventRow {
  id: string;
  tenantId: string;
  title: string;
  kind: string;
  status: string;
  publishedAt: Date | null;
  expiresAt: Date | null;
  publicKey: string;
  isPublic: boolean;
  rsvpEnabled: boolean;
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
  eventLocation: string | null;
  eventCapacity: number | null;
  rsvpDeadline: Date | null;
}

export function eventWhenText(startsAt: Date | null, location: string | null) {
  if (!startsAt) return location ? `En ${location}.` : "";
  const when = startsAt.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${when} h${location ? ` · ${location}` : ""}.`;
}

/** Por qué no se puede confirmar ahora, o null si se puede. */
export function rsvpClosedReason(event: Pick<EventRow, "rsvpDeadline" | "eventStartsAt">, now = new Date()) {
  if (event.eventStartsAt && event.eventStartsAt <= now) return "El evento ya empezó";
  if (event.rsvpDeadline && event.rsvpDeadline < now) return "Ya cerró la confirmación de asistencia";
  return null;
}

/**
 * Asistencia a eventos publicados como nota (kind EVENT): una persona confirma
 * si va o no, cuántos van y un comentario. El autor ve la lista completa, manda
 * avisos y hay un recordatorio automático 24 h antes para quienes confirmaron.
 */
@Injectable()
export class NewsRsvpService {
  private readonly logger = new Logger(NewsRsvpService.name);

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
      select: { tenantId: true, userId: true, status: true, people: true, note: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const going = rows.filter((r) => r.status !== "NOT_GOING");
    const count = going.reduce((acc, r) => acc + r.people, 0);
    const mineRow = rows.find((r) => r.userId === tenant.userId);
    const base = {
      enabled: article.rsvpEnabled,
      count,
      notGoing: rows.length - going.length,
      mine: Boolean(mineRow && mineRow.status !== "NOT_GOING"),
      myResponse: mineRow ? { status: mineRow.status as RsvpStatus, people: mineRow.people, note: mineRow.note } : null,
      capacity: article.eventCapacity,
      spotsLeft: article.eventCapacity != null ? Math.max(0, article.eventCapacity - count) : null,
      deadline: article.rsvpDeadline?.toISOString() ?? null,
      closedReason: rsvpClosedReason(article),
    };
    if (!isAuthor) return base;

    const orgs = await this.orgNames(going.map((r) => r.tenantId));
    const byOrg = new Map<string, number>();
    for (const r of going) byOrg.set(r.tenantId, (byOrg.get(r.tenantId) ?? 0) + r.people);
    return {
      ...base,
      attendees: [...byOrg.entries()]
        .map(([tenantId, people]) => ({ tenantId, name: orgs.get(tenantId) ?? "Organización", people }))
        .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name)),
    };
  }

  async respond(
    tenant: TenantContext,
    articleId: string,
    input: { status: RsvpStatus; people?: number; note?: string | null }
  ) {
    const article = await this.article(articleId);
    if (article.tenantId === tenant.tenantId) throw new BadRequestException("Es tu propio evento");
    await this.assertVisible(tenant, article);
    if (article.kind !== "EVENT" || !article.rsvpEnabled) {
      throw new BadRequestException("Este evento no pide confirmación de asistencia");
    }
    const closed = rsvpClosedReason(article);
    if (closed) throw new BadRequestException(closed);

    const people = input.status === "GOING" ? Math.max(1, Math.min(20, input.people ?? 1)) : 1;
    if (input.status === "GOING" && article.eventCapacity != null) {
      const others = await this.prisma.newsRsvp.aggregate({
        where: { articleId, status: "GOING", NOT: { userId: tenant.userId } },
        _sum: { people: true },
      });
      const taken = others._sum.people ?? 0;
      if (taken + people > article.eventCapacity) {
        const left = Math.max(0, article.eventCapacity - taken);
        throw new BadRequestException(
          left === 0 ? "No quedan lugares" : `Quedan ${left} ${left === 1 ? "lugar" : "lugares"}`
        );
      }
    }
    const data = { status: input.status, people, note: input.note?.trim() || null };
    await this.prisma.newsRsvp.upsert({
      where: { articleId_userId: { articleId, userId: tenant.userId } },
      create: { articleId, userId: tenant.userId, tenantId: tenant.tenantId, ...data },
      update: data,
    });
    return this.summary(tenant, articleId);
  }

  /** Compatibilidad: "Me anoto" es confirmar que va una persona. */
  join(tenant: TenantContext, articleId: string) {
    return this.respond(tenant, articleId, { status: "GOING", people: 1 });
  }

  async leave(tenant: TenantContext, articleId: string) {
    await this.prisma.newsRsvp.deleteMany({ where: { articleId, userId: tenant.userId } });
    return this.summary(tenant, articleId);
  }

  /** Lista completa para el autor: quién, de qué organización, si va, cuántos y qué dijo. */
  async attendees(tenant: TenantContext, articleId: string) {
    const article = await this.article(articleId);
    if (article.tenantId !== tenant.tenantId) throw new ForbiddenException("La lista es de quien organiza el evento");
    const rows = await this.prisma.newsRsvp.findMany({
      where: { articleId },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });
    const [orgs, users] = await Promise.all([
      this.orgNames(rows.map((r) => r.tenantId)),
      this.prisma.user.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
        select: { id: true, username: true, email: true },
      }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    return {
      items: rows.map((r) => ({
        organization: orgs.get(r.tenantId) ?? "Organización",
        person: userById.get(r.userId)?.username ?? "Usuario",
        email: userById.get(r.userId)?.email ?? null,
        status: r.status as RsvpStatus,
        people: r.people,
        note: r.note,
        answeredAt: r.updatedAt.toISOString(),
      })),
    };
  }

  /** Aviso manual del autor: a quienes confirmaron o a todas sus cuentas vinculadas. */
  async remind(tenant: TenantContext, articleId: string, audience: "going" | "linked", message?: string | null) {
    const article = await this.article(articleId);
    if (article.tenantId !== tenant.tenantId) throw new ForbiddenException("Avisa quien organiza el evento");
    if (article.kind !== "EVENT") throw new BadRequestException("Solo se avisa sobre eventos");
    const tenantIds =
      audience === "going"
        ? await this.goingTenants(articleId)
        : (
            await this.prisma.tenantLink.findMany({
              where: { supplierTenantId: tenant.tenantId, status: { in: ["ACTIVE", "SUSPENDED"] } },
              select: { clientTenantId: true },
            })
          ).map((l) => l.clientTenantId);
    const body = message?.trim() || `Recordatorio: ${eventWhenText(article.eventStartsAt, article.eventLocation)}`;
    const sent = await this.notify(tenantIds, article, body);
    return { sent };
  }

  /** Recordatorio automático: eventos que empiezan en las próximas 24 h, una sola vez. */
  @Cron("*/30 * * * *")
  async sendDueReminders() {
    const now = new Date();
    const due = await this.prisma.newsArticle.findMany({
      where: {
        kind: "EVENT",
        status: "PUBLISHED",
        eventReminder: true,
        reminderSentAt: null,
        eventStartsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_WINDOW_MS) },
      },
      select: this.eventSelect(),
      take: 50,
    });
    for (const event of due) {
      // Reclamar antes de mandar: con más de una réplica, solo una lo envía.
      const claimed = await this.prisma.newsArticle.updateMany({
        where: { id: event.id, reminderSentAt: null },
        data: { reminderSentAt: now },
      });
      if (claimed.count === 0) continue;
      try {
        const tenantIds = await this.goingTenants(event.id);
        await this.notify(tenantIds, event, `Es mañana: ${eventWhenText(event.eventStartsAt, event.eventLocation)}`);
      } catch (err) {
        this.logger.error(`Recordatorio del evento ${event.id}: ${String(err)}`);
      }
    }
  }

  private async notify(tenantIds: string[], event: EventRow, body: string) {
    const ids = [...new Set(tenantIds)];
    if (ids.length === 0) return 0;
    const author = await this.prisma.tenant.findUnique({ where: { id: event.tenantId }, select: { name: true } });
    await this.prisma.orgNotification.createMany({
      data: ids.map((toTenantId) => ({
        toTenantId,
        fromTenantId: event.tenantId,
        kind: "NEWS" as const,
        title: `${author?.name ?? "Evento"}: ${event.title}`,
        body,
        landingKey: event.isPublic ? event.publicKey : null,
      })),
    });
    return ids.length;
  }

  private async goingTenants(articleId: string) {
    const rows = await this.prisma.newsRsvp.findMany({
      where: { articleId, status: "GOING" },
      select: { tenantId: true },
    });
    return rows.map((r) => r.tenantId);
  }

  private async orgNames(ids: string[]) {
    const rows = await this.prisma.tenant.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((t) => [t.id, t.name]));
  }

  private eventSelect() {
    return {
      id: true,
      tenantId: true,
      title: true,
      kind: true,
      status: true,
      publishedAt: true,
      expiresAt: true,
      publicKey: true,
      isPublic: true,
      rsvpEnabled: true,
      eventStartsAt: true,
      eventEndsAt: true,
      eventLocation: true,
      eventCapacity: true,
      rsvpDeadline: true,
    } as const;
  }

  private async article(id: string): Promise<EventRow> {
    const row = await this.prisma.newsArticle.findUnique({ where: { id }, select: this.eventSelect() });
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
