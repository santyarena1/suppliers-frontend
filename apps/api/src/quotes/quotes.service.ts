import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma, type SalesQuote, type SalesQuoteStatus } from "@prisma/client";
import { SALE_MARGIN_MAX, SALE_MARGIN_MIN, isProviderKey } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ProvidersService } from "../providers/providers.service";
import { hidesCost } from "../pricing/cost-visibility";
import { SaleMarginRulesService, type TenantSaleRules } from "../pricing/sale-margin-rules.service";
import { saleOf } from "../pricing/sale-pricing";
import type { TenantContext } from "../tenants/tenant-context.service";
import type { AddCustomItemDto, CreateQuoteWithItemsDto, QuoteClientDto, UpdateQuoteItemDto } from "./dto/quotes.dto";
import { QuoteSettingsService } from "./quote-settings.service";
import {
  addItem,
  atCostLines,
  customItem,
  initialsOf,
  MAX_QUOTE_ITEMS,
  readItems,
  repriceItems,
  summarize,
  type PriceChange,
  type PricedLine,
  type QuoteItem,
  type QuoteMarginSource,
} from "./quote-items";

export type QuoteStatusView = SalesQuoteStatus | "EXPIRED";

/** Ítem como lo ve quien mira: sin margen para quien no ve costos. */
export type QuoteItemView = Omit<QuoteItem, "marginPercent" | "marginSource"> & {
  marginPercent: number | null;
  /** Para quien no ve costos solo se distingue `none` (al costo) y `manual`. */
  marginSource: QuoteMarginSource | null;
};

