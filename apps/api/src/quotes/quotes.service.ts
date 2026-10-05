import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma, type SalesQuote } from "@prisma/client";
import { isProviderKey } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ProvidersService } from "../providers/providers.service";
import { SaleMarginRulesService } from "../pricing/sale-margin-rules.service";
import { saleOf } from "../pricing/sale-pricing";
import type { TenantContext } from "../tenants/tenant-context.service";
import type { QuoteClientDto } from "./dto/quotes.dto";
import {
  addItem,
  initialsOf,
  MAX_QTY,
  MAX_QUOTE_ITEMS,
  readItems,
  repriceItems,
  totalsByCurrency,
  type PriceChange,
  type PricedLine,
  type QuoteItem,
} from "./quote-items";

/** Lo que la API devuelve de un presupuesto. Nunca lleva costo. */
export interface QuoteView {
  id: string;
  number: number;
  /** Iniciales del cliente o `null` (la ficha muestra el número). */
  initials: string | null;
  clientName: string | null;
  clientPhone: string | null;
  notes: string | null;
  items: QuoteItem[];
  totals: Record<string, number>;
  itemCount: number;
  createdById: string;
  createdByName: string | null;
  mine: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteListFilter {
  archived?: boolean;
  q?: string;
  /** Solo dueño/admin: ver los de una persona. */
  createdById?: string;
}

type Viewer = Pick<TenantContext, "tenantId" | "commercialTenantId" | "userId" | "tenantRole">;

const LIST_LIMIT = 200;

/** Dueño y admin ven los presupuestos de todo el equipo; el resto, los suyos. */
export function seesAllQuotes(viewer: Pick<TenantContext, "tenantRole">): boolean {
  return viewer.tenantRole === "OWNER" || viewer.tenantRole === "ADMIN";
}

/**
 * Presupuestos de venta (docs/PLAN_MODO_VENDEDOR.md §8). Son del comercio
 * (`tenantId`), como el carrito; los precios salen del catálogo comercial
 * (`commercialId`) con los márgenes de venta, igual que en la búsqueda.
 */
@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProvidersService,
    private readonly saleRules: SaleMarginRulesService
  ) {}

  async list(viewer: Viewer, filter: QuoteListFilter = {}): Promise<QuoteView[]> {
    const where: Prisma.SalesQuoteWhereInput = {
      tenantId: viewer.tenantId,
      archivedAt: filter.archived ? { not: null } : null,
    };
    if (!seesAllQuotes(viewer)) where.createdById = viewer.userId;
    else if (filter.createdById) where.createdById = filter.createdById;
    const q = filter.q?.trim();
    if (q) {
      const asNumber = Number(q.replace(/^#/, ""));
      where.OR = [
        { clientName: { contains: q, mode: "insensitive" } },
        { clientPhone: { contains: q } },
        { notes: { contains: q, mode: "insensitive" } },
        ...(Number.isInteger(asNumber) && asNumber > 0 ? [{ number: asNumber }] : []),
      ];
    }
    const rows = await this.prisma.salesQuote.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: LIST_LIMIT,
    });
    return this.views(viewer, rows);
  }

  async get(viewer: Viewer, id: string): Promise<QuoteView> {
    return this.view(viewer, await this.owned(viewer, id));
  }

  /** Número correlativo por comercio: un candado por comercio evita repetidos. */
  async create(viewer: Viewer, dto: QuoteClientDto): Promise<QuoteView> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sales-quote:${viewer.tenantId}`}))`;
      const last = await tx.salesQuote.aggregate({ where: { tenantId: viewer.tenantId }, _max: { number: true } });
      return tx.salesQuote.create({
        data: {
          tenantId: viewer.tenantId,
          number: (last._max.number ?? 0) + 1,
          createdById: viewer.userId,
          clientName: dto.clientName ?? null,
          clientPhone: dto.clientPhone ?? null,
          notes: dto.notes ?? null,
        },
      });
    });
    return this.view(viewer, row);
  }

  async updateClient(viewer: Viewer, id: string, dto: QuoteClientDto): Promise<QuoteView> {
    await this.owned(viewer, id);
    const data: Prisma.SalesQuoteUpdateInput = {};
    if (dto.clientName !== undefined) data.clientName = dto.clientName;
    if (dto.clientPhone !== undefined) data.clientPhone = dto.clientPhone;
    if (dto.notes !== undefined) data.notes = dto.notes;
    const row = await this.prisma.salesQuote.update({ where: { id }, data });
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
    const items = readItems(quote.items);
    const exists = items.some((it) => it.provider === provider && it.externalId === input.externalId);
    if (!exists && items.length >= MAX_QUOTE_ITEMS) {
      throw new BadRequestException(`Un presupuesto admite hasta ${MAX_QUOTE_ITEMS} productos`);
    }
    const line = await this.priceOf(viewer, provider, input.externalId);
    if (!line || line.unitFinalPrice == null) {
      throw new UnprocessableEntityException("Este producto no tiene precio de venta en este momento");
    }
    const next = addItem(items, { ...line, provider, externalId: input.externalId }, input.qty ?? 1, new Date());
    return this.saveItems(viewer, quote.id, next);
  }

  async setItemQty(viewer: Viewer, id: string, index: number, qty: number): Promise<QuoteView> {
    const quote = await this.owned(viewer, id);
    const items = readItems(quote.items);
    if (!items[index]) throw new NotFoundException("Ese producto ya no está en el presupuesto");
    const next = items.map((it, i) => (i === index ? { ...it, qty: Math.min(MAX_QTY, Math.max(1, Math.floor(qty))) } : it));
    return this.saveItems(viewer, quote.id, next);
  }

  async removeItem(viewer: Viewer, id: string, index: number): Promise<QuoteView> {
    const quote = await this.owned(viewer, id);
    const items = readItems(quote.items);
    if (!items[index]) throw new NotFoundException("Ese producto ya no está en el presupuesto");
    return this.saveItems(viewer, quote.id, items.filter((_, i) => i !== index));
  }

  /** Precios de hoy para cada línea; devuelve qué cambió. */
  async refreshPrices(viewer: Viewer, id: string): Promise<{ quote: QuoteView; changes: PriceChange[] }> {
    const quote = await this.owned(viewer, id);
    const items = readItems(quote.items);
    const current = await Promise.all(items.map((it) => this.priceOf(viewer, it.provider, it.externalId)));
    const { items: next, changes } = repriceItems(items, current, new Date());
    return { quote: await this.saveItems(viewer, quote.id, next), changes };
  }

  /**
   * Precio de VENTA del producto, el mismo que ve el vendedor en la búsqueda:
   * la oferta del catálogo comercial (con su visibilidad) + márgenes de venta.
   */
  private async priceOf(viewer: Viewer, provider: string, externalId: string): Promise<PricedLine | null> {
    const catalogId = viewer.commercialTenantId;
    const product = (await this.providers.getProduct(catalogId, provider as never, externalId, viewer.userId)) as
      | (Record<string, unknown> & { provider: string; externalId: string })
      | null;
    if (!product) throw new NotFoundException("Producto no encontrado");
    const rules = await this.saleRules.get(catalogId);
    const sale = saleOf(product, rules);
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
    return {
      name: str(product.name) ?? externalId,
      imageUrl: str(product.imageUrl),
      brand: str(product.brand),
      sku: str(product.sku) ?? str(product.partNumber),
      unitPrice: sale?.price ?? null,
      unitFinalPrice: sale?.finalPrice ?? null,
      currency: str(product.currency) ?? "USD",
    };
  }

  private async saveItems(viewer: Viewer, id: string, items: QuoteItem[]): Promise<QuoteView> {
    const row = await this.prisma.salesQuote.update({
      where: { id },
      data: { items: items as unknown as Prisma.InputJsonValue },
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
    return rows.map((row) => {
      const items = readItems(row.items);
      return {
        id: row.id,
        number: row.number,
        initials: initialsOf(row.clientName),
        clientName: row.clientName,
        clientPhone: row.clientPhone,
        notes: row.notes,
        items,
        totals: totalsByCurrency(items),
        itemCount: items.reduce((s, it) => s + it.qty, 0),
        createdById: row.createdById,
        createdByName: names.get(row.createdById) ?? null,
        mine: row.createdById === viewer.userId,
        archivedAt: row.archivedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }
}

