import { Injectable, Logger } from "@nestjs/common";
import { DOCUMENT_NAME_SELECT, storedDocumentFilename } from "../../orders-api/document-filename";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { providerLabel } from "@nodo/shared";
import { cronsAreGloballyEnabled } from "../../common/cron-window";
import { distributorCuit, invoiceFromDocument, isFiscalDocument, orderNumberLabel, type InvoicePayload, type OrderDocumentRow } from "../../orders-api/order-payload";
import { PrismaService } from "../../prisma/prisma.service";
import { TgsAccessService } from "../../tgs/tgs.access";
import type { ApiPrincipal } from "../auth/api-principal";
import { Errors } from "../core/api-error";
import { publicApiUrl } from "../core/public-urls";
import { decodeOrderCursor, encodeOrderCursor, ordersForbidden } from "./orders-api.service";
import { createHash } from "crypto";

export const INVOICE_WEBHOOK_EVENTS = ["factura.nueva", "factura.actualizada"] as const;

const OVERLAP_MS = 2 * 60_000;
const PER_TICK = 500;
const MAX_PAGE = 100;
/** Un comprobante emitido hace más de esto que NODO recién encuentra (historia) no se avisa: se lee con `GET /v1/facturas`. */
const BACKFILL_SILENT_DAYS = 7;
const FISCAL_KINDS = ["FACTURA", "NOTA_CREDITO", "NOTA_DEBITO"];
/** Versión del armado de la factura (2: renglones y esquema). Al subirla, el hash se recalcula sin avisar. */
export const INVOICE_SCHEMA = 2;

const DOC_SELECT = {
  id: true,
  tenantId: true,
  orderId: true,
  provider: true,
  kind: true,
  link: true,
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
  updatedAt: true,
} satisfies Prisma.ProviderOrderDocumentSelect;

type Doc = Prisma.ProviderOrderDocumentGetPayload<{ select: typeof DOC_SELECT }>;

/** Un comprobante como sale en `GET /v1/facturas` y en los avisos `factura.*`. */
export interface InvoiceApiPayload extends Omit<InvoicePayload, "id"> {
  id: string;
  version: number;
  actualizado: string;
  distribuidor: { clave: string; nombre: string; cuit: string | null };
  /** El pedido de NODO de esta factura, o null si no se pudo unir a ninguno. */
  pedido: { id: string; numero: string | null; union: string | null } | null;
}

/**
 * API de facturas (Sistema TGS → AcuStock): todos los comprobantes que NODO
 * guardó de los portales, unidos o no a un pedido. Cada minuto revisa los que
 * cambiaron, sube la versión si cambió algo visible y deja un evento
 * (`factura.nueva`, `factura.actualizada`) en la misma cola que los de pedidos.
 */
