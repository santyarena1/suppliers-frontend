import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { providerHasIvaRate, PROVIDER_LABELS, type Provider } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialsService } from "../credentials/credentials.service";
import { AirOrderService, type AirDraftInput } from "../providers/air-order.service";
import { ElitOrderService, type ElitCartItems } from "../providers/elit-order.service";
import { GrupoNucleoOrderService, type GnDraftInput } from "../providers/grupo-nucleo-order.service";
import { InvidOrderService, type InvidDraftInput } from "../providers/invid-order.service";
import { NewBytesOrderService, type NewBytesDraftInput } from "../providers/new-bytes-order.service";
import type { OrderAuthor } from "../providers/provider-draft";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantVisibilityService } from "../tenants/tenant-visibility.service";
import type { CreateOfflineOrdersDto, UpdateOfflineOrderDto } from "./dto/offline-order.dto";
import type { RenameOpsAliasDto, SplitOpsAliasDto, UnifyOpsAliasDto } from "./dto/ops-alias.dto";
import {
  isOfflineChannel,
  isOrderItemEditable,
  normalizeOfflineItems,
  OFFLINE_ORDER_STATUS,
  ORDER_CHANNEL_OFFLINE,
  snapshotOfflineOrder,
} from "./offline-order";
import { OrderApprovalService } from "./order-approval.service";
import {
  catalogKey,
  computePurchaseInsights,
  COUNTED_ORDER_STATUSES,
  extractOrderLines,
  MAX_INSIGHT_ORDERS,
  type CatalogEntry,
  type CatalogStats,
} from "./purchase-analytics";
import { indexOpsAliases, isAliasable, parseOpsGroupKey, type OpsAliasKind } from "./purchase-ops-aliases";

