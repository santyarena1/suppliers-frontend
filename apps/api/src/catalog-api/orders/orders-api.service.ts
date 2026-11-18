import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { providerLabel } from "@nodo/shared";
import { cronsAreGloballyEnabled } from "../../common/cron-window";
import { PrismaService } from "../../prisma/prisma.service";
import { TgsAccessService } from "../../tgs/tgs.access";
import { invoicedByDocuments } from "../../orders-api/document-providers";
import {
  buildOrderPayload,
  distributorCuit,
  hasFiscalInvoice,
  isPublishable,
  orderState,
  payloadHash,
  type CatalogFacts,
  type OrderDocumentRow,
  type OrderPayload,
  type OrderRow,
} from "../../orders-api/order-payload";
import type { ApiPrincipal } from "../auth/api-principal";
import { ApiError, Errors } from "../core/api-error";
import { CatalogSnapshotService } from "../core/catalog-snapshot.service";
import { cleanGtin, groupKeyFor, productIdFor } from "../core/ids";
import { publicApiUrl } from "../core/public-urls";

export const ORDER_WEBHOOK_EVENTS = ["pedido.creado", "pedido.actualizado", "pedido.cancelado", "pedido.facturado", "factura.nueva", "factura.actualizada"] as const;
export type OrderWebhookEvent = (typeof ORDER_WEBHOOK_EVENTS)[number];
/** Los avisos `factura.*` usan la misma cola (`ApiOrderEvent`): `orderId` es el id del comprobante. */
export const isInvoiceEvent = (type: string) => type.startsWith("factura.");

/** Se vuelve a mirar un rato hacia atrás: un pedido guardado justo al cortar no se pierde. */
const OVERLAP_MS = 2 * 60_000;
const ORDERS_PER_TICK = 500;
const MAX_PAGE = 100;
/**
 * Versión del armado del pedido. Al sumar campos (2: facturas y remitos), el
 * hash de cada pedido se recalcula una vez sin avisar: no cambió el pedido.
 */
export const PAYLOAD_SCHEMA = 4;

const DOCUMENT_SELECT = {
  id: true,
  orderId: true,
  kind: true,
  portalNumber: true,
  tipo: true,
  puntoVenta: true,
  numero: true,
  fechaEmision: true,
  cae: true,
  caeVencimiento: true,
  cuitEmisor: true,
  importeTotal: true,
  moneda: true,
  cotizacion: true,
  origen: true,
  assetId: true,
  generated: true,
  lines: true,
  scheme: true,
  createdAt: true,
} satisfies Prisma.ProviderOrderDocumentSelect;

type Ctx = { version: number; changedAt: Date; facts: Map<string, CatalogFacts>; names: Map<string, string>; docs: Map<string, OrderDocumentRow[]> };

const ORDER_SELECT = {
  id: true,
  number: true,
  tenantId: true,
  provider: true,
  status: true,
  channel: true,
  approvalStatus: true,
  invidOrderNumber: true,
  invidWebOrderNumber: true,
  paymentOption: true,
  paymentLabel: true,
  deliveryOption: true,
  deliveryLabel: true,
  notes: true,
  subtotal: true,
  impuestos: true,
  percepciones: true,
  total: true,
  items: true,
  addressSnapshot: true,
  draftInput: true,
  rejectionReason: true,
  approvalDecidedAt: true,
  storefrontStatus: true,
  trackingStage: true,
  trackingStatus: true,
  trackingInvoice: true,
  trackingNumber: true,
  trackingCarrier: true,
  trackingChangedAt: true,
  trackingHistory: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, username: true } },
  approvedBy: { select: { id: true, username: true } },
  user: { select: { id: true, username: true } },
} satisfies Prisma.ProviderOrderSelect;

type LoadedOrder = Prisma.ProviderOrderGetPayload<{ select: typeof ORDER_SELECT }>;

export const ordersForbidden = () =>
  new ApiError(403, "orders_unavailable", "La API de pedidos todavía no está disponible para esta organización.");