@Injectable()
export class InvoicesApiService {
  private readonly logger = new Logger(InvoicesApiService.name);
  private running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tgs: TgsAccessService
  ) {}

  async assertAllowed(principal: Pick<ApiPrincipal, "scopes" | "tenantId">) {
    if (!principal.scopes.includes("orders:read")) throw Errors.scopeRequired("orders:read");
    if ((await this.tgs.allowedTenantId()) !== principal.tenantId) throw ordersForbidden();
  }

  @Cron("*/1 * * * *")
  async tick() {
    if (!cronsAreGloballyEnabled()) return;
    const tenantId = await this.tgs.allowedTenantId().catch(() => null);
    if (!tenantId) return;
    await this.refresh(tenantId).catch((err) => this.logger.error(`Facturas API: ${(err as Error).message}`));
  }

  async refresh(tenantId: string, now = new Date()): Promise<number> {
    if (this.running.has(tenantId)) return 0;
    this.running.add(tenantId);
    try {
      // La fila la crea la API de pedidos en su primera revisión.
      const tracker = await this.prisma.apiOrderTracker.findUnique({ where: { tenantId } });
      if (!tracker) return 0;
      const firstRun = tracker.invoicesCheckedUntil == null;
      if (!firstRun) await this.rebaseline(tenantId, now);
      let since = tracker.invoicesCheckedUntil ? new Date(tracker.invoicesCheckedUntil.getTime() - OVERLAP_MS) : new Date(0);
      let lastSeen = tracker.invoicesCheckedUntil ?? new Date(0);
      let emitted = 0;
      for (;;) {
        const docs = await this.prisma.providerOrderDocument.findMany({
          where: { tenantId, updatedAt: { gte: since }, kind: { in: FISCAL_KINDS }, assetId: { not: null } },
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          take: PER_TICK,
          select: DOC_SELECT,
        });
        if (docs.length === 0) break;
        const ctx = await this.context(docs);
        for (const d of docs) {
          emitted += await this.track(d, ctx, { firstRun, now });
          if (d.updatedAt > lastSeen) lastSeen = d.updatedAt;
        }
        if (docs.length < PER_TICK) break;
        const last = docs[docs.length - 1].updatedAt;
        since = last.getTime() === since.getTime() ? new Date(last.getTime() + 1) : last;
      }
      await this.prisma.apiOrderTracker.update({ where: { tenantId }, data: { invoicesCheckedUntil: lastSeen.getTime() > 0 ? lastSeen : now } });
      return emitted;
    } finally {
      this.running.delete(tenantId);
    }
  }

  /** Al subir INVOICE_SCHEMA: recalcula el hash de todas las facturas publicadas, sin avisar. */
  private async rebaseline(tenantId: string, now: Date) {
    for (;;) {
      const old = await this.prisma.apiInvoiceState.findMany({ where: { tenantId, schema: { lt: INVOICE_SCHEMA } }, take: PER_TICK, select: { documentId: true } });
      if (old.length === 0) return;
      const docs = await this.prisma.providerOrderDocument.findMany({ where: { tenantId, id: { in: old.map((s) => s.documentId) } }, select: DOC_SELECT });
      const ctx = await this.context(docs);
      for (const d of docs) await this.track(d, ctx, { firstRun: false, now });
      const found = new Set(docs.filter((d) => isFiscalDocument(d)).map((d) => d.id));
      const gone = old.map((s) => s.documentId).filter((id) => !found.has(id));
      if (gone.length) await this.prisma.apiInvoiceState.updateMany({ where: { documentId: { in: gone } }, data: { schema: INVOICE_SCHEMA } });
      if (old.length < PER_TICK) return;
    }
  }

  private async track(d: Doc, ctx: Ctx, opts: { firstRun: boolean; now: Date }): Promise<number> {
    if (!isFiscalDocument(d)) return 0;
    const hash = hashOf(this.payloadOf(d, ctx, { version: 1, changedAt: opts.now }, true));
    const state = await this.prisma.apiInvoiceState.findUnique({ where: { documentId: d.id } });
    const issued = d.fechaEmision ? new Date(`${d.fechaEmision}T12:00:00-03:00`) : d.createdAt;
    const old = opts.now.getTime() - issued.getTime() > BACKFILL_SILENT_DAYS * 86_400_000;
    if (state && (state.schema ?? 1) < INVOICE_SCHEMA) {
      // El armado sumó campos: se recalcula sin avisar.
      await this.prisma.apiInvoiceState.update({ where: { documentId: d.id }, data: { hash, schema: INVOICE_SCHEMA } });
      return 0;
    }
    if (state && state.hash === hash) return 0;
    if (!state) {
      const silent = opts.firstRun || old;
      const changedAt = silent ? d.updatedAt : opts.now;
      const create = this.prisma.apiInvoiceState.create({ data: { documentId: d.id, tenantId: d.tenantId, hash, version: 1, changedAt, schema: INVOICE_SCHEMA } });
      if (silent) {
        await create;
        return 0;
      }
      await this.prisma.$transaction([create, this.prisma.apiOrderEvent.create({ data: { tenantId: d.tenantId, orderId: d.id, type: "factura.nueva", version: 1 } })]);
      return 1;
    }
    const version = state.version + 1;
    if (old) {
      // Historia que se completa (renglones, unión a un pedido): nueva versión, sin aviso.
      await this.prisma.apiInvoiceState.update({ where: { documentId: d.id }, data: { hash, version, changedAt: opts.now } });
      return 0;
    }
    await this.prisma.$transaction([
      this.prisma.apiInvoiceState.update({ where: { documentId: d.id }, data: { hash, version, changedAt: opts.now } }),
      this.prisma.apiOrderEvent.create({ data: { tenantId: d.tenantId, orderId: d.id, type: "factura.actualizada", version } }),
    ]);
    return 1;
  }

  // ---------- Lectura ----------

  /** `GET /v1/facturas?desde=`: los comprobantes que cambiaron desde esa fecha, del más viejo al más nuevo. */
  async list(principal: ApiPrincipal, query: { desde?: string; cursor?: string; limit?: number; pedido?: string; distribuidor?: string }) {
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
    const where: Prisma.ApiInvoiceStateWhereInput = { tenantId };
    if (after) where.OR = [{ changedAt: { gt: after.changedAt } }, { changedAt: after.changedAt, documentId: { gt: after.orderId } }];
    else if (since) where.changedAt = { gte: since };
    const states = await this.prisma.apiInvoiceState.findMany({ where, orderBy: [{ changedAt: "asc" }, { documentId: "asc" }], take: limit + 1 });
    const page = states.slice(0, limit);
    let data = await this.payloads(tenantId, page);
    if (query.pedido === "con") data = data.filter((f) => f.pedido);
    if (query.pedido === "sin") data = data.filter((f) => !f.pedido);
    if (query.distribuidor) data = data.filter((f) => f.distribuidor.clave === query.distribuidor);
    const last = page[page.length - 1];
    return {
      data,
      meta: { count: data.length, hasMore: states.length > limit, nextCursor: last ? encodeOrderCursor(last.changedAt, last.documentId) : query.cursor ?? null },
    };
  }

  async get(principal: ApiPrincipal, id: string): Promise<InvoiceApiPayload> {
    await this.assertAllowed(principal);
    await this.refresh(principal.tenantId);
    const state = await this.prisma.apiInvoiceState.findFirst({ where: { documentId: id, tenantId: principal.tenantId } });
    if (!state) throw Errors.notFound("La factura");
    const [p] = await this.payloads(principal.tenantId, [state]);
    if (!p) throw Errors.notFound("La factura");
    return p;
  }

  /** `GET /v1/facturas/:id/pdf`. */
  async pdf(principal: ApiPrincipal, id: string): Promise<{ mimeType: string; filename: string; data: Buffer }> {
    await this.assertAllowed(principal);
    const tenantId = principal.tenantId;
    const doc = await this.prisma.providerOrderDocument.findFirst({ where: { id, tenantId }, select: { assetId: true, ...DOCUMENT_NAME_SELECT } });
    if (!doc?.assetId) throw Errors.notFound("La factura");
    const asset = await this.prisma.storedAsset.findFirst({ where: { id: doc.assetId, ownerTenantId: tenantId }, select: { mimeType: true, filename: true, data: true } });
    if (!asset) throw Errors.notFound("La factura");
    return { mimeType: asset.mimeType, filename: storedDocumentFilename(doc), data: Buffer.from(asset.data) };
  }

  /** El comprobante completo de cada estado publicado (API y webhooks). */
  async payloads(tenantId: string, states: { documentId: string; version: number; changedAt: Date }[]): Promise<InvoiceApiPayload[]> {
    if (states.length === 0) return [];
    const docs = await this.prisma.providerOrderDocument.findMany({ where: { tenantId, id: { in: states.map((s) => s.documentId) } }, select: DOC_SELECT });
    const byId = new Map(docs.map((d) => [d.id, d]));
    const ctx = await this.context(docs);
    const out: InvoiceApiPayload[] = [];
    for (const s of states) {
      const d = byId.get(s.documentId);
      if (d && isFiscalDocument(d)) out.push(this.payloadOf(d, ctx, { version: s.version, changedAt: s.changedAt }));
    }
    return out;
  }

  /** Para los webhooks: el comprobante de cada evento `factura.*` (id del evento = id del comprobante). */
  async payloadsById(tenantId: string, documentIds: string[]): Promise<Map<string, InvoiceApiPayload>> {
    const states = await this.prisma.apiInvoiceState.findMany({ where: { tenantId, documentId: { in: [...new Set(documentIds)] } } });
    return new Map((await this.payloads(tenantId, states)).map((p) => [p.id, p]));
  }

  // ---------- Armado ----------

  private async context(docs: Doc[]): Promise<Ctx> {
    const orderIds = [...new Set(docs.map((d) => d.orderId).filter((x): x is string => !!x))];
    const orders = orderIds.length ? await this.prisma.providerOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true } }) : [];
    const keys = [...new Set(docs.map((d) => d.provider))];
    const tenants = await this.prisma.tenant.findMany({ where: { providerKey: { in: keys } }, select: { providerKey: true, name: true } });
    return { numbers: new Map(orders.map((o) => [o.id, o.number])), names: new Map(tenants.map((t) => [t.providerKey as string, t.name])) };
  }

  private payloadOf(d: Doc, ctx: Ctx, meta: { version: number; changedAt: Date }, relativeUrls = false): InvoiceApiPayload {
    const base = relativeUrls ? "" : publicApiUrl();
    const inv = invoiceFromDocument(d as OrderDocumentRow, `${base}/v1/facturas/${d.id}/pdf`);
    return {
      ...inv,
      id: d.id,
      version: meta.version,
      actualizado: meta.changedAt.toISOString(),
      distribuidor: { clave: d.provider, nombre: ctx.names.get(d.provider) ?? providerLabel(d.provider), cuit: distributorCuit(d.provider) },
      pedido: d.orderId ? { id: d.orderId, numero: orderNumberLabel(ctx.numbers.get(d.orderId) ?? null), union: d.link } : null,
    };
  }
}

type Ctx = { numbers: Map<string, number | null>; names: Map<string, string> };

function hashOf(p: InvoiceApiPayload): string {
  const { version: _v, actualizado: _a, ...rest } = p;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}