/** Lo que la API devuelve de un presupuesto. Nunca lleva costo. */
export interface QuoteView {
  id: string;
  number: number;
  /** Iniciales del cliente o `null` (la ficha muestra el número). */
  initials: string | null;
  /** Nombre de referencia (null = sin nombre). */
  title: string | null;
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  notes: string | null;
  terms: string | null;
  items: QuoteItemView[];
  /** Total con descuento, por moneda. */
  totals: Record<string, number>;
  subtotals: Record<string, number>;
  discounts: Record<string, number>;
  itemCount: number;
  /** Estado guardado; `EXPIRED` si venció sin que el cliente decidiera. */
  status: QuoteStatusView;
  validUntil: string | null;
  /** Margen de todo el presupuesto (solo para quien ve costos). */
  marginPercent: number | null;
  discountPercent: number | null;
  /** ARS | USD | null (la que elija quien lo mira). */
  currency: string | null;
  /** Líneas del catálogo que van al costo (sin margen configurado). */
  atCostLines: number;
  /** Quien mira puede cambiar márgenes (ve costos). */
  canEditMargins: boolean;
  createdById: string;
  createdByName: string | null;
  mine: boolean;
  sentAt: string | null;
  decidedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type QuoteSort = "updated" | "created" | "number" | "validUntil";

export interface QuoteListFilter {
  archived?: boolean;
  q?: string;
  /** Solo dueño/admin: ver los de una persona. */
  createdById?: string;
  /** Un estado de QuoteStatusView (incluye EXPIRED). */
  status?: string;
  /** Creados desde/hasta (ISO, día inclusive). */
  from?: string;
  to?: string;
  sort?: QuoteSort;
  page?: number;
  pageSize?: number;
}

export interface QuoteListPage {
  items: QuoteView[];
  total: number;
  page: number;
  pageSize: number;
  /** Cuántos hay por estado con los demás filtros aplicados (para los chips). */
  counts: Record<QuoteStatusView | "ALL", number>;
}

type Viewer = Pick<
  TenantContext,
  "tenantId" | "commercialTenantId" | "userId" | "tenantRole" | "tenantType" | "permissions" | "entitlements"
>;

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Identifica una línea aunque cambie de lugar (los productos no se repiten; las libres tienen id propio). */
const lineKey = (it: Pick<QuoteItem, "provider" | "externalId">) => `${it.provider}|${it.externalId}`;
const STATUSES: readonly SalesQuoteStatus[] = ["DRAFT", "SENT", "ACCEPTED", "REJECTED"];
const VIEW_STATUSES: readonly QuoteStatusView[] = [...STATUSES, "EXPIRED"];

const SORTS: Record<QuoteSort, Prisma.SalesQuoteOrderByWithRelationInput[]> = {
  updated: [{ updatedAt: "desc" }],
  created: [{ createdAt: "desc" }],
  number: [{ number: "desc" }],
  validUntil: [{ validUntil: { sort: "asc", nulls: "last" } }],
};

/**
 * El estado como se ve (con EXPIRED, que no se guarda) traducido a un filtro:
 * borrador y enviado solo cuentan mientras no vencieron.
 */
export function statusWhere(status: QuoteStatusView, now = new Date()): Prisma.SalesQuoteWhereInput {
  if (status === "EXPIRED") return { status: { in: ["DRAFT", "SENT"] }, validUntil: { lt: now } };
  if (status === "DRAFT" || status === "SENT") {
    return { status, OR: [{ validUntil: null }, { validUntil: { gte: now } }] };
  }
  return { status };
}

function dayStart(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Dueño y admin ven los presupuestos de todo el equipo; el resto, los suyos. */
export function seesAllQuotes(viewer: Pick<TenantContext, "tenantRole">): boolean {
  return viewer.tenantRole === "OWNER" || viewer.tenantRole === "ADMIN";
}

/** Quien mira no ve costos (vendedor): no ve ni cambia márgenes. */
function sellerOnly(viewer: Viewer): boolean {
  // Sin datos de permisos (llamadas internas) se trata como vendedor: nunca se muestra de más.
  if (!viewer.permissions || !viewer.tenantType) return true;
  return hidesCost(viewer);
}

/** Vencido: pasó la fecha y el cliente no decidió. */
export function effectiveStatus(row: Pick<SalesQuote, "status" | "validUntil">, now = new Date()): QuoteStatusView {
  if ((row.status === "DRAFT" || row.status === "SENT") && row.validUntil && row.validUntil.getTime() < now.getTime()) {
    return "EXPIRED";
  }
  return row.status;
}

function parseMargin(value: unknown): number | null {
  if (value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < SALE_MARGIN_MIN || n > SALE_MARGIN_MAX) {
    throw new BadRequestException(`El margen va de ${SALE_MARGIN_MIN} % a ${SALE_MARGIN_MAX} %.`);
  }
  return Math.round(n * 1000) / 1000;
}

/**
 * Presupuestos de venta (docs/PLAN_MODO_VENDEDOR.md §8). Son del comercio
 * (`tenantId`), como el carrito; los precios salen del catálogo comercial
 * (`commercialId`) con los márgenes de venta, igual que en la búsqueda. Un
 * presupuesto (o una línea) puede llevar su propio margen, que pisa las reglas.
 */
@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProvidersService,
    private readonly saleRules: SaleMarginRulesService,
    private readonly settings: QuoteSettingsService
  ) {}

