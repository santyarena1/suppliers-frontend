import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { ApiWebhookDelivery, ApiWebhookEndpoint, Prisma } from "@prisma/client";
import {
  CATALOG_API_WEBHOOK_EVENTS,
  type CatalogApiWebhookEvent,
  type DeliveryView,
  type WebhookView,
} from "@nodo/shared";
import { cronsAreGloballyEnabled } from "../../common/cron-window";
import { CryptoService } from "../../common/crypto/crypto.service";
import { PrismaService } from "../../prisma/prisma.service";
import { newWebhookSecret } from "../auth/api-key-crypto";
import { ApiClientResolver } from "../auth/api-client-resolver.service";
import { ApiError } from "../core/api-error";
import { eventId } from "../core/ids";
import { ChangesFeedService } from "../changes/changes-feed.service";
import { assertWebhookUrl, UnsafeWebhookUrlError } from "./ssrf";
import { postWebhook } from "./webhook-http";
import { InvoicesApiService } from "../orders/invoices-api.service";
import { isInvoiceEvent, ORDER_WEBHOOK_EVENTS, OrdersApiService } from "../orders/orders-api.service";
import { DISABLE_AFTER_FAILURES, ITEMS_PER_DELIVERY, itemsFor, nextAttemptAfter } from "./webhook-events";

export const MAX_WEBHOOKS_PER_KEY = 10;
const EVENTS_PER_TICK = 1_000;
const DELIVERIES_PER_TICK = 50;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function deliveryView(d: ApiWebhookDelivery): DeliveryView {
  return {
    id: d.id,
    eventId: d.eventId,
    type: d.type,
    status: d.status as DeliveryView["status"],
    attempts: d.attempts,
    lastStatusCode: d.lastStatusCode,
    lastError: d.lastError,
    createdAt: d.createdAt.toISOString(),
    deliveredAt: iso(d.deliveredAt),
    nextAttemptAt: iso(d.nextAttemptAt),
  };
}

export function webhookView(w: ApiWebhookEndpoint, last: ApiWebhookDelivery | null): WebhookView {
  return {
    id: w.id,
    url: w.url,
    events: w.events as CatalogApiWebhookEvent[],
    active: w.active && !w.disabledAt,
    consecutiveFailures: w.consecutiveFailures,
    disabledAt: iso(w.disabledAt),
    disabledReason: w.disabledReason,
    createdAt: w.createdAt.toISOString(),
    lastDelivery: last ? deliveryView(last) : null,
  };
}

const ORDER_EVENTS = new Set<string>(ORDER_WEBHOOK_EVENTS);
export const isOrderEvent = (e: string) => ORDER_EVENTS.has(e);

function cleanEvents(events: unknown, ordersAllowed: boolean): CatalogApiWebhookEvent[] {
  if (!Array.isArray(events) || events.length === 0) throw new BadRequestException("Elegí al menos un evento");
  const valid = new Set<string>([...CATALOG_API_WEBHOOK_EVENTS, ...ORDER_WEBHOOK_EVENTS]);
  const out = [...new Set(events.map(String))];
  const bad = out.filter((e) => !valid.has(e));
  if (bad.length) throw new BadRequestException(`Eventos desconocidos: ${bad.join(", ")}`);
  if (!ordersAllowed && out.some(isOrderEvent)) {
    throw new BadRequestException("Los avisos de pedidos necesitan el permiso orders:read y todavía son solo para The Gamer Shop");
  }
  return out as CatalogApiWebhookEvent[];
}

function cleanUrl(url: string): string {
  try {
    return assertWebhookUrl(url.trim()).toString();
  } catch (err) {
    throw new BadRequestException(err instanceof UnsafeWebhookUrlError ? err.message : "La URL no es válida");
  }
}