/** Cursor de `GET /v1/pedidos`: fecha de cambio + id del último pedido de la página. */
export function encodeOrderCursor(changedAt: Date, orderId: string): string {
  return Buffer.from(`${changedAt.toISOString()}|${orderId}`).toString("base64url");
}

export function decodeOrderCursor(raw: string): { changedAt: Date; orderId: string } {
  const [at, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const changedAt = new Date(at ?? "");
  if (!id || Number.isNaN(changedAt.getTime())) throw Errors.invalidCursor("El cursor no es válido. Usá el `nextCursor` de la página anterior.");
  return { changedAt, orderId: id };
}

/**
 * API de pedidos (Sistema TGS → AcuStock). Cada minuto revisa los pedidos que
 * cambiaron del comercio habilitado, los numera (NODO-<n>), arma el pedido
 * completo y, si cambió algo de lo que ve quien lee la API, sube la versión y
 * deja un evento (`pedido.creado`, `pedido.actualizado`, `pedido.cancelado`)
 * que los webhooks reparten. Mirar en lugar de avisar desde cada lugar que
 * escribe pedidos (son más de 15) hace que no se pierda ninguno.
 */
@Injectable()
export class OrdersApiService {
  private readonly logger = new Logger(OrdersApiService.name);
  private running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tgs: TgsAccessService,
    private readonly snapshots: CatalogSnapshotService
  ) {}

  // ---------- Acceso ----------

  async isAllowedTenant(tenantId: string): Promise<boolean> {
    return (await this.tgs.allowedTenantId()) === tenantId;
  }

  /** La key tiene el permiso y es de la organización habilitada. */
  async assertAllowed(principal: Pick<ApiPrincipal, "scopes" | "tenantId">) {
    if (!principal.scopes.includes("orders:read")) throw Errors.scopeRequired("orders:read");
    if (!(await this.isAllowedTenant(principal.tenantId))) throw ordersForbidden();
  }

  // ---------- Revisión periódica ----------

  @Cron("*/1 * * * *")
  async tick() {
    if (!cronsAreGloballyEnabled()) return;
    const tenantId = await this.tgs.allowedTenantId().catch(() => null);
    if (!tenantId) return;
    await this.refresh(tenantId).catch((err) => this.logger.error(`Pedidos API: ${(err as Error).message}`));
  }

  /**
   * Revisa los pedidos del comercio que cambiaron desde la última vez. La primera
   * vez registra todos sin avisar (la historia se lee con `GET /v1/pedidos`).
   */
  async refresh(tenantId: string, now = new Date()): Promise<number> {
    if (this.running.has(tenantId)) return 0;
    this.running.add(tenantId);
    try {
      const tracker = await this.prisma.apiOrderTracker.findUnique({ where: { tenantId } });
      const firstRun = !tracker;
      if (!firstRun) await this.rebaseline(tenantId, now);
      let emitted = 0;
      const startedFrom = tracker ? new Date(tracker.checkedUntil.getTime() - OVERLAP_MS) : new Date(0);
      let since = startedFrom;
      let lastSeen = tracker?.checkedUntil ?? new Date(0);
      const seen = new Set<string>();
      for (;;) {
        const orders = await this.prisma.providerOrder.findMany({
          where: { tenantId, updatedAt: { gte: since } },
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          take: ORDERS_PER_TICK,
          select: ORDER_SELECT,
        });
        if (orders.length === 0) break;
        const names = await this.distributorNames(orders.map((o) => o.provider));
        const docs = await this.documentsOf(orders.map((o) => o.id));
        for (const order of orders) {
          seen.add(order.id);
          emitted += await this.track(order, { firstRun, names, docs, now });
          if (order.updatedAt > lastSeen) lastSeen = order.updatedAt;
        }
        if (orders.length < ORDERS_PER_TICK) break;
        const last = orders[orders.length - 1].updatedAt;
        // Página llena con todos del mismo instante: se avanza 1 ms para no quedar en un bucle.
        since = last.getTime() === since.getTime() ? new Date(last.getTime() + 1) : last;
      }
      // Pedidos sin cambios propios a los que se les guardó una factura o un remito.
      const changedDocs = await this.prisma.providerOrderDocument.findMany({
        where: { tenantId, updatedAt: { gte: startedFrom } },
        select: { orderId: true, updatedAt: true },
        orderBy: { updatedAt: "asc" },
        take: ORDERS_PER_TICK,
      });
      const docOrderIds = [...new Set(changedDocs.map((d) => d.orderId))].filter((id): id is string => !!id && !seen.has(id));
      if (docOrderIds.length) {
        const orders = await this.prisma.providerOrder.findMany({ where: { tenantId, id: { in: docOrderIds } }, select: ORDER_SELECT });
        const names = await this.distributorNames(orders.map((o) => o.provider));
        const docs = await this.documentsOf(orders.map((o) => o.id));
        for (const order of orders) emitted += await this.track(order, { firstRun, names, docs, now });
      }
      for (const d of changedDocs) if (d.updatedAt > lastSeen) lastSeen = d.updatedAt;
      await this.prisma.apiOrderTracker.upsert({
        where: { tenantId },
        create: { tenantId, checkedUntil: lastSeen.getTime() > 0 ? lastSeen : now },
        update: { checkedUntil: lastSeen.getTime() > 0 ? lastSeen : now },
      });
      if (firstRun) this.logger.log(`Pedidos API: primera revisión del comercio ${tenantId} (sin avisos de la historia)`);
      return emitted;
    } finally {
      this.running.delete(tenantId);
    }
  }

  private async track(
    order: LoadedOrder,
    ctx: { firstRun: boolean; names: Map<string, string>; docs: Map<string, OrderDocumentRow[]>; now: Date }
  ): Promise<number> {
    const state = await this.prisma.apiOrderState.findUnique({ where: { orderId: order.id } });
    if (!state && !isPublishable(order)) return 0;
    const number = order.number ?? (await this.assignNumber(order.tenantId, order.id));
    const row = { ...order, number } as unknown as OrderRow;
    // El hash no mira el catálogo (que cambie una marca o un EAN no es un cambio del pedido)
    // ni el dominio de la API (los links de los PDF van sin dominio).
    const payload = this.payloadOf(row, { version: 1, changedAt: ctx.now, facts: new Map(), names: ctx.names, docs: ctx.docs }, true);
    const hash = payloadHash(payload);
    const cancelled = orderState(row) === "cancelado";
    // Elit y Solution Box: facturado = hay datos fiscales guardados. El resto: el portal mostró la factura.
    const invoiced = invoicedByDocuments(row.provider) ? hasFiscalInvoice(payload) : hasFiscalInvoice(payload) || Boolean(row.trackingInvoice?.trim());
    if (state && (state.schema ?? 1) < PAYLOAD_SCHEMA) {
      // El armado sumó campos: se recalcula el hash sin avisar ni subir la versión.
      await this.prisma.apiOrderState.update({ where: { orderId: order.id }, data: { hash, schema: PAYLOAD_SCHEMA, invoiced: state.invoiced && invoiced } });
      return 0;
    }
    if (state && state.hash === hash) return 0;

    if (!state) {
      const changedAt = ctx.firstRun ? order.updatedAt : ctx.now;
      const data = { orderId: order.id, tenantId: order.tenantId, hash, version: 1, changedAt, cancelled, invoiced, schema: PAYLOAD_SCHEMA };
      if (ctx.firstRun) {
        await this.prisma.apiOrderState.create({ data });
        return 0;
      }
      await this.prisma.$transaction([
        this.prisma.apiOrderState.create({ data }),
        this.prisma.apiOrderEvent.create({ data: { tenantId: order.tenantId, orderId: order.id, type: "pedido.creado", version: 1 } }),
      ]);
      return 1;
    }

    const version = state.version + 1;
    const type: OrderWebhookEvent =
      cancelled && !state.cancelled ? "pedido.cancelado" : invoiced && !state.invoiced ? "pedido.facturado" : "pedido.actualizado";
    await this.prisma.$transaction([
      this.prisma.apiOrderState.update({ where: { orderId: order.id }, data: { hash, version, changedAt: ctx.now, cancelled, invoiced } }),
      this.prisma.apiOrderEvent.create({ data: { tenantId: order.tenantId, orderId: order.id, type, version } }),
    ]);
    return 1;
  }

  /**
   * Cuando el armado del pedido suma campos (`PAYLOAD_SCHEMA`), recalcula el hash
   * de todos los pedidos ya publicados sin avisar: si no, el primer cambio real de
   * cada pedido se confundiría con el cambio de armado.
   */
  private async rebaseline(tenantId: string, now: Date) {
    for (;;) {
      const old = await this.prisma.apiOrderState.findMany({ where: { tenantId, schema: { lt: PAYLOAD_SCHEMA } }, take: ORDERS_PER_TICK, select: { orderId: true } });
      if (old.length === 0) return;
      const orders = await this.prisma.providerOrder.findMany({ where: { tenantId, id: { in: old.map((s) => s.orderId) } }, select: ORDER_SELECT });
      const names = await this.distributorNames(orders.map((o) => o.provider));
      const docs = await this.documentsOf(orders.map((o) => o.id));
      const found = new Set<string>();
      for (const order of orders) {
        found.add(order.id);
        await this.track(order, { firstRun: false, names, docs, now });
      }
      // Pedidos que ya no existen: se marcan igual para no volver a buscarlos.
      const gone = old.map((s) => s.orderId).filter((id) => !found.has(id));
      if (gone.length) await this.prisma.apiOrderState.updateMany({ where: { orderId: { in: gone } }, data: { schema: PAYLOAD_SCHEMA } });
      if (old.length < ORDERS_PER_TICK) return;
    }
  }

  /** NODO-<n>: el siguiente número del comercio. Reintenta si otro pedido tomó el mismo. */
  private async assignNumber(tenantId: string, orderId: string): Promise<number> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const max = await this.prisma.providerOrder.aggregate({ where: { tenantId }, _max: { number: true } });
      const next = (max._max.number ?? 0) + 1;
      try {
        const res = await this.prisma.providerOrder.updateMany({ where: { id: orderId, number: null }, data: { number: next } });
        if (res.count === 1) return next;
        const current = await this.prisma.providerOrder.findUnique({ where: { id: orderId }, select: { number: true } });
        if (current?.number != null) return current.number;
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
    }
    throw new Error(`No se pudo numerar el pedido ${orderId}`);
  }

  // ---------- Lectura ----------

  /** `GET /v1/pedidos?desde=`: los pedidos que cambiaron desde esa fecha, del más viejo al más nuevo. */
  async list(principal: ApiPrincipal, query: { desde?: string; cursor?: string; limit?: number; estado?: string }) {
    await this.assertAllowed(principal);
    const tenantId = principal.tenantId;
    await this.refresh(tenantId);
    let after: { changedAt: Date; orderId: string } | null = null;
    let since: Date | null = null;
    if (query.cursor) after = decodeOrderCursor(query.cursor);
    else if (query.desde) {
      since = new Date(query.desde);
      if (Number.isNaN(since.getTime())) throw Errors.invalidParameter("`desde` tiene que ser una fecha ISO 8601 (ej. 2026-11-16 o 2026-11-16T10:00:00-03:00).");
    }
    const limit = Math.min(Math.max(query.limit ?? 50, 1), MAX_PAGE);
    const where: Prisma.ApiOrderStateWhereInput = { tenantId };
    if (after) where.OR = [{ changedAt: { gt: after.changedAt } }, { changedAt: after.changedAt, orderId: { gt: after.orderId } }];
    else if (since) where.changedAt = { gte: since };
    const states = await this.prisma.apiOrderState.findMany({ where, orderBy: [{ changedAt: "asc" }, { orderId: "asc" }], take: limit + 1 });
    const page = states.slice(0, limit);
    const data = await this.payloads(tenantId, page);
    const filtered = query.estado ? data.filter((p) => p.estado === query.estado) : data;
    const last = page[page.length - 1];
    return {
      data: filtered,
      meta: {
        count: filtered.length,
        hasMore: states.length > limit,
        nextCursor: last ? encodeOrderCursor(last.changedAt, last.orderId) : query.cursor ?? null,
      },
    };
  }

  async get(principal: ApiPrincipal, idOrNumber: string): Promise<OrderPayload> {
    await this.assertAllowed(principal);
    const tenantId = principal.tenantId;
    await this.refresh(tenantId);
    const n = /^NODO-(\d+)$/i.exec(idOrNumber.trim())?.[1];
    const order = await this.prisma.providerOrder.findFirst({
      where: n ? { tenantId, number: Number(n) } : { tenantId, id: idOrNumber },
      select: { id: true },
    });
    const state = order ? await this.prisma.apiOrderState.findUnique({ where: { orderId: order.id } }) : null;
    if (!state) throw Errors.notFound("El pedido");
    const [payload] = await this.payloads(tenantId, [state]);
    if (!payload) throw Errors.notFound("El pedido");
    return payload;
  }

  /** El pedido completo de cada estado publicado (para la API y los webhooks). */
  async payloads(tenantId: string, states: { orderId: string; version: number; changedAt: Date }[]): Promise<OrderPayload[]> {
    if (states.length === 0) return [];
    const orders = await this.prisma.providerOrder.findMany({ where: { tenantId, id: { in: states.map((s) => s.orderId) } }, select: ORDER_SELECT });
    const byId = new Map(orders.map((o) => [o.id, o]));
    const facts = await this.catalogFacts(tenantId, orders);
    const names = await this.distributorNames(orders.map((o) => o.provider));
    const docs = await this.documentsOf(orders.map((o) => o.id));
    const out: OrderPayload[] = [];
    for (const s of states) {
      const o = byId.get(s.orderId);
      if (!o) continue;
      out.push(this.payloadOf(o as unknown as OrderRow, { version: s.version, changedAt: s.changedAt, facts, names, docs }));
    }
    return out;
  }

  /**
   * `GET /v1/pedidos/:id/documentos/:docId`: el PDF guardado de una factura o un
   * remito del pedido. Solo los del comercio de la key.
   */
  async document(principal: ApiPrincipal, idOrNumber: string, documentId: string): Promise<{ mimeType: string; filename: string; data: Buffer }> {
    await this.assertAllowed(principal);
    const tenantId = principal.tenantId;
    const n = /^NODO-(\d+)$/i.exec(idOrNumber.trim())?.[1];
    const order = await this.prisma.providerOrder.findFirst({ where: n ? { tenantId, number: Number(n) } : { tenantId, id: idOrNumber }, select: { id: true } });
    if (!order) throw Errors.notFound("El pedido");
    const doc = await this.prisma.providerOrderDocument.findFirst({ where: { id: documentId, orderId: order.id, tenantId }, select: { assetId: true } });
    if (!doc?.assetId) throw Errors.notFound("El comprobante");
    const asset = await this.prisma.storedAsset.findFirst({
      where: { id: doc.assetId, ownerTenantId: tenantId },
      select: { mimeType: true, filename: true, data: true },
    });
    if (!asset) throw Errors.notFound("El comprobante");
    return { mimeType: asset.mimeType, filename: asset.filename, data: Buffer.from(asset.data) };
  }

  /** Eventos nuevos del comercio, para los webhooks. */
  eventsAfter(tenantId: string, cursor: bigint, take: number) {
    return this.prisma.apiOrderEvent.findMany({ where: { tenantId, id: { gt: cursor } }, orderBy: { id: "asc" }, take });
  }

  async currentEventId(tenantId: string): Promise<bigint> {
    const last = await this.prisma.apiOrderEvent.findFirst({ where: { tenantId }, orderBy: { id: "desc" }, select: { id: true } });
    return last?.id ?? BigInt(0);
  }

  // ---------- Armado ----------

  private payloadOf(o: OrderRow, ctx: Ctx, relativeUrls = false): OrderPayload {
    const base = relativeUrls ? "" : publicApiUrl();
    return buildOrderPayload(o, {
      version: ctx.version,
      changedAt: ctx.changedAt,
      distributor: { name: ctx.names.get(o.provider) ?? providerLabel(o.provider), cuit: distributorCuit(o.provider) },
      catalog: (code) => ctx.facts.get(`${o.provider}|${code}`) ?? null,
      documents: ctx.docs.get(o.id) ?? [],
      documentUrl: (orderId, documentId) => `${base}/v1/pedidos/${orderId}/documentos/${documentId}`,
    });
  }

  /** Facturas y remitos guardados de cada pedido. */
  private async documentsOf(orderIds: string[]): Promise<Map<string, OrderDocumentRow[]>> {
    const out = new Map<string, OrderDocumentRow[]>();
    if (orderIds.length === 0) return out;
    const rows = await this.prisma.providerOrderDocument.findMany({ where: { orderId: { in: orderIds } }, select: DOCUMENT_SELECT });
    for (const r of rows) if (r.orderId) out.set(r.orderId, [...(out.get(r.orderId) ?? []), r]);
    return out;
  }

  private async distributorNames(providers: string[]): Promise<Map<string, string>> {
    const keys = [...new Set(providers)];
    const rows = await this.prisma.tenant.findMany({ where: { providerKey: { in: keys } }, select: { providerKey: true, name: true } });
    return new Map(rows.map((r) => [r.providerKey as string, r.name]));
  }

  /**
   * SKU, part number, EAN, marca, garantía y producto de NODO de cada renglón: del
   * catálogo del comercio (el mismo `prd_` que la API de catálogo) y, si el producto
   * ya no está publicado, de la última foto del distribuidor (el `prd_` solo con EAN válido).
   */
  private async catalogFacts(tenantId: string, orders: { provider: string; items: unknown }[]): Promise<Map<string, CatalogFacts>> {
    const wanted = new Map<string, { provider: string; code: string }>();
    for (const o of orders) {
      for (const raw of Array.isArray(o.items) ? o.items : []) {
        const it = (raw ?? {}) as Record<string, unknown>;
        const code = String(it.externalId ?? it.code ?? it.codigo ?? it.sku ?? "").trim();
        if (code) wanted.set(`${o.provider}|${code}`, { provider: o.provider, code });
      }
    }
    const out = new Map<string, CatalogFacts>();
    if (wanted.size === 0) return out;
    try {
      const snapshot = await this.snapshots.get(tenantId);
      for (const row of snapshot.rows) {
        const key = `${row.provider}|${row.externalId}`;
        if (!wanted.has(key)) continue;
        out.set(key, { sku: row.sku, partNumber: row.partNumber, ean: row.ean, brand: row.brand, warranty: row.warranty, productId: row.productId });
      }
    } catch (err) {
      this.logger.warn(`Pedidos API: sin catálogo del comercio (${(err as Error).message})`);
    }
    const missing = [...wanted.entries()].filter(([k]) => !out.has(k)).map(([, v]) => v);
    for (let i = 0; i < missing.length; i += 500) {
      const chunk = missing.slice(i, i + 500);
      const rows = await this.prisma.providerSyncCache.findMany({
        where: { OR: chunk.map((m) => ({ provider: m.provider, externalId: m.code })) },
        select: { provider: true, externalId: true, sku: true, partNumber: true, ean: true, brand: true, warranty: true },
      });
      for (const r of rows) {
        const productId = cleanGtin(r.ean) ? productIdFor(groupKeyFor({ provider: r.provider, externalId: r.externalId, ean: r.ean, partNumber: null, brand: null })) : null;
        out.set(`${r.provider}|${r.externalId}`, { sku: r.sku, partNumber: r.partNumber, ean: r.ean, brand: r.brand, warranty: r.warranty, productId });
      }
    }
    return out;
  }
}
