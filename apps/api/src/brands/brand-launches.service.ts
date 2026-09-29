import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type Audience = "client" | "public";

/**
 * Próximos lanzamientos y eventos de una marca para su espacio (comercio o distro
 * vinculado) y su link público. Un lanzamiento es un producto de la marca en
 * "próximo ingreso", con la nota que lo presenta (material, fotos) si la hay.
 */
@Injectable()
export class BrandLaunchesService {
  constructor(private readonly prisma: PrismaService) {}

  async launchesFor(brandId: string, audience: Audience) {
    const now = new Date();
    const items = await this.prisma.brandItem.findMany({
      where: { tenantId: brandId, active: true, state: "INCOMING" },
      orderBy: [{ incomingAt: { sort: "asc", nulls: "last" } }, { position: "asc" }],
      take: 24,
      select: {
        id: true,
        name: true,
        imageUrl: true,
        partNumber: true,
        referencePrice: true,
        currency: true,
        incomingAt: true,
        launches: {
          where: {
            status: "PUBLISHED",
            publishedAt: { lte: now },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            ...(audience === "public" ? { isPublic: true } : {}),
          },
          orderBy: { publishedAt: "desc" },
          take: 1,
          select: { id: true, publicKey: true, title: true, excerpt: true, coverUrl: true },
        },
      },
    });
    return items.map((item) => {
      const note = item.launches[0] ?? null;
      return {
        id: item.id,
        name: item.name,
        imageUrl: item.imageUrl ?? note?.coverUrl ?? null,
        partNumber: item.partNumber,
        referencePrice: item.referencePrice === null ? null : Number(item.referencePrice),
        currency: item.currency,
        incomingAt: item.incomingAt?.toISOString() ?? null,
        note: note
          ? {
              id: note.id,
              title: note.title,
              excerpt: note.excerpt,
              path: audience === "public" ? `/n/${note.publicKey}` : `/noticias/${note.id}`,
            }
          : null,
      };
    });
  }

  async eventsFor(brandId: string, audience: Audience) {
    const now = new Date();
    const rows = await this.prisma.newsArticle.findMany({
      where: {
        tenantId: brandId,
        kind: "EVENT",
        status: "PUBLISHED",
        publishedAt: { lte: now },
        eventStartsAt: { not: null },
        // Sigue en la lista mientras no terminó (o, sin fin, durante el día en que empieza).
        OR: [{ eventEndsAt: { gte: now } }, { eventEndsAt: null, eventStartsAt: { gte: startOfDay(now) } }],
        ...(audience === "public" ? { isPublic: true } : {}),
      },
      orderBy: { eventStartsAt: "asc" },
      take: 12,
      select: {
        id: true,
        publicKey: true,
        title: true,
        excerpt: true,
        coverUrl: true,
        eventStartsAt: true,
        eventEndsAt: true,
        eventLocation: true,
        eventUrl: true,
        rsvpEnabled: true,
        _count: { select: { rsvps: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      excerpt: row.excerpt,
      coverUrl: row.coverUrl,
      startsAt: row.eventStartsAt?.toISOString() ?? null,
      endsAt: row.eventEndsAt?.toISOString() ?? null,
      location: row.eventLocation,
      // El link de una reunión online es para los vinculados, no para cualquiera.
      url: audience === "public" ? null : row.eventUrl,
      rsvpEnabled: audience === "client" && row.rsvpEnabled,
      attending: row._count.rsvps,
      path: audience === "public" ? `/n/${row.publicKey}` : `/noticias/${row.id}`,
    }));
  }
}

function startOfDay(d: Date) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
