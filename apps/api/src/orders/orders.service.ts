import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
import {
  isOfflineChannel,
  normalizeOfflineItems,
  OFFLINE_ORDER_STATUS,
  ORDER_CHANNEL_OFFLINE,
  snapshotOfflineOrder,
} from "./offline-order";
import { OrderApprovalService } from "./order-approval.service";

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
    if (!isOfflineChannel(order.channel)) {
      throw new BadRequestException("Solo se pueden editar los pedidos offline");
    }
    if (order.approvalStatus === "REJECTED") {
      throw new BadRequestException("Ese pedido está rechazado");
    }

    const currentItems = normalizeOfflineItems(order.items);
    const items = dto.items ? normalizeOfflineItems(dto.items) : currentItems;
    if (items.length === 0) {
      throw new BadRequestException("El pedido tiene que tener al menos un producto");
    }
    const prev = snapshotOfflineOrder(currentItems, order.notes, (order.draftInput as { quoteRate?: number } | null)?.quoteRate);
    const snap = snapshotOfflineOrder(items, dto.notes !== undefined ? dto.notes : prev.notes, prev.quoteRate);

    const row = await this.prisma.providerOrder.update({
      where: { id: order.id },
      data: {
        notes: snap.notes,
        subtotal: new Prisma.Decimal(snap.netUsd),
        impuestos: new Prisma.Decimal(snap.internosUsd),
        total: new Prisma.Decimal(snap.totalUsd),
        items: snap.items as unknown as Prisma.InputJsonValue,
        draftInput: snap as unknown as Prisma.InputJsonValue,
      },
      include: {
        createdBy: { select: { id: true, username: true } },
        approvedBy: { select: { id: true, username: true } },
      },
    });
    return this.approval.serialize(row);
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
