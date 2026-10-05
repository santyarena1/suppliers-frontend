import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { cronsAreGloballyEnabled } from "../../common/cron-window";
import { PrismaService } from "../../prisma/prisma.service";
import { CatalogSnapshotService } from "../core/catalog-snapshot.service";
import { decimalText, diffOffer, productHash, type OfferStateLike } from "./offer-diff";

const BATCH = 2_000;
/** Tope de trabajo por comercio y por pasada: el resto sigue en la próxima. */
const MAX_PER_TICK = 20_000;
const FULL_SCAN_EVERY_MS = 10 * 60_000;
/**
 * Margen para filas que se escriben con una fecha y se confirman después: cada
 * pasada vuelve a mirar los últimos 2 minutos. Repetir no duplica eventos (se
 * compara contra la última versión guardada).
 */
const COMMIT_LAG_MS = 2 * 60_000;

const TRACK_SELECT = {
  provider: true,
  externalId: true,
  price: true,
  finalPrice: true,
  stock: true,
  active: true,
  updatedAt: true,
  product: {
    select: {
      name: true,
      brand: true,
      category: true,
      subcategory: true,
      sku: true,
      partNumber: true,
      ean: true,
      description: true,
      longDescription: true,
      imageUrl: true,
      productUrl: true,
      warranty: true,
      weight: true,
      weightUnit: true,
      height: true,
      width: true,
      length: true,
      dimensionsUnit: true,
      volume: true,
      tags: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.TenantProductOfferSelect;

type TrackedOffer = Prisma.TenantProductOfferGetPayload<{ select: typeof TRACK_SELECT }>;

/** Lo que el rastreador guarda de una oferta. Con precio 0 cuenta como que no está. */
export function stateOf(offer: TrackedOffer): OfferStateLike {
  const price = decimalText(offer.price);
  const finalPrice = decimalText(offer.finalPrice);
  const priced = Number(price ?? 0) > 0 || Number(finalPrice ?? 0) > 0;
  return {
    price,
    finalPrice,
    stock: offer.stock,
    active: offer.active && priced,
    productHash: productHash(offer.product as unknown as Record<string, unknown>),
  };
}

/**
 * Registra los cambios del catálogo de cada comercio con API activa como
 * eventos numerados (ApiCatalogEvent). De ahí leen /v1/changes y los webhooks:
 * los dos ven exactamente la misma secuencia, sin depender de cuándo consulta
 * cada integrador. La primera pasada solo toma la foto, sin eventos.
 */
@Injectable()
export class ChangeTrackerService {
  private readonly logger = new Logger(ChangeTrackerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: CatalogSnapshotService
  ) {}

  @Cron("*/1 * * * *")
  async tick() {
    if (!cronsAreGloballyEnabled() || this.running) return;
    this.running = true;
    try {
      for (const tenantId of await this.trackedTenants()) {
        await this.track(tenantId).catch((err) => this.logger.warn(`Cambios de ${tenantId}: ${(err as Error).message}`));
      }
    } finally {
      this.running = false;
    }
  }

  /** Comercios (de catálogo) con alguna key activa. */
  async trackedTenants(): Promise<string[]> {
    const clients = await this.prisma.apiClient.findMany({
      where: { status: "ACTIVE" },
      select: { tenant: { select: { id: true, mirrorsCommercialFromId: true } } },
    });
    return [...new Set(clients.map((c) => c.tenant.mirrorsCommercialFromId ?? c.tenant.id))];
  }

  async track(tenantId: string, now = new Date()): Promise<number> {
    const tracker = await this.prisma.apiCatalogTracker.upsert({
      where: { tenantId },
      create: { tenantId, pausedProviders: [] },
      update: {},
    });
    if (!tracker.baselineAt) {
      await this.baseline(tenantId, now);
      return 0;
    }
    let events = await this.trackOffers(tenantId, tracker.offersCursor, tracker.productsCursor, now);
    if (!tracker.lastFullScanAt || now.getTime() - tracker.lastFullScanAt.getTime() >= FULL_SCAN_EVERY_MS) {
      events += await this.trackDeleted(tenantId, now);
    }
    events += await this.trackProviderPauses(tenantId, tracker.pausedProviders);
    if (events > 0) this.snapshots.invalidate(tenantId);
    return events;
  }

  /** Primera foto: todo lo que hay hoy, sin eventos (un integrador nuevo arranca con un export). */
  private async baseline(tenantId: string, now: Date) {
    let cursor: string | undefined;
    let maxUpdated: Date | null = null;
    for (;;) {
      const batch = await this.prisma.tenantProductOffer.findMany({
        where: { tenantId },
        select: { ...TRACK_SELECT, id: true },
        orderBy: { id: "asc" },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;
      await this.prisma.apiOfferState.createMany({
        data: batch.map((o) => ({ tenantId, provider: o.provider, externalId: o.externalId, ...this.stateRow(o) })),
        skipDuplicates: true,
      });
      for (const o of batch) if (!maxUpdated || o.updatedAt > maxUpdated) maxUpdated = o.updatedAt;
      if (batch.length < BATCH) break;
      cursor = batch[batch.length - 1].id;
    }
    const paused = await this.pausedNow(tenantId);
    await this.prisma.apiCatalogTracker.update({
      where: { tenantId },
      data: {
        baselineAt: now,
        offersCursor: new Date(Math.min((maxUpdated ?? now).getTime(), now.getTime() - COMMIT_LAG_MS)),
        productsCursor: new Date(now.getTime() - COMMIT_LAG_MS),
        lastFullScanAt: now,
        pausedProviders: paused,
      },
    });
  }

  private stateRow(o: TrackedOffer) {
    const s = stateOf(o);
    return {
      price: s.price == null ? null : new Prisma.Decimal(s.price),
      finalPrice: s.finalPrice == null ? null : new Prisma.Decimal(s.finalPrice),
      stock: s.stock,
      active: s.active,
      productHash: s.productHash,
      seenAt: new Date(),
    };
  }

  /** Ofertas que cambiaron (o cuya ficha cambió) desde la última pasada. */
  private async trackOffers(tenantId: string, offersCursor: Date | null, productsCursor: Date | null, now: Date): Promise<number> {
    let emitted = 0;
    let seen = 0;
    let offerMark = offersCursor ?? new Date(0);
    let markId = "";
    let caughtUp = true;
    // Las fichas son compartidas: se miran las que cambiaron y que este comercio vende.
    const productMark = productsCursor ?? new Date(0);
    const touchedProducts = await this.prisma.providerSyncCache.findMany({
      where: { updatedAt: { gt: productMark, lte: now }, offers: { some: { tenantId } } },
      select: { provider: true, externalId: true },
      take: MAX_PER_TICK,
    });

    for (;;) {
      // (updatedAt, id): una actualización masiva deja miles de filas con la misma fecha.
      const batch = await this.prisma.tenantProductOffer.findMany({
        where: { tenantId, OR: [{ updatedAt: { gt: offerMark } }, { updatedAt: offerMark, id: { gt: markId } }] },
        select: { ...TRACK_SELECT, id: true },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: BATCH,
      });
      if (batch.length === 0) break;
      emitted += await this.compareAndRecord(tenantId, batch);
      seen += batch.length;
      offerMark = batch[batch.length - 1].updatedAt;
      markId = batch[batch.length - 1].id;
      if (batch.length < BATCH) break;
      if (seen >= MAX_PER_TICK) {
        caughtUp = false;
        break;
      }
    }

    if (touchedProducts.length) {
      for (let i = 0; i < touchedProducts.length; i += BATCH) {
        const slice = touchedProducts.slice(i, i + BATCH);
        const offers = await this.prisma.tenantProductOffer.findMany({
          where: { tenantId, OR: slice.map((p) => ({ provider: p.provider, externalId: p.externalId })) },
          select: TRACK_SELECT,
        });
        emitted += await this.compareAndRecord(tenantId, offers);
      }
    }

    const lagged = new Date(now.getTime() - COMMIT_LAG_MS);
    await this.prisma.apiCatalogTracker.update({
      where: { tenantId },
      data: {
        // Sin terminar: se retoma un ms antes, para no saltear el resto de un grupo con la misma fecha.
        offersCursor: caughtUp ? (offerMark < lagged ? offerMark : lagged) : new Date(offerMark.getTime() - 1),
        productsCursor: touchedProducts.length >= MAX_PER_TICK ? productMark : lagged,
      },
    });
    return emitted;
  }

  private async compareAndRecord(tenantId: string, offers: TrackedOffer[]): Promise<number> {
    if (offers.length === 0) return 0;
    const states = await this.prisma.apiOfferState.findMany({
      where: { tenantId, OR: offers.map((o) => ({ provider: o.provider, externalId: o.externalId })) },
    });
    const byKey = new Map(states.map((s) => [`${s.provider}:${s.externalId}`, s]));
    const events: Prisma.ApiCatalogEventCreateManyInput[] = [];
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    for (const offer of offers) {
      const prev = byKey.get(`${offer.provider}:${offer.externalId}`);
      const before: OfferStateLike | null = prev
        ? { price: decimalText(prev.price), finalPrice: decimalText(prev.finalPrice), stock: prev.stock, active: prev.active, productHash: prev.productHash }
        : null;
      const after = stateOf(offer);
      const change = diffOffer(before, after);
      if (change) {
        events.push({
          tenantId,
          type: change.type,
          provider: offer.provider,
          externalId: offer.externalId,
          changed: change.changed,
          data: change.data as unknown as Prisma.InputJsonValue,
        });
      }
      if (!before || change || before.finalPrice !== after.finalPrice) {
        const row = this.stateRow(offer);
        writes.push(
          this.prisma.apiOfferState.upsert({
            where: { tenantId_provider_externalId: { tenantId, provider: offer.provider, externalId: offer.externalId } },
            create: { tenantId, provider: offer.provider, externalId: offer.externalId, ...row },
            update: row,
          })
        );
      }
    }
    if (events.length) writes.push(this.prisma.apiCatalogEvent.createMany({ data: events }));
    if (writes.length) await this.prisma.$transaction(writes);
    return events.length;
  }

  /** Ofertas borradas de la base (sync con «eliminar faltantes», vaciar catálogo, desconectar). */
  private async trackDeleted(tenantId: string, now: Date): Promise<number> {
    const gone = await this.prisma.$queryRaw<{ provider: string; externalId: string; price: Prisma.Decimal | null; stock: number | null; active: boolean }[]>`
      SELECT s."provider", s."externalId", s."price", s."stock", s."active"
      FROM "ApiOfferState" s
      LEFT JOIN "TenantProductOffer" o
        ON o."tenantId" = s."tenantId" AND o."provider" = s."provider" AND o."externalId" = s."externalId"
      WHERE s."tenantId" = ${tenantId} AND o."id" IS NULL
      LIMIT ${MAX_PER_TICK}`;
    const events: Prisma.ApiCatalogEventCreateManyInput[] = gone
      .filter((g) => g.active)
      .map((g) => ({
        tenantId,
        type: "offer.removed",
        provider: g.provider,
        externalId: g.externalId,
        changed: ["active"],
        data: { before: { price: decimalText(g.price), stock: g.stock }, after: null } as Prisma.InputJsonValue,
      }));
    await this.prisma.$transaction([
      ...(events.length ? [this.prisma.apiCatalogEvent.createMany({ data: events })] : []),
      ...(gone.length
        ? [
            this.prisma.apiOfferState.deleteMany({
              where: { tenantId, OR: gone.map((g) => ({ provider: g.provider, externalId: g.externalId })) },
            }),
          ]
        : []),
      this.prisma.apiCatalogTracker.update({ where: { tenantId }, data: { lastFullScanAt: now } }),
    ]);
    return events.length;
  }

  private async pausedNow(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.providerSyncConfig.findMany({
      where: { tenantId, pausedAt: { not: null } },
      select: { provider: true },
    });
    return rows.map((r) => r.provider).sort();
  }

  /** Avisa cuando un distribuidor pausa su sincronización y cuando vuelve. */
  private async trackProviderPauses(tenantId: string, previous: string[]): Promise<number> {
    const current = await this.pausedNow(tenantId);
    const before = new Set(previous);
    const after = new Set(current);
    const events: Prisma.ApiCatalogEventCreateManyInput[] = [
      ...current.filter((p) => !before.has(p)).map((provider) => ({ tenantId, type: "provider.sync_paused", provider, changed: [] })),
      ...previous.filter((p) => !after.has(p)).map((provider) => ({ tenantId, type: "provider.sync_resumed", provider, changed: [] })),
    ];
    if (events.length === 0) return 0;
    await this.prisma.$transaction([
      this.prisma.apiCatalogEvent.createMany({ data: events }),
      this.prisma.apiCatalogTracker.update({ where: { tenantId }, data: { pausedProviders: current } }),
    ]);
    return events.length;
  }
}