  /**
   * Listado paginado. Los filtros van en el servidor (con miles de presupuestos no
   * se puede traer todo): búsqueda, persona, fechas y estado, incluso "vencido".
   */
  async list(viewer: Viewer, filter: QuoteListFilter = {}): Promise<QuoteListPage> {
    const now = new Date();
    const base = this.listWhere(viewer, filter);
    const status = VIEW_STATUSES.find((s) => s === filter.status);
    const where: Prisma.SalesQuoteWhereInput = status ? { AND: [base, statusWhere(status, now)] } : base;
    const pageSize = Math.min(Math.max(Math.floor(filter.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
    const page = Math.max(Math.floor(filter.page ?? 1), 1);
    const [rows, total, counts] = await Promise.all([
      this.prisma.salesQuote.findMany({
        where,
        orderBy: [...SORTS[filter.sort ?? "updated"], { number: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.salesQuote.count({ where }),
      this.statusCounts(base, now),
    ]);
    return { items: await this.views(viewer, rows), total, page, pageSize, counts };
  }

  private listWhere(viewer: Viewer, filter: QuoteListFilter): Prisma.SalesQuoteWhereInput {
    const where: Prisma.SalesQuoteWhereInput = {
      tenantId: viewer.tenantId,
      archivedAt: filter.archived ? { not: null } : null,
    };
    if (!seesAllQuotes(viewer)) where.createdById = viewer.userId;
    else if (filter.createdById) where.createdById = filter.createdById;
    const from = dayStart(filter.from);
    const to = dayStart(filter.to);
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        // Hasta el final de ese día.
        ...(to ? { lt: new Date(to.getTime() + DAY_MS) } : {}),
      };
    }
    const q = filter.q?.trim();
    if (q) {
      const asNumber = Number(q.replace(/^\D+/, ""));
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { clientName: { contains: q, mode: "insensitive" } },
        { clientPhone: { contains: q } },
        { clientEmail: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
        ...(Number.isInteger(asNumber) && asNumber > 0 ? [{ number: asNumber }] : []),
      ];
    }
    return where;
  }

  /** Conteo por estado visible: los guardados más los vencidos, que se restan de borrador/enviado. */
  private async statusCounts(base: Prisma.SalesQuoteWhereInput, now: Date): Promise<QuoteListPage["counts"]> {
    const [grouped, expiredBy] = await Promise.all([
      this.prisma.salesQuote.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
      this.prisma.salesQuote.groupBy({ by: ["status"], where: { AND: [base, statusWhere("EXPIRED", now)] }, _count: { _all: true } }),
    ]);
    const counts = { ALL: 0, DRAFT: 0, SENT: 0, ACCEPTED: 0, REJECTED: 0, EXPIRED: 0 } as QuoteListPage["counts"];
    for (const g of grouped) {
      counts[g.status] = g._count._all;
      counts.ALL += g._count._all;
    }
    for (const g of expiredBy) {
      counts[g.status] -= g._count._all;
      counts.EXPIRED += g._count._all;
    }
    return counts;
  }

  async get(viewer: Viewer, id: string): Promise<QuoteView> {
    return this.view(viewer, await this.owned(viewer, id));
  }

  /** Número correlativo por comercio: un candado por comercio evita repetidos. */
  async create(viewer: Viewer, dto: QuoteClientDto): Promise<QuoteView> {
    const settings = await this.settings.get(viewer.tenantId);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sales-quote:${viewer.tenantId}`}))`;
      const last = await tx.salesQuote.aggregate({ where: { tenantId: viewer.tenantId }, _max: { number: true } });
      return tx.salesQuote.create({
        data: {
          tenantId: viewer.tenantId,
          number: (last._max.number ?? 0) + 1,
          createdById: viewer.userId,
          title: dto.title ?? null,
          clientName: dto.clientName ?? null,
          clientPhone: dto.clientPhone ?? null,
          clientEmail: dto.clientEmail ?? null,
          notes: dto.notes ?? null,
          validUntil: new Date(Date.now() + settings.validityDays * DAY_MS),
        },
      });
    });
    return this.view(viewer, row);
  }

  /**
   * Presupuesto nuevo con todas las líneas en una sola escritura (el armador de PC).
   * Los precios se buscan antes; lo que no tiene precio de venta hoy no entra y
   * vuelve en `skipped` para avisarlo. Si nada tiene precio, no se crea.
   */
  async createWithItems(
    viewer: Viewer,
    dto: CreateQuoteWithItemsDto
  ): Promise<{ quote: QuoteView; skipped: { provider: string; externalId: string }[] }> {
    const { items: wanted, custom = [], ...client } = dto;
    if (wanted.length + custom.length === 0) throw new BadRequestException("El presupuesto no tiene líneas");
    if (wanted.length + custom.length > MAX_QUOTE_ITEMS) {
      throw new BadRequestException(`Un presupuesto admite hasta ${MAX_QUOTE_ITEMS} líneas`);
    }
    const rules = await this.saleRules.get(viewer.commercialTenantId);
    const now = new Date();
    let lines: QuoteItem[] = [];
    const skipped: { provider: string; externalId: string }[] = [];
    for (const it of wanted) {
      const provider = it.provider.toUpperCase();
      if (!isProviderKey(provider)) throw new BadRequestException(`Proveedor inválido: ${it.provider}`);
      // Un producto que el distribuidor dio de baja no frena el presupuesto: se avisa.
      const line = await this.priceOf(viewer, rules, provider, it.externalId, null, null).catch((err: unknown) => {
        if (err instanceof NotFoundException) return null;
        throw err;
      });
      if (!line || line.unitFinalPrice == null) {
        skipped.push({ provider, externalId: it.externalId });
        continue;
      }
      lines = addItem(lines, { ...line, provider, externalId: it.externalId }, it.qty ?? 1, now);
    }
    for (const c of custom) {
      lines.push(customItem({ id: randomUUID(), name: c.name, unitFinalPrice: c.unitFinalPrice, currency: c.currency, qty: c.qty ?? 1, ivaPercent: c.ivaPercent ?? 21 }, now));
    }
    if (lines.length === 0) throw new UnprocessableEntityException("Ningún producto tiene precio de venta en este momento");
    const created = await this.create(viewer, client);
    const quote = await this.mutateItems(viewer, created.id, () => lines);
    return { quote, skipped };
  }

  /** Copia un presupuesto (otro cliente, o el mismo con cambios): nuevo número y precios de hoy. */
  async duplicate(viewer: Viewer, id: string): Promise<QuoteView> {
    const source = await this.owned(viewer, id);
    const copy = await this.create(viewer, {
      title: source.title,
      clientName: source.clientName,
      clientPhone: source.clientPhone,
      clientEmail: source.clientEmail,
      notes: source.notes,
    });
    await this.prisma.salesQuote.update({
      where: { id: copy.id },
      data: {
        items: source.items as Prisma.InputJsonValue,
        // El margen propio solo se copia si quien copia puede verlo.
        marginPercent: sellerOnly(viewer) ? null : source.marginPercent,
        discountPercent: source.discountPercent,
        currency: source.currency,
        terms: source.terms,
      },
    });
    return (await this.refreshPrices(viewer, copy.id)).quote;
  }

  async updateClient(viewer: Viewer, id: string, dto: QuoteClientDto): Promise<QuoteView> {
    const quote = await this.owned(viewer, id);
    const data: Prisma.SalesQuoteUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.clientName !== undefined) data.clientName = dto.clientName;
    if (dto.clientPhone !== undefined) data.clientPhone = dto.clientPhone;
    if (dto.clientEmail !== undefined) data.clientEmail = dto.clientEmail;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.terms !== undefined) data.terms = dto.terms;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.validUntil !== undefined) data.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (dto.discountPercent !== undefined) {
      const discount = dto.discountPercent;
      if (discount != null && sellerOnly(viewer)) {
        const max = (await this.settings.get(viewer.tenantId)).maxSellerDiscount;
        if (max != null && discount > max) {
          throw new ForbiddenException(`Podés hacer hasta ${max} % de descuento. Para más, pedíselo a quien administra.`);
        }
      }
      data.discountPercent = discount;
    }
    if (dto.status != null) {
      data.status = dto.status;
      if (dto.status === "SENT" && !quote.sentAt) data.sentAt = new Date();
      data.decidedAt = dto.status === "ACCEPTED" || dto.status === "REJECTED" ? new Date() : null;
    }
    const marginChanged = dto.marginPercent !== undefined;
    if (marginChanged) {
      if (sellerOnly(viewer)) throw new ForbiddenException("El margen lo cambia quien ve costos.");
      data.marginPercent = parseMargin(dto.marginPercent);
    }
    const row = await this.prisma.salesQuote.update({ where: { id }, data });
    // Un margen nuevo cambia los precios: se recalculan todas las líneas con los costos de hoy.
    if (marginChanged) return (await this.refreshPrices(viewer, id)).quote;
    return this.view(viewer, row);
  }