/**
 * Webhooks de la API de catálogo: alta, baja y entregas. Cada minuto se encolan
 * los cambios nuevos de cada webhook (desde su cursor) y se mandan las entregas
 * pendientes, firmadas, con reintentos. Tras 20 fallos seguidos se apaga solo.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly resolver: ApiClientResolver,
    private readonly changes: ChangesFeedService,
    private readonly orders: OrdersApiService,
    private readonly invoices: InvoicesApiService
  ) {}

  /** La key puede suscribirse a avisos de pedidos. */
  private async ordersAllowed(apiClientId: string): Promise<boolean> {
    const client = await this.prisma.apiClient.findUnique({ where: { id: apiClientId }, select: { tenantId: true, scopes: true } });
    if (!client || !(client.scopes as string[]).includes("orders:read")) return false;
    return this.orders.isAllowedTenant(client.tenantId);
  }

  // ---------- Alta y baja ----------

  async list(apiClientId: string): Promise<WebhookView[]> {
    const rows = await this.prisma.apiWebhookEndpoint.findMany({
      where: { apiClientId },
      orderBy: { createdAt: "asc" },
      include: { deliveries: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    return rows.map((w) => webhookView(w, w.deliveries[0] ?? null));
  }

  async create(apiClientId: string, input: { url: string; events: unknown }) {
    const url = cleanUrl(input.url);
    const events = cleanEvents(input.events, await this.ordersAllowed(apiClientId));
    const count = await this.prisma.apiWebhookEndpoint.count({ where: { apiClientId } });
    if (count >= MAX_WEBHOOKS_PER_KEY) throw new BadRequestException(`Cada key admite hasta ${MAX_WEBHOOKS_PER_KEY} webhooks`);
    const signingSecret = newWebhookSecret();
    const client = await this.prisma.apiClient.findUniqueOrThrow({ where: { id: apiClientId }, select: { tenant: { select: { id: true, mirrorsCommercialFromId: true } } } });
    // Arranca desde ahora: no se manda la historia previa.
    const cursor = await this.changes.currentEventId(client.tenant.mirrorsCommercialFromId ?? client.tenant.id);
    const orderCursor = await this.orders.currentEventId(client.tenant.id);
    const webhook = await this.prisma.apiWebhookEndpoint.create({
      data: { apiClientId, url, events, secretEncrypted: this.crypto.encrypt(signingSecret), cursor, orderCursor },
    });
    return { webhook: webhookView(webhook, null), signingSecret };
  }

  async update(id: string, input: { url?: string; events?: unknown; active?: boolean }) {
    const data: Prisma.ApiWebhookEndpointUpdateInput = {};
    if (input.url !== undefined) data.url = cleanUrl(input.url);
    if (input.events !== undefined) {
      const endpoint = await this.prisma.apiWebhookEndpoint.findUniqueOrThrow({ where: { id }, select: { apiClientId: true, orderCursor: true, apiClient: { select: { tenantId: true } } } });
      data.events = cleanEvents(input.events, await this.ordersAllowed(endpoint.apiClientId));
      // Suma avisos de pedidos: arranca desde ahora.
      if (endpoint.orderCursor == null) data.orderCursor = await this.orders.currentEventId(endpoint.apiClient.tenantId);
    }
    if (input.active !== undefined) {
      data.active = input.active;
      // Reactivar limpia el corte automático y vuelve a contar los fallos.
      if (input.active) Object.assign(data, { disabledAt: null, disabledReason: null, consecutiveFailures: 0 });
    }
    const webhook = await this.prisma.apiWebhookEndpoint.update({ where: { id }, data });
    return { webhook: await this.viewOf(webhook.id) };
  }

  async remove(id: string) {
    await this.prisma.apiWebhookEndpoint.delete({ where: { id } });
    return { id };
  }

  async rotateSecret(id: string) {
    const signingSecret = newWebhookSecret();
    await this.prisma.apiWebhookEndpoint.update({ where: { id }, data: { secretEncrypted: this.crypto.encrypt(signingSecret) } });
    return { webhook: await this.viewOf(id), signingSecret };
  }

  async deliveries(id: string, limit = 50): Promise<DeliveryView[]> {
    const rows = await this.prisma.apiWebhookDelivery.findMany({
      where: { endpointId: id },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map(deliveryView);
  }

  /** Manda un `ping` ya mismo y devuelve cómo salió. */
  async test(id: string): Promise<DeliveryView> {
    const endpoint = await this.prisma.apiWebhookEndpoint.findUnique({ where: { id } });
    if (!endpoint) throw new NotFoundException("Webhook no encontrado");
    const evt = eventId();
    const payload = { id: evt, type: "ping", createdAt: new Date().toISOString(), data: { message: "Prueba de webhook de NODO" } };
    const delivery = await this.prisma.apiWebhookDelivery.create({
      data: { endpointId: id, eventId: evt, type: "ping", payload, status: "PENDING", nextAttemptAt: null },
    });
    return deliveryView(await this.attempt(endpoint, delivery, { countFailures: false, retry: false }));
  }

  async viewOf(id: string): Promise<WebhookView> {
    const w = await this.prisma.apiWebhookEndpoint.findUnique({
      where: { id },
      include: { deliveries: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!w) throw new NotFoundException("Webhook no encontrado");
    return webhookView(w, w.deliveries[0] ?? null);
  }

  /** Avisa al comercio (campana de NODO) que un webhook se apagó. */
  private async notifyDisabled(endpoint: ApiWebhookEndpoint, error: string | null) {
    const client = await this.prisma.apiClient.findUnique({ where: { id: endpoint.apiClientId }, select: { tenantId: true, name: true } });
    if (!client) return;
    await this.prisma.orgNotification
      .create({
        data: {
          toTenantId: client.tenantId,
          kind: "SYSTEM",
          title: `Se apagó un webhook de la API de catálogo (${client.name})`,
          body: `${endpoint.url} falló ${DISABLE_AFTER_FAILURES} veces seguidas. Revisalo y reactivalo desde Configuración → API de catálogo. Último error: ${error ?? "sin respuesta"}`.slice(0, 1000),
          landingKey: `catalog-api-webhook:${endpoint.id}`,
        },
      })
      .catch((err) => this.logger.warn(`No se pudo avisar del webhook apagado: ${(err as Error).message}`));
  }

  // ---------- Despacho ----------

  @Cron("*/1 * * * *")
  async tick() {
    if (!cronsAreGloballyEnabled() || this.running) return;
    this.running = true;
    try {
      await this.enqueueAll();
      await this.deliverDue();
    } catch (err) {
      this.logger.error(`Webhooks: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Encola los cambios nuevos de cada webhook activo. */
  async enqueueAll(now = new Date()) {
    const endpoints = await this.prisma.apiWebhookEndpoint.findMany({
      where: { active: true, disabledAt: null, apiClient: { status: "ACTIVE" } },
    });
    for (const endpoint of endpoints) {
      await this.enqueue(endpoint, now).catch((err) => {
        // Sin módulo o con la suscripción suspendida no se encola: se retoma al volver.
        if (!(err instanceof ApiError)) this.logger.warn(`Webhook ${endpoint.id}: ${(err as Error).message}`);
      });
    }
  }

  async enqueue(endpoint: ApiWebhookEndpoint, now = new Date()): Promise<number> {
    const principal = await this.resolver.byClientId(endpoint.apiClientId, now);
    const orderDeliveries = endpoint.events.some(isOrderEvent) ? await this.enqueueOrders(endpoint, principal, now) : 0;
    return orderDeliveries + (await this.enqueueCatalog(endpoint, principal, now));
  }

  /**
   * Avisos de pedidos: uno por evento, con el pedido completo. Solo para la
   * organización habilitada y con el permiso; si se lo sacan, no se manda nada.
   */
  private async enqueueOrders(endpoint: ApiWebhookEndpoint, principal: Awaited<ReturnType<ApiClientResolver["byClientId"]>>, now: Date): Promise<number> {
    if (!principal.scopes.includes("orders:read") || !(await this.orders.isAllowedTenant(principal.tenantId))) return 0;
    const tenantId = principal.tenantId;
    if (endpoint.orderCursor == null) {
      await this.prisma.apiWebhookEndpoint.update({ where: { id: endpoint.id }, data: { orderCursor: await this.orders.currentEventId(tenantId) } });
      return 0;
    }
    const events = await this.orders.eventsAfter(tenantId, endpoint.orderCursor, EVENTS_PER_TICK);
    if (events.length === 0) return 0;
    const wanted = new Set(endpoint.events);
    const relevant = events.filter((e) => wanted.has(e.type));
    const orderEvents = relevant.filter((e) => !isInvoiceEvent(e.type));
    const states = await this.prisma.apiOrderState.findMany({ where: { orderId: { in: [...new Set(orderEvents.map((e) => e.orderId))] } } });
    const payloads = new Map((await this.orders.payloads(tenantId, states)).map((p) => [p.id, p]));
    const invoiceEvents = relevant.filter((e) => isInvoiceEvent(e.type));
    const invoices = invoiceEvents.length ? await this.invoices.payloadsById(tenantId, invoiceEvents.map((e) => e.orderId)) : new Map();
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    for (const e of relevant) {
      // Siempre el pedido (o la factura) como está ahora: si cambió dos veces seguidas, llega la última versión.
      const data = isInvoiceEvent(e.type) ? (invoices.get(e.orderId) ? { factura: invoices.get(e.orderId) } : null) : payloads.get(e.orderId) ? { pedido: payloads.get(e.orderId) } : null;
      if (!data) continue;
      const evt = eventId();
      const payload = { id: evt, type: e.type, createdAt: now.toISOString(), data };
      writes.push(
        this.prisma.apiWebhookDelivery.create({
          data: { endpointId: endpoint.id, eventId: evt, type: e.type, payload: payload as unknown as Prisma.InputJsonValue, nextAttemptAt: now },
        })
      );
    }
    writes.push(this.prisma.apiWebhookEndpoint.update({ where: { id: endpoint.id }, data: { orderCursor: events[events.length - 1].id } }));
    await this.prisma.$transaction(writes);
    return writes.length - 1;
  }

  private async enqueueCatalog(endpoint: ApiWebhookEndpoint, principal: Awaited<ReturnType<ApiClientResolver["byClientId"]>>, now: Date): Promise<number> {
    if (!endpoint.events.some((e) => !isOrderEvent(e))) return 0;
    const tenantId = principal.catalogTenantId;
    if (endpoint.cursor == null) {
      const current = await this.changes.currentEventId(tenantId);
      await this.prisma.apiWebhookEndpoint.update({ where: { id: endpoint.id }, data: { cursor: current } });
      return 0;
    }
    const events = await this.changes.eventsAfter(tenantId, endpoint.cursor, EVENTS_PER_TICK);
    if (events.length === 0) return 0;
    const items = itemsFor(endpoint.events, await this.changes.toItems(principal, events));
    const lastId = events[events.length - 1].id;
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    for (let i = 0; i < items.length; i += ITEMS_PER_DELIVERY) {
      const evt = eventId();
      const payload = {
        id: evt,
        type: "catalog.changes",
        createdAt: now.toISOString(),
        data: { items: items.slice(i, i + ITEMS_PER_DELIVERY) },
      };
      writes.push(
        this.prisma.apiWebhookDelivery.create({
          data: { endpointId: endpoint.id, eventId: evt, type: "catalog.changes", payload: payload as unknown as Prisma.InputJsonValue, nextAttemptAt: now },
        })
      );
    }
    // El cursor avanza en la misma transacción que se encola: nada se pierde ni se duplica.
    writes.push(this.prisma.apiWebhookEndpoint.update({ where: { id: endpoint.id }, data: { cursor: lastId } }));
    await this.prisma.$transaction(writes);
    return Math.ceil(items.length / ITEMS_PER_DELIVERY);
  }

  async deliverDue(now = new Date()) {
    const due = await this.prisma.apiWebhookDelivery.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: now }, endpoint: { active: true, disabledAt: null } },
      orderBy: { nextAttemptAt: "asc" },
      take: DELIVERIES_PER_TICK,
      include: { endpoint: true },
    });
    for (const delivery of due) {
      await this.attempt(delivery.endpoint, delivery, { countFailures: true, retry: true }, now);
    }
  }

  private async attempt(
    endpoint: ApiWebhookEndpoint,
    delivery: ApiWebhookDelivery,
    opts: { countFailures: boolean; retry: boolean },
    now = new Date()
  ): Promise<ApiWebhookDelivery> {
    const result = await postWebhook({
      url: endpoint.url,
      secret: this.crypto.decrypt(endpoint.secretEncrypted),
      eventId: delivery.eventId,
      type: delivery.type,
      body: JSON.stringify(delivery.payload),
    });
    const attempts = delivery.attempts + 1;
    if (result.ok) {
      const [updated] = await this.prisma.$transaction([
        this.prisma.apiWebhookDelivery.update({
          where: { id: delivery.id },
          data: { status: "DELIVERED", attempts, lastStatusCode: result.status, lastError: null, deliveredAt: now, nextAttemptAt: null },
        }),
        this.prisma.apiWebhookEndpoint.update({ where: { id: endpoint.id }, data: { consecutiveFailures: 0 } }),
      ]);
      return updated;
    }
    const next = opts.retry ? nextAttemptAfter(attempts, now) : null;
    const failures = endpoint.consecutiveFailures + (opts.countFailures ? 1 : 0);
    const disable = opts.countFailures && failures >= DISABLE_AFTER_FAILURES;
    const [updated] = await this.prisma.$transaction([
      this.prisma.apiWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: next ? "PENDING" : "FAILED",
          attempts,
          lastStatusCode: result.status,
          lastError: result.error,
          nextAttemptAt: next,
        },
      }),
      this.prisma.apiWebhookEndpoint.update({
        where: { id: endpoint.id },
        data: {
          consecutiveFailures: failures,
          ...(disable
            ? { disabledAt: now, disabledReason: `Se apagó solo después de ${DISABLE_AFTER_FAILURES} entregas fallidas seguidas. Último error: ${result.error ?? "sin respuesta"}` }
            : {}),
        },
      }),
    ]);
    if (disable) {
      this.logger.warn(`Webhook ${endpoint.id} apagado tras ${failures} fallos seguidos`);
      await this.notifyDisabled(endpoint, result.error);
    }
    return updated;
  }
}