/**
 * Aprobar un pedido online es mandarlo al proveedor con los mismos datos con los
 * que lo armó el vendedor. Un pedido offline no se envía: queda en Nodo, aprobado
 * y se puede editar si el vendedor cambia algo.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly approval: OrderApprovalService,
    private readonly credentials: CredentialsService,
    private readonly prisma: PrismaService,
    private readonly visibility: TenantVisibilityService,
    private readonly invid: InvidOrderService,
    private readonly newBytes: NewBytesOrderService,
    private readonly grupoNucleo: GrupoNucleoOrderService,
    private readonly air: AirOrderService,
    private readonly elit: ElitOrderService
  ) {}

  list(tenant: TenantContext) {
    return this.approval.list(tenant);
  }

  pending(tenant: TenantContext) {
    return this.approval.list(tenant, { pendientes: true });
  }

  reject(tenant: TenantContext, userId: string, id: string, reason?: string) {
    return this.approval.reject(tenant, userId, id, reason);
  }

  async approve(tenant: TenantContext, userId: string, id: string) {
    const order = await this.approval.assertApprovable(tenant, id);
    if (isOfflineChannel(order.channel)) {
      throw new BadRequestException("Este pedido se gestiona en Nodo y no se envía al portal del proveedor.");
    }
    const provider = order.provider as Provider;
    const credentials = await this.credentialsOf(tenant, provider);
    const author: OrderAuthor = { userId: order.userId, tenantId: tenant.tenantId };
    const input = order.draftInput as Record<string, unknown>;

    const resultado = await this.send(provider, author, credentials, input, order.id);
    await this.approval.markApproved(order.id, userId);
    return resultado;
  }

  async createOffline(tenant: TenantContext, userId: string, dto: CreateOfflineOrdersDto) {
    this.approval.assertCanOrder(tenant);
    if (tenant.tenantType !== "RETAILER") {
      throw new ForbiddenException("Solo un comercio puede registrar un pedido offline");
    }

    const created = [];
    for (const group of dto.orders) {
      const provider = group.provider as Provider;
      await this.assertOfflineAllowed(tenant.tenantId, provider);
      const items = normalizeOfflineItems(group.items);
      if (items.length === 0) {
        throw new BadRequestException(`No hay productos de ${PROVIDER_LABELS[provider]} en el pedido`);
      }
      const snap = snapshotOfflineOrder(items, group.notes, group.quoteRate);
      const row = await this.prisma.providerOrder.create({
        data: {
          userId,
          tenantId: tenant.tenantId,
          createdByUserId: userId,
          approvedByUserId: userId,
          approvalDecidedAt: new Date(),
          provider,
          channel: ORDER_CHANNEL_OFFLINE,
          status: OFFLINE_ORDER_STATUS,
          approvalStatus: "APPROVED",
          paymentOption: "OFFLINE",
          paymentLabel: null,
          notes: snap.notes,
          subtotal: new Prisma.Decimal(snap.netUsd),
          impuestos: new Prisma.Decimal(snap.internosUsd),
          percepciones: new Prisma.Decimal(0),
          total: new Prisma.Decimal(snap.totalUsd),
          items: snap.items as unknown as Prisma.InputJsonValue,
          addressSnapshot: {},
          draftInput: snap as unknown as Prisma.InputJsonValue,
        },
        include: {
          createdBy: { select: { id: true, username: true } },
          approvedBy: { select: { id: true, username: true } },
        },
      });
      created.push(this.approval.serialize(row));
    }
    return created;
  }

  async updateOffline(tenant: TenantContext, id: string, dto: UpdateOfflineOrderDto) {
    this.approval.assertCanOrder(tenant);
    const order = await this.approval.getOwn(tenant, id);
    if (!isOrderItemEditable(order)) {
      throw new BadRequestException(
        "Solo se pueden editar pedidos offline o pedidos ya creados/aprobados"
      );
    }
    if (order.approvalStatus === "REJECTED") {
      throw new BadRequestException("Ese pedido está rechazado");
    }

    const currentItems = normalizeOfflineItems(order.items);
    const items = dto.items ? normalizeOfflineItems(dto.items) : currentItems;
    if (items.length === 0) {
      throw new BadRequestException("El pedido tiene que tener al menos un producto");
    }
    const prev = snapshotOfflineOrder(
      currentItems,
      order.notes,
      (order.draftInput as { quoteRate?: number } | null)?.quoteRate
    );
    const snap = snapshotOfflineOrder(
      items,
      dto.notes !== undefined ? dto.notes : prev.notes,
      prev.quoteRate
    );

    const row = await this.prisma.providerOrder.update({
      where: { id: order.id },
      data: {
        notes: snap.notes,
        subtotal: new Prisma.Decimal(snap.netUsd),
        impuestos: new Prisma.Decimal(snap.internosUsd),
        total: new Prisma.Decimal(snap.totalUsd),
        items: snap.items as unknown as Prisma.InputJsonValue,
        draftInput: {
          ...((order.draftInput as object) ?? {}),
          ...snap,
          adjustedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
      include: {
        createdBy: { select: { id: true, username: true } },
        approvedBy: { select: { id: true, username: true } },
      },
    });
    return this.approval.serialize(row);
  }

  /**
   * Tablero de compras del comercio de la sesión. El filtro `tenantId` es
   * obligatorio: no hay vista que mezcle locales.
   */
  async insights(tenant: TenantContext, daysRaw?: string) {
    const periodDays = this.parseInsightDays(daysRaw);
    const now = new Date();
    const periodStart = periodDays > 0 ? new Date(now.getTime() - periodDays * 86_400_000) : null;
    const compareStart =
      periodStart && periodDays > 0 ? new Date(periodStart.getTime() - periodDays * 86_400_000) : null;

    const counted = {
      tenantId: tenant.tenantId,
      status: { in: [...COUNTED_ORDER_STATUSES] },
    };

    const [currentRows, previousRows, catalogStats, aliasRows] = await Promise.all([
      this.prisma.providerOrder.findMany({
        where: { ...counted, ...(periodStart ? { createdAt: { gte: periodStart } } : {}) },
        orderBy: { createdAt: "desc" },
        take: MAX_INSIGHT_ORDERS + 1,
        select: {
          id: true,
          provider: true,
          status: true,
          channel: true,
          items: true,
          createdAt: true,
          total: true,
          subtotal: true,
          impuestos: true,
          percepciones: true,
          paymentOption: true,
          paymentLabel: true,
          deliveryOption: true,
          deliveryLabel: true,
          notes: true,
          addressSnapshot: true,
          draftInput: true,
          createdBy: { select: { username: true } },
        },
      }),
      compareStart && periodStart
        ? this.prisma.providerOrder.findMany({
            where: {
              ...counted,
              createdAt: { gte: compareStart, lt: periodStart },
            },
            orderBy: { createdAt: "desc" },
            take: MAX_INSIGHT_ORDERS,
            select: {
              id: true,
              provider: true,
              status: true,
              channel: true,
              items: true,
              createdAt: true,
              total: true,
              subtotal: true,
              impuestos: true,
              percepciones: true,
              paymentOption: true,
              paymentLabel: true,
              deliveryOption: true,
              deliveryLabel: true,
              notes: true,
              addressSnapshot: true,
              draftInput: true,
              createdBy: { select: { username: true } },
            },
          })
        : Promise.resolve([]),
      this.catalogStatsFor(tenant.tenantId),
      this.prisma.tenantOpsAlias.findMany({
        where: { tenantId: tenant.tenantId },
        select: { kind: true, rawKey: true, groupId: true, label: true },
      }),
    ]);

    const truncated = currentRows.length > MAX_INSIGHT_ORDERS;
    const current = (truncated ? currentRows.slice(0, MAX_INSIGHT_ORDERS) : currentRows).map((row) =>
      this.toAnalyticsOrder(row)
    );
    const catalog = await this.catalogLookupFor(tenant.tenantId, [
      ...current,
      ...previousRows.map((row) => this.toAnalyticsOrder(row)),
    ]);
    let previousSpendUsd: number | null = null;
    let previousSpendBy: {
      providers: Record<string, number>;
      brands: Record<string, number>;
      categories: Record<string, number>;
    } | undefined;
    if (periodDays > 0 && previousRows.length > 0) {
      const previous = computePurchaseInsights(
        previousRows.map((row) => this.toAnalyticsOrder(row)),
        catalog,
        { tenantName: tenant.tenantName, periodDays }
      );
      previousSpendUsd = previous.kpis.spendUsd;
      previousSpendBy = {
        providers: Object.fromEntries(previous.byProvider.map((r) => [r.key, r.spendUsd])),
        brands: Object.fromEntries(previous.byBrand.map((r) => [r.key, r.spendUsd])),
        categories: Object.fromEntries(previous.byCategory.map((r) => [r.key, r.spendUsd])),
      };
    }

    return computePurchaseInsights(current, catalog, {
      tenantName: tenant.tenantName,
      periodDays,
      truncated,
      previousSpendUsd,
      previousSpendBy,
      catalogStats,
      opsAliases: indexOpsAliases(aliasRows),
    });
  }

  async unifyOpsAlias(tenant: TenantContext, dto: UnifyOpsAliasDto) {
    const label = dto.label.trim();
    if (!label) throw new BadRequestException("Poné un nombre para el grupo");
    const kind = dto.kind as OpsAliasKind;
    const rawKeys = await this.expandAliasKeys(tenant.tenantId, kind, dto.keys);
    if (rawKeys.length < 2) {
      throw new BadRequestException("Elegí al menos dos etiquetas para unificarlas");
    }
    for (const key of rawKeys) {
      if (!isAliasable(key)) throw new BadRequestException(`"${key}" no se puede unificar`);
    }
    const existing = await this.prisma.tenantOpsAlias.findMany({
      where: { tenantId: tenant.tenantId, kind, rawKey: { in: rawKeys } },
    });
    const groupId = existing[0]?.groupId ?? randomUUID();
    await this.prisma.$transaction(
      rawKeys.map((rawKey) =>
        this.prisma.tenantOpsAlias.upsert({
          where: { tenantId_kind_rawKey: { tenantId: tenant.tenantId, kind, rawKey } },
          create: { tenantId: tenant.tenantId, kind, rawKey, groupId, label },
          update: { groupId, label },
        })
      )
    );
    await this.prisma.tenantOpsAlias.updateMany({
      where: { tenantId: tenant.tenantId, kind, groupId },
      data: { label },
    });
    return { groupId, kind, label, keys: rawKeys };
  }

  async renameOpsAlias(tenant: TenantContext, groupId: string, dto: RenameOpsAliasDto) {
    const label = dto.label.trim();
    if (!label) throw new BadRequestException("Poné un nombre para el grupo");
    const found = await this.prisma.tenantOpsAlias.updateMany({
      where: { tenantId: tenant.tenantId, groupId },
      data: { label },
    });
    if (found.count === 0) throw new NotFoundException("Ese grupo no existe en este comercio");
    return { groupId, label };
  }

  async deleteOpsAlias(tenant: TenantContext, groupId: string) {
    const found = await this.prisma.tenantOpsAlias.deleteMany({
      where: { tenantId: tenant.tenantId, groupId },
    });
    if (found.count === 0) throw new NotFoundException("Ese grupo no existe en este comercio");
    return { groupId, deleted: found.count };
  }

  async splitOpsAlias(tenant: TenantContext, groupId: string, dto: SplitOpsAliasDto) {
    const toDrop = dto.keys.map((k) => k.trim()).filter(Boolean);
    if (toDrop.length === 0) throw new BadRequestException("No hay etiquetas para sacar");
    const members = await this.prisma.tenantOpsAlias.findMany({
      where: { tenantId: tenant.tenantId, groupId },
    });
    if (members.length === 0) throw new NotFoundException("Ese grupo no existe en este comercio");
    const dropSet = new Set(toDrop);
    await this.prisma.tenantOpsAlias.deleteMany({
      where: { tenantId: tenant.tenantId, groupId, rawKey: { in: [...dropSet] } },
    });
    const remaining = members.filter((m) => !dropSet.has(m.rawKey)).length;
    if (remaining < 2) {
      await this.prisma.tenantOpsAlias.deleteMany({ where: { tenantId: tenant.tenantId, groupId } });
    }
    return { groupId };
  }

  private async expandAliasKeys(tenantId: string, kind: OpsAliasKind, keys: string[]) {
    const raw = new Set<string>();
    const groupIds: string[] = [];
    for (const key of keys) {
      const trimmed = key.trim();
      if (!trimmed) continue;
      const groupId = parseOpsGroupKey(trimmed);
      if (groupId) groupIds.push(groupId);
      else raw.add(trimmed);
    }
    if (groupIds.length) {
      const members = await this.prisma.tenantOpsAlias.findMany({
        where: { tenantId, kind, groupId: { in: groupIds } },
      });
      for (const member of members) raw.add(member.rawKey);
    }
    return [...raw];
  }

  private parseInsightDays(raw?: string) {
    if (raw == null || raw === "") return 90;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException("El período tiene que ser 0 (todo) o un número de días");
    }
    return Math.min(3650, Math.round(n));
  }

  private toAnalyticsOrder(row: {
    id: string;
    provider: string;
    status: string;
    channel: string;
    items: Prisma.JsonValue;
    createdAt: Date;
    total: Prisma.Decimal | null;
    subtotal: Prisma.Decimal | null;
    impuestos: Prisma.Decimal | null;
    percepciones: Prisma.Decimal | null;
    paymentOption: string;
    paymentLabel: string | null;
    deliveryOption: string | null;
    deliveryLabel: string | null;
    notes: string | null;
    addressSnapshot: Prisma.JsonValue;
    draftInput: Prisma.JsonValue | null;
    createdBy?: { username: string } | null;
  }) {
    return {
      id: row.id,
      provider: row.provider,
      status: row.status,
      channel: row.channel,
      items: row.items,
      createdAt: row.createdAt,
      total: row.total == null ? null : Number(row.total),
      subtotal: row.subtotal == null ? null : Number(row.subtotal),
      impuestos: row.impuestos == null ? null : Number(row.impuestos),
      percepciones: row.percepciones == null ? null : Number(row.percepciones),
      paymentOption: row.paymentOption,
      paymentLabel: row.paymentLabel,
      deliveryOption: row.deliveryOption,
      deliveryLabel: row.deliveryLabel,
      notes: row.notes,
      addressSnapshot: row.addressSnapshot,
      draftInput: row.draftInput,
      createdBy: row.createdBy?.username ?? null,
    };
  }

  private async catalogLookupFor(
    tenantId: string,
    orders: {
      provider: string;
      status: string;
      channel?: string | null;
      items: unknown;
      id: string;
      createdAt: Date | string;
    }[]
  ): Promise<Record<string, CatalogEntry>> {
    const byProvider = new Map<string, Set<string>>();
    for (const order of orders) {
      for (const line of extractOrderLines(order)) {
        const set = byProvider.get(line.provider) ?? new Set<string>();
        set.add(line.sku);
        byProvider.set(line.provider, set);
      }
    }

    const out: Record<string, CatalogEntry> = {};
    for (const [provider, skus] of byProvider) {
      const ids = [...skus].slice(0, 1000);
      if (ids.length === 0) continue;
      const offers = await this.prisma.tenantProductOffer.findMany({
        where: { tenantId, provider, externalId: { in: ids } },
        select: {
          provider: true,
          externalId: true,
          price: true,
          finalPrice: true,
          stock: true,
          product: {
            select: { brand: true, category: true, subcategory: true, name: true, imageUrl: true },
          },
        },
      });
      for (const offer of offers) {
        const price = offer.finalPrice ?? offer.price;
        out[catalogKey(offer.provider, offer.externalId)] = {
          brand: offer.product.brand,
          category: offer.product.category,
          subcategory: offer.product.subcategory,
          name: offer.product.name,
          imageUrl: offer.product.imageUrl,
          currentPrice: price == null ? null : Number(price),
          stock: offer.stock,
        };
      }
    }
    return out;
  }

  private async catalogStatsFor(tenantId: string): Promise<CatalogStats> {
    const [all, inStock] = await Promise.all([
      this.prisma.tenantProductOffer.groupBy({
        by: ["provider"],
        where: { tenantId, active: true },
        _count: { _all: true },
        _max: { syncedAt: true },
      }),
      this.prisma.tenantProductOffer.groupBy({
        by: ["provider"],
        where: { tenantId, active: true, stock: { gt: 0 } },
        _count: { _all: true },
      }),
    ]);
    const inStockMap = new Map(inStock.map((row) => [row.provider, row._count._all]));
    const byProvider = all.map((row) => ({
      provider: row.provider,
      skus: row._count._all,
      inStock: inStockMap.get(row.provider) ?? 0,
      lastSyncAt: row._max.syncedAt?.toISOString() ?? null,
    }));
    return {
      skus: byProvider.reduce((sum, row) => sum + row.skus, 0),
      inStock: byProvider.reduce((sum, row) => sum + row.inStock, 0),
      lastSyncAt: byProvider.reduce<string | null>((latest, row) => {
        if (!row.lastSyncAt) return latest;
        if (!latest || row.lastSyncAt > latest) return row.lastSyncAt;
        return latest;
      }, null),
      byProvider,
      byBrand: [],
      byCategory: [],
    };
  }

  private async assertOfflineAllowed(tenantId: string, provider: Provider) {
    await this.visibility.assertLinked(tenantId, provider);
    if (!providerHasIvaRate(provider)) {
      throw new BadRequestException(
        `${PROVIDER_LABELS[provider]} no informa alícuota de IVA: no se puede registrar un pedido offline.`
      );
    }
    const config = await this.prisma.providerSyncConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
      select: { acceptsOffline: true },
    });
    if (!config?.acceptsOffline) {
      throw new BadRequestException(
        `Activá el pedido offline de ${PROVIDER_LABELS[provider]} en Configuración antes de confirmarlo.`
      );
    }
  }

  private send(
    provider: Provider,
    author: OrderAuthor,
    credentials: Record<string, string>,
    input: Record<string, unknown>,
    orderId: string
  ) {
    switch (provider) {
      case "INVID":
        return this.invid.approveDraft(author, credentials, input as unknown as InvidDraftInput, orderId);
      case "NEW_BYTES":
        return this.newBytes.approveDraft(author, credentials, input as unknown as NewBytesDraftInput, orderId);
      case "GRUPO_NUCLEO":
        return this.grupoNucleo.approveDraft(author, credentials, input as unknown as GnDraftInput, orderId);
      case "AIR":
        return this.air.approveDraft(author, credentials, input as unknown as AirDraftInput, orderId);
      case "ELIT":
        return this.elit.approveDraft(author, credentials, input as unknown as ElitCartItems, orderId);
      default:
        throw new BadRequestException(`Todavía no se pueden aprobar pedidos de ${provider} desde Nodo`);
    }
  }

  private async credentialsOf(tenant: TenantContext, provider: Provider) {
    const stored = await this.credentials.getByProvider(tenant.tenantId, provider);
    return JSON.parse(stored.credentialsJson) as Record<string, string>;
  }
}