  /** "Lo mandé": queda como enviado (si todavía era borrador). Lo llama la web al compartir. */
  async markSent(viewer: Viewer, id: string): Promise<QuoteView> {
    const quote = await this.owned(viewer, id);
    if (quote.status !== "DRAFT") return this.view(viewer, quote);
    const row = await this.prisma.salesQuote.update({ where: { id }, data: { status: "SENT", sentAt: quote.sentAt ?? new Date() } });
    return this.view(viewer, row);
  }

  async remove(viewer: Viewer, id: string): Promise<{ id: string }> {
    await this.owned(viewer, id);
    await this.prisma.salesQuote.delete({ where: { id } });
    return { id };
  }

  async setArchived(viewer: Viewer, id: string, archived: boolean): Promise<QuoteView> {
    await this.owned(viewer, id);
    const row = await this.prisma.salesQuote.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    return this.view(viewer, row);
  }

  async addItem(viewer: Viewer, id: string, input: { provider: string; externalId: string; qty?: number }): Promise<QuoteView> {
    const quote = await this.owned(viewer, id);
    const provider = input.provider.toUpperCase();
    if (!isProviderKey(provider)) throw new BadRequestException(`Proveedor inválido: ${input.provider}`);
    const full = (items: QuoteItem[]) =>
      !items.some((it) => it.kind === "product" && it.provider === provider && it.externalId === input.externalId) &&
      items.length >= MAX_QUOTE_ITEMS;
    if (full(readItems(quote.items))) {
      throw new BadRequestException(`Un presupuesto admite hasta ${MAX_QUOTE_ITEMS} productos`);
    }
    const rules = await this.saleRules.get(viewer.commercialTenantId);
    const line = await this.priceOf(viewer, rules, provider, input.externalId, null, num(quote.marginPercent));
    if (!line || line.unitFinalPrice == null) {
      throw new UnprocessableEntityException("Este producto no tiene precio de venta en este momento");
    }
    return this.mutateItems(viewer, quote.id, (items) => {
      if (full(items)) throw new BadRequestException(`Un presupuesto admite hasta ${MAX_QUOTE_ITEMS} productos`);
      return addItem(items, { ...line, provider, externalId: input.externalId }, input.qty ?? 1, new Date());
    });
  }

