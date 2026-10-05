import { Injectable } from "@nestjs/common";
import type { ApiCatalogEvent } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { ApiPrincipal } from "../auth/api-principal";
import { Errors } from "../core/api-error";
import { CatalogQueryService, type ListMeta } from "../core/catalog-query.service";
import { decodeCursor, encodeCursor, InvalidCursorError } from "../core/cursor";
import { offerIdFor } from "../core/ids";
import type { OfferView } from "../core/projection";
import type { ChangedField } from "./offer-diff";

export const CHANGES_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

export type ChangeType =
  | "offer.created"
  | "offer.updated"
  | "offer.removed"
  | "provider.sync_paused"
  | "provider.sync_resumed";

export interface ChangeItem {
  /** Id del cambio (creciente). */
  id: string;
  type: ChangeType;
  at: string;
  /** En offer.updated: qué cambió (`price`, `stock`, `product`). */
  changed?: ChangedField[];
  offerId?: string;
  productId?: string;
  /** La oferta como la ve la key ahora (created/updated). */
  offer?: OfferView;
  provider?: { id: string; name: string };
}

export interface ChangesPage {
  data: ChangeItem[];
  pagination: { nextCursor: string; hasMore: boolean; limit: number };
  meta: ListMeta | { generatedAt: string };
}

interface ChangesCursor {
  e: string;
  /** Cuándo se emitió el cursor (para avisar que venció). */
  t: number;
}

export function encodeChanges(eventId: bigint, now = Date.now()): string {
  return encodeCursor({ e: eventId.toString(), t: now });
}

export function decodeChanges(raw: string, now = Date.now()): bigint {
  let c: ChangesCursor;
  try {
    c = decodeCursor<ChangesCursor>(raw);
  } catch (err) {
    throw Errors.invalidCursor((err as InvalidCursorError).message);
  }
  if (typeof c.e !== "string" || !/^\d+$/.test(c.e) || typeof c.t !== "number") {
    throw Errors.invalidCursor("El cursor no es de /v1/changes.");
  }
  if (now - c.t > CHANGES_RETENTION_DAYS * DAY_MS) throw Errors.cursorExpired();
  return BigInt(c.e);
}

/**
 * Cambios del catálogo vistos por una key: eventos del comercio en orden, con la
 * oferta como la ve esa key. Lo que la key no ve (distribuidor excluido, sin
 * stock cuando no lo incluye) llega como `offer.removed`, así el sistema del
 * otro lado puede sacarlo sin tener que adivinar.
 */
@Injectable()
export class ChangesFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogQueryService
  ) {}

  async currentEventId(tenantId: string): Promise<bigint> {
    const last = await this.prisma.apiCatalogEvent.findFirst({
      where: { tenantId },
      orderBy: { id: "desc" },
      select: { id: true },
    });
    return last?.id ?? 0n;
  }

  /** Sin cursor: devuelve el cursor actual, para arrancar después de un export completo. */
  async page(principal: ApiPrincipal, cursor: string | undefined, limit: number): Promise<ChangesPage> {
    if (!cursor) {
      const id = await this.currentEventId(principal.catalogTenantId);
      return {
        data: [],
        pagination: { nextCursor: encodeChanges(id), hasMore: false, limit },
        meta: { generatedAt: new Date().toISOString() },
      };
    }
    const after = decodeChanges(cursor);
    const events = await this.eventsAfter(principal.catalogTenantId, after, limit + 1);
    const hasMore = events.length > limit;
    const slice = events.slice(0, limit);
    const items = await this.toItems(principal, slice);
    const lastId = slice.length ? slice[slice.length - 1].id : after;
    const { meta } = await this.catalog.allForKey(principal);
    return { data: items, pagination: { nextCursor: encodeChanges(lastId), hasMore, limit }, meta };
  }

  eventsAfter(tenantId: string, after: bigint, take: number) {
    return this.prisma.apiCatalogEvent.findMany({
      where: { tenantId, id: { gt: after } },
      orderBy: { id: "asc" },
      take,
    });
  }

  /** De eventos del comercio a cambios vistos por la key. Los que la key no ve se descartan. */
  async toItems(principal: ApiPrincipal, events: ApiCatalogEvent[]): Promise<ChangeItem[]> {
    const config = principal.config;
    const providers = (await this.catalog.snapshotFor(principal)).providers;
    const items: ChangeItem[] = [];
    for (const event of events) {
      if (config.providers.mode === "only" && !config.providers.keys.includes(event.provider)) continue;
      const info = providers.get(event.provider);
      const provider =
        config.providerIdentity === "visible"
          ? { id: info?.aliasId ?? event.provider, name: info?.name ?? event.provider }
          : { id: info?.aliasId ?? "prv_unknown", name: info?.aliasName ?? "Proveedor" };
      const base = { id: event.id.toString(), at: event.createdAt.toISOString() };
      if (event.type === "provider.sync_paused" || event.type === "provider.sync_resumed") {
        items.push({ ...base, type: event.type, provider });
        continue;
      }
      if (!event.externalId) continue;
      const offerId = offerIdFor(event.provider, event.externalId);
      const offer = event.type === "offer.removed" ? null : await this.catalog.offerForKey(principal, event.provider, event.externalId);
      if (!offer) {
        // Una oferta nueva que esta key no ve no le cambia nada; una que deja de ver, sí.
        if (event.type === "offer.created") continue;
        items.push({ ...base, type: "offer.removed", offerId });
        continue;
      }
      items.push({
        ...base,
        type: event.type as ChangeType,
        ...(event.type === "offer.updated" ? { changed: event.changed as ChangedField[] } : {}),
        offerId,
        productId: offer.productId,
        offer,
      });
    }
    return items;
  }
}
