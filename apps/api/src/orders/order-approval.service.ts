import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, ProviderOrder } from "@prisma/client";
import {
  PROVIDER_LABELS,
  TENANT_ROLES_CAN_APPROVE_ORDERS,
  TENANT_ROLES_CAN_CONFIRM_ORDERS,
  TENANT_ROLES_CAN_ORDER,
  type Provider,
} from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantVisibilityService } from "../tenants/tenant-visibility.service";

/** Lo que devuelve el checkout cuando el pedido queda esperando una firma. */
export interface HeldOrder {
  id: string;
  status: "PENDING_APPROVAL";
  approvalStatus: "PENDING_APPROVAL";
  orderNumber: null;
  webOrderNumber: null;
  paymentLabel: null;
  deliveryLabel: null;
  items: unknown;
  total: null;
  message: string;
}

interface DraftLike {
  items?: unknown;
  notes?: string;
}

/**
 * Aprobación interna del comercio (ver docs/ARQUITECTURA_TENANTS.md): un vendedor
 * arma el pedido pero no lo manda al proveedor. Queda guardado tal cual, y recién
 * cuando lo aprueba el dueño o un administrador se envía con esos mismos datos.
 */
@Injectable()
export class OrderApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: TenantVisibilityService
  ) {}

  /** Todo pedido nace de alguien que puede comprar; el rol de solo lectura no compra. */
  assertCanOrder(tenant: TenantContext) {
    if (!TENANT_ROLES_CAN_ORDER.includes(tenant.tenantRole)) {
      throw new ForbiddenException(`Tu rol en ${tenant.tenantName} no puede armar pedidos`);
    }
  }

  needsApproval(tenant: TenantContext) {
    return !TENANT_ROLES_CAN_CONFIRM_ORDERS.includes(tenant.tenantRole);
  }

  canApprove(tenant: TenantContext) {
    return TENANT_ROLES_CAN_APPROVE_ORDERS.includes(tenant.tenantRole);
  }

  /**
   * Si quien confirma no puede hacerlo solo, guarda el pedido y devuelve el aviso.
   * Devuelve `null` cuando la persona sí puede confirmar y el checkout sigue de largo.
   */
  async hold(
    tenant: TenantContext,
    userId: string,
    provider: Provider,
    draft: DraftLike
  ): Promise<HeldOrder | null> {
    this.assertCanOrder(tenant);
    if (!this.needsApproval(tenant)) return null;
    await this.visibility.assertLinked(tenant.tenantId, provider);

    const items = Array.isArray(draft.items) ? draft.items : [];
    if (items.length === 0) {
      throw new BadRequestException(`No hay productos de ${PROVIDER_LABELS[provider]} en el pedido`);
    }

    const order = await this.prisma.providerOrder.create({
      data: {
        userId,
        tenantId: tenant.tenantId,
        createdByUserId: userId,
        provider,
        status: "PENDING_APPROVAL",
        approvalStatus: "PENDING_APPROVAL",
        paymentOption: "",
        notes: draft.notes,
        items: items as Prisma.InputJsonValue,
        addressSnapshot: {},
        draftInput: draft as Prisma.InputJsonValue,
      },
    });

    return {
      id: order.id,
      status: "PENDING_APPROVAL",
      approvalStatus: "PENDING_APPROVAL",
      orderNumber: null,
      webOrderNumber: null,
      paymentLabel: null,
      deliveryLabel: null,
      items,
      total: null,
      message: `El pedido de ${PROVIDER_LABELS[provider]} quedó guardado esperando que lo apruebe un responsable de ${tenant.tenantName}. Hasta entonces no se manda al proveedor.`,
    };
  }

  /** Pedidos de la organización. Los que esperan aprobación van primero. */
  async list(tenant: TenantContext, filtro?: { pendientes?: boolean }) {
    const rows = await this.prisma.providerOrder.findMany({
      where: {
        tenantId: tenant.tenantId,
        ...(filtro?.pendientes ? { approvalStatus: "PENDING_APPROVAL" } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        createdBy: { select: { id: true, username: true } },
        approvedBy: { select: { id: true, username: true } },
      },
    });
    return rows.map((row) => this.serialize(row));
  }

  async getOwn(tenant: TenantContext, id: string) {
    const row = await this.prisma.providerOrder.findFirst({
      where: { id, tenantId: tenant.tenantId },
    });
    if (!row) throw new NotFoundException("Pedido no encontrado");
    return row;
  }

  /** Solo el dueño o un administrador de la organización aprueban lo de otro. */
  async assertApprovable(tenant: TenantContext, id: string) {
    if (!this.canApprove(tenant)) {
      throw new ForbiddenException(
        `Solo el dueño o un administrador de ${tenant.tenantName} pueden aprobar pedidos`
      );
    }
    const order = await this.getOwn(tenant, id);
    if (order.approvalStatus !== "PENDING_APPROVAL") {
      throw new BadRequestException("Ese pedido ya no está esperando aprobación");
    }
    if (!order.draftInput) {
      throw new BadRequestException("Ese pedido no guardó los datos originales y no se puede enviar");
    }
    return order;
  }

  async markApproved(id: string, approvedByUserId: string) {
    await this.prisma.providerOrder.update({
      where: { id },
      data: { approvalStatus: "APPROVED", approvedByUserId, approvalDecidedAt: new Date() },
    });
  }

  async reject(tenant: TenantContext, userId: string, id: string, reason?: string) {
    await this.assertApprovable(tenant, id);
    const row = await this.prisma.providerOrder.update({
      where: { id },
      data: {
        approvalStatus: "REJECTED",
        status: "REJECTED",
        approvedByUserId: userId,
        approvalDecidedAt: new Date(),
        rejectionReason: reason?.slice(0, 500),
      },
      include: {
        createdBy: { select: { id: true, username: true } },
        approvedBy: { select: { id: true, username: true } },
      },
    });
    return this.serialize(row);
  }

  serialize(
    row: ProviderOrder & {
      createdBy?: { id: string; username: string } | null;
      approvedBy?: { id: string; username: string } | null;
    }
  ) {
    return {
      id: row.id,
      provider: row.provider,
      providerName: PROVIDER_LABELS[row.provider as Provider] ?? row.provider,
      status: row.status,
      approvalStatus: row.approvalStatus,
      orderNumber: row.invidOrderNumber,
      webOrderNumber: row.invidWebOrderNumber,
      paymentLabel: row.paymentLabel,
      deliveryLabel: row.deliveryLabel,
      notes: row.notes,
      total: row.total == null ? null : Number(row.total),
      errorMessage: row.errorMessage,
      rejectionReason: row.rejectionReason,
      items: Array.isArray(row.items) ? row.items : [],
      createdBy: row.createdBy?.username ?? null,
      approvedBy: row.approvedBy?.username ?? null,
      approvalDecidedAt: row.approvalDecidedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