  /** Línea libre (armado, envío, algo que no está en NODO) con precio final a mano. */
  async addCustom(viewer: Viewer, id: string, dto: AddCustomItemDto): Promise<QuoteView> {
    const quote = await this.owned(viewer, id);
    const line = customItem(
      {
        id: randomUUID(),
        name: dto.name,
        unitFinalPrice: dto.unitFinalPrice,
        currency: dto.currency,
        qty: dto.qty ?? 1,
        ivaPercent: dto.ivaPercent ?? 21,
      },
      new Date()
    );
    return this.mutateItems(viewer, quote.id, (items) => {
      if (items.length >= MAX_QUOTE_ITEMS) throw new BadRequestException(`Un presupuesto admite hasta ${MAX_QUOTE_ITEMS} líneas`);
      return [...items, line];
    });
  }

  /** Cantidad, margen propio de la línea o (líneas libres) nombre y precio. */
  async updateItem(viewer: Viewer, id: string, index: number, dto: UpdateQuoteItemDto): Promise<QuoteView> {
    const quote = await this.owned(viewer, id);
    const seen = readItems(quote.items)[index];
    if (!seen) throw new NotFoundException("Ese producto ya no está en el presupuesto");
    // El precio con el margen nuevo se busca antes del candado (puede ir a la red).
    let repriced: { line: PricedLine; override: number | null } | null = null;
    if (seen.kind === "custom") {
      if (dto.marginPercent !== undefined) throw new BadRequestException("Una línea libre lleva precio, no margen");
    } else {
      if (dto.name != null || dto.unitFinalPrice != null) {
        throw new BadRequestException("El nombre y el precio de un producto salen del catálogo; usá el margen");
      }
      if (dto.marginPercent !== undefined) {
        if (sellerOnly(viewer)) throw new ForbiddenException("El margen lo cambia quien ve costos.");
        const override = parseMargin(dto.marginPercent);
        const rules = await this.saleRules.get(viewer.commercialTenantId);
        const line = await this.priceOf(viewer, rules, seen.provider, seen.externalId, override, num(quote.marginPercent));
        if (!line || line.unitFinalPrice == null) {
          throw new UnprocessableEntityException("Este producto ya no tiene precio: actualizá los precios o sacalo");
        }
        repriced = { line, override };
      }
    }
    return this.mutateItems(viewer, quote.id, (items) => {
      const current = items[index];
      if (!current || current.provider !== seen.provider || current.externalId !== seen.externalId) {
        throw new ConflictException("El presupuesto cambió mientras lo editabas. Probá de nuevo.");
      }
      return items.map((it, i) => (i === index ? this.editedLine(current, dto, repriced) : it));
    });
  }

  /** La línea con los cambios pedidos (sobre lo último guardado). */
  private editedLine(
    current: QuoteItem,
    dto: UpdateQuoteItemDto,
    repriced: { line: PricedLine; override: number | null } | null
  ): QuoteItem {
    let next: QuoteItem = { ...current };
    if (dto.qty != null) next.qty = dto.qty;
    if (current.kind === "custom") {
      if (dto.name != null) next.name = dto.name;
      if (dto.unitFinalPrice != null || dto.currency != null || dto.ivaPercent != null) {
        const iva = dto.ivaPercent ?? (current.unitPrice && current.unitFinalPrice ? Math.round((current.unitFinalPrice / current.unitPrice - 1) * 1000) / 10 : 21);
        next = {
          ...customItem(
            {
              id: current.externalId,
              name: next.name,
              unitFinalPrice: dto.unitFinalPrice ?? current.unitFinalPrice ?? 0,
              currency: dto.currency ?? current.currency,
              qty: next.qty,
              ivaPercent: iva,
            },
            new Date()
          ),
        };
      }
    } else if (repriced) {
      next = { ...next, ...repriced.line, marginPercent: repriced.override, pricedAt: new Date().toISOString() };
    }
    return next;
  }

  async removeItem(viewer: Viewer, id: string, index: number): Promise<QuoteView> {
    const quote = await this.owned(viewer, id);
    return this.mutateItems(viewer, quote.id, (items) => {
      if (!items[index]) throw new NotFoundException("Ese producto ya no está en el presupuesto");
      return items.filter((_, i) => i !== index);
    });
  }

  /** Mueve una línea (orden en el PDF). */
  async moveItem(viewer: Viewer, id: string, index: number, to: number): Promise<QuoteView> {
    const quote = await this.owned(viewer, id);
    return this.mutateItems(viewer, quote.id, (items) => {
      if (!items[index] || to < 0 || to >= items.length) throw new BadRequestException("Posición inválida");
      const next = [...items];
      const [moved] = next.splice(index, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  /** Precios de hoy para cada línea (con sus márgenes) y la validez renovada; devuelve qué cambió. */
  async refreshPrices(viewer: Viewer, id: string): Promise<{ quote: QuoteView; changes: PriceChange[] }> {
    const quote = await this.owned(viewer, id);
    const items = readItems(quote.items);
    const rules = await this.saleRules.get(viewer.commercialTenantId);
    const quoteMargin = num(quote.marginPercent);
    const current = await Promise.all(
      items.map((it) =>
        it.kind === "custom"
          ? null
          : this.priceOf(viewer, rules, it.provider, it.externalId, it.marginPercent, quoteMargin).catch(() => null)
      )
    );
    // Los precios se buscaron sin candado: se aplican a las líneas como estén ahora
    // (si mientras tanto se sumó una, queda como estaba).
    const priced = new Map(items.map((it, i) => [lineKey(it), current[i]]));
    const settings = await this.settings.get(viewer.tenantId);
    let changes: PriceChange[] = [];
    const view = await this.mutateItems(
      viewer,
      quote.id,
      (latest) => {
        const result = repriceItems(latest, latest.map((it) => priced.get(lineKey(it))), new Date());
        changes = result.changes;
        return result.items;
      },
      { validUntil: new Date(Date.now() + settings.validityDays * DAY_MS) }
    );
    return { quote: view, changes };
  }

  /**
   * Precio de VENTA del producto, el mismo que ve el vendedor en la búsqueda:
   * la oferta del catálogo comercial (con su visibilidad) + márgenes de venta.
   * Un margen de la línea o del presupuesto pisa al de las reglas.
   */
  private async priceOf(
    viewer: Viewer,
    rules: TenantSaleRules,
    provider: string,
    externalId: string,
    lineMargin: number | null,
    quoteMargin: number | null
  ): Promise<PricedLine | null> {
    const product = (await this.providers.getProduct(viewer.commercialTenantId, provider as never, externalId, viewer.userId, { richContent: false })) as
      | (Record<string, unknown> & { provider: string; externalId: string })
      | null;
    if (!product) throw new NotFoundException("Producto no encontrado");
    const override = lineMargin ?? quoteMargin;
    const sale = saleOf(product, rules, override);
    const source: QuoteMarginSource = lineMargin != null ? "line" : quoteMargin != null ? "quote" : sale?.source ?? "none";
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
    return {
      name: str(product.name) ?? externalId,
      imageUrl: str(product.imageUrl),
      brand: str(product.brand),
      sku: str(product.sku) ?? str(product.partNumber),
      unitPrice: sale?.price ?? null,
      unitFinalPrice: sale?.finalPrice ?? null,
      currency: str(product.currency) ?? "USD",
      marginSource: source,
    };
  }

  /**
   * Cambia las líneas leyendo y guardando bajo un candado por presupuesto: dos
   * «Agregar» casi a la vez (doble clic, varios productos seguidos, dos pestañas)
   * no se pisan. `apply` no va a la red; los precios se buscan antes.
   */
  private async mutateItems(
    viewer: Viewer,
    id: string,
    apply: (items: QuoteItem[]) => QuoteItem[],
    extra: Prisma.SalesQuoteUpdateInput = {}
  ): Promise<QuoteView> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sales-quote-items:${id}`}))`;
      const latest = await tx.salesQuote.findUnique({ where: { id } });
      if (!latest) throw new NotFoundException("Presupuesto no encontrado");
      const items = apply(readItems(latest.items));
      return tx.salesQuote.update({ where: { id }, data: { ...extra, items: items as unknown as Prisma.InputJsonValue } });
    });
    return this.view(viewer, row);
  }

  /** El presupuesto existe en este comercio y quien pide lo puede ver. */
  private async owned(viewer: Viewer, id: string): Promise<SalesQuote> {
    const row = await this.prisma.salesQuote.findUnique({ where: { id } });
    if (!row || row.tenantId !== viewer.tenantId) throw new NotFoundException("Presupuesto no encontrado");
    if (!seesAllQuotes(viewer) && row.createdById !== viewer.userId) {
      // Responde igual que si no existiera: no se revela que hay presupuestos de otros.
      throw new NotFoundException("Presupuesto no encontrado");
    }
    return row;
  }

  private async view(viewer: Viewer, row: SalesQuote): Promise<QuoteView> {
    return (await this.views(viewer, [row]))[0];
  }

  private async views(viewer: Viewer, rows: SalesQuote[]): Promise<QuoteView[]> {
    const ids = [...new Set(rows.map((r) => r.createdById))];
    const users = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } })
      : [];
    const names = new Map(users.map((u) => [u.id, u.username]));
    const hide = sellerOnly(viewer);
    const now = new Date();
    return rows.map((row) => {
      const items = readItems(row.items);
      const discountPercent = num(row.discountPercent);
      const { subtotals, discounts, totals } = summarize(items, discountPercent);
      return {
        id: row.id,
        number: row.number,
        initials: initialsOf(row.clientName),
        title: row.title ?? null,
        clientName: row.clientName,
        clientPhone: row.clientPhone,
        clientEmail: row.clientEmail ?? null,
        notes: row.notes,
        terms: row.terms ?? null,
        items: items.map((it) => ({
          ...it,
          marginPercent: hide ? null : it.marginPercent,
          marginSource: hide ? (it.marginSource === "none" || it.marginSource === "manual" ? it.marginSource : null) : it.marginSource,
        })),
        totals,
        subtotals,
        discounts,
        itemCount: items.reduce((s, it) => s + it.qty, 0),
        status: effectiveStatus(row, now),
        validUntil: row.validUntil?.toISOString() ?? null,
        marginPercent: hide ? null : num(row.marginPercent),
        discountPercent,
        currency: row.currency ?? null,
        atCostLines: atCostLines(items),
        canEditMargins: !hide,
        createdById: row.createdById,
        createdByName: names.get(row.createdById) ?? null,
        mine: row.createdById === viewer.userId,
        sentAt: row.sentAt?.toISOString() ?? null,
        decidedAt: row.decidedAt?.toISOString() ?? null,
        archivedAt: row.archivedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }
}
