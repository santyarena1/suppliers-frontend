import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { ChatHub } from "../chat/chat.hub";
import { AddCartItemDto } from "./dto/add-item.dto";
import { UpdateCartItemDto } from "./dto/update-item.dto";
import { UpsertOrgCartDto } from "./dto/org-cart.dto";
import { attributeCartItems } from "./cart-attribution";
import { orderedLines, removeOrderedFromCart } from "./cart-order-reconcile";

/** Un mismo candado para todo lo que reescribe el carrito de un comercio. */
const cartLockKey = (tenantId: string) => `orgcart:${tenantId}`;

/**
 * El carrito personal (`/cart/items`) quedó por compatibilidad.
 * El carrito que usa la web es el de la organización: un solo armado por local,
 * visible para el equipo y para el vendedor del distribuidor vinculado.
 */
type OrgCartPayload = {
  tenantId: string;
  items: Prisma.JsonValue[];
  schemes: Prisma.JsonValue[];
  updatedByUserId: string | null;
  updatedAt: string | null;
  /** Nombre de cada integrante que figura en `by` de las líneas. Solo para el equipo del comercio. */
  people?: Record<string, string>;
};

function providerOf(entry: Prisma.JsonValue): string | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const provider = (entry as Record<string, unknown>).provider;
  return typeof provider === "string" ? provider : null;
}

/** El carrito del comercio recortado a un proveedor. Sin proveedor asignado, vacío. */
export function onlyProvider(payload: OrgCartPayload, provider: string | null): OrgCartPayload {
  const mine = (entry: Prisma.JsonValue) => provider !== null && providerOf(entry) === provider;
  // El distribuidor no ve quién del equipo del comercio armó cada línea.
  const { people: _people, ...rest } = payload;
  return {
    ...rest,
    items: payload.items.filter(mine).map(withoutAuthors),
    schemes: payload.schemes.filter(mine),
  };
}

function withoutAuthors(entry: Prisma.JsonValue): Prisma.JsonValue {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
  const { by: _by, ...rest } = entry as Record<string, Prisma.JsonValue>;
  return rest;
}

/** Quién del distribuidor puede seguir el carrito de un cliente: dueño, admin o su vendedor asignado. */
export function canWatchClientCart(
  tenant: Pick<TenantContext, "tenantRole" | "userId">,
  accountManagerId: string | null
): boolean {
  if (tenant.tenantRole === "OWNER" || tenant.tenantRole === "ADMIN") return true;
  return tenant.tenantRole === "SELLER" && accountManagerId === tenant.userId;
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: ChatHub
  ) {}

  async getOrgCart(tenant: TenantContext) {
    this.assertRetailer(tenant);
    await this.reconcileOrders(tenant.tenantId);
    const row = await this.prisma.orgCart.findUnique({ where: { tenantId: tenant.tenantId } });
    return this.withPeople(this.serializeOrg(row, tenant.tenantId));
  }

  async putOrgCart(tenant: TenantContext, userId: string, dto: UpsertOrgCartDto) {
    this.assertRetailer(tenant);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cartLockKey(tenant.tenantId)}))`;
      const prev = await tx.orgCart.findUnique({ where: { tenantId: tenant.tenantId }, select: { items: true } });
      const items = attributeCartItems(Array.isArray(prev?.items) ? prev.items : [], dto.items, userId);
      return tx.orgCart.upsert({
      where: { tenantId: tenant.tenantId },
      create: {
        tenantId: tenant.tenantId,
        items: items as Prisma.InputJsonValue,
        schemes: (dto.schemes ?? []) as Prisma.InputJsonValue,
        updatedByUserId: userId,
      },
      update: {
        items: items as Prisma.InputJsonValue,
        schemes: (dto.schemes ?? []) as Prisma.InputJsonValue,
        updatedByUserId: userId,
      },
      });
    });
    const payload = await this.withPeople(this.serializeOrg(row, tenant.tenantId));
    await this.broadcast(tenant.tenantId, payload);
    return payload;
  }

  async getClientCart(tenant: TenantContext, linkId: string) {
    if (tenant.tenantType !== "DISTRIBUTOR") {
      throw new ForbiddenException("Solo el distribuidor ve el carrito del comercio");
    }
    const link = await this.prisma.tenantLink.findUnique({
      where: { id: linkId },
      select: { id: true, supplierTenantId: true, clientTenantId: true, accountManagerId: true, status: true },
    });
    // Estricto: vínculo activo y solo quien atiende a ese cliente (dueño/admin
    // o el vendedor asignado). Cualquier otro caso responde igual que si no existiera.
    if (!link || link.supplierTenantId !== tenant.tenantId || link.status !== "ACTIVE") {
      throw new NotFoundException("Cliente no encontrado");
    }
    if (!canWatchClientCart(tenant, link.accountManagerId)) {
      throw new NotFoundException("Cliente no encontrado");
    }
    const [row, supplier] = await Promise.all([
      this.prisma.orgCart.findUnique({ where: { tenantId: link.clientTenantId } }),
      this.prisma.tenant.findUnique({ where: { id: tenant.tenantId }, select: { providerKey: true } }),
    ]);
    return onlyProvider(this.serializeOrg(row, link.clientTenantId), supplier?.providerKey ?? null);
  }

  private serializeOrg(
    row: { items: Prisma.JsonValue; schemes: Prisma.JsonValue; updatedByUserId: string | null; updatedAt: Date } | null,
    tenantId: string
  ) {
    return {
      tenantId,
      items: Array.isArray(row?.items) ? row.items : [],
      schemes: Array.isArray(row?.schemes) ? row.schemes : [],
      updatedByUserId: row?.updatedByUserId ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  /**
   * Saca del carrito compartido los productos de los pedidos ya creados en el
   * distribuidor (status CREATED) que todavía no se descontaron. Corre al pedir
   * el carrito y cada pocos segundos (CartOrderReconcileScheduler), así lo ven
   * todas las PCs aunque el pedido haya terminado en segundo plano.
   * Devuelve cuántos pedidos concilió.
   */
  async reconcileOrders(tenantId?: string): Promise<number> {
    const orders = await this.prisma.providerOrder.findMany({
      where: { status: "CREATED", cartReconciledAt: null, ...(tenantId ? { tenantId } : {}) },
      select: { id: true, tenantId: true, provider: true, items: true },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    if (orders.length === 0) return 0;
    const byTenant = new Map<string, typeof orders>();
    for (const order of orders) byTenant.set(order.tenantId, [...(byTenant.get(order.tenantId) ?? []), order]);

    for (const [retailerId, list] of byTenant) {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cartLockKey(retailerId)}))`;
        const row = await tx.orgCart.findUnique({ where: { tenantId: retailerId } });
        let items: Prisma.JsonValue[] = Array.isArray(row?.items) ? row.items : [];
        let changed = false;
        for (const order of list) {
          const result = removeOrderedFromCart(items, order.provider, orderedLines(order.items));
          items = result.items;
          changed = changed || result.changed;
        }
        await tx.providerOrder.updateMany({
          where: { id: { in: list.map((o) => o.id) } },
          data: { cartReconciledAt: new Date() },
        });
        if (!row || !changed) return null;
        // Sin autor: así todas las PCs (también las de quien pidió) aplican el cambio.
        return tx.orgCart.update({
          where: { tenantId: retailerId },
          data: { items: items as Prisma.InputJsonValue, updatedByUserId: null },
        });
      });
      if (updated) await this.broadcast(retailerId, await this.withPeople(this.serializeOrg(updated, retailerId)));
    }
    return orders.length;
  }

  /**
   * Pedidos de las últimas horas (creados o creándose), para avisar en el
   * carrito antes de pedir dos veces lo mismo.
   */
  async recentOrders(tenant: TenantContext, hours: number) {
    this.assertRetailer(tenant);
    const since = new Date(Date.now() - Math.min(Math.max(hours, 1), 48) * 3_600_000);
    const rows = await this.prisma.providerOrder.findMany({
      where: { tenantId: tenant.tenantId, createdAt: { gte: since }, status: { in: ["PENDING", "CREATED"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        provider: true,
        status: true,
        createdAt: true,
        invidOrderNumber: true,
        invidWebOrderNumber: true,
        items: true,
        user: { select: { username: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      orderNumber: row.invidOrderNumber ?? row.invidWebOrderNumber ?? null,
      byUsername: row.user?.username ?? null,
      items: orderedLines(row.items),
    }));
  }

  /** Nombres del equipo (también de quien ya no está, para que sus líneas sigan teniendo autor). */
  private async withPeople(payload: OrgCartPayload): Promise<OrgCartPayload> {
    const members = await this.prisma.tenantMembership.findMany({
      where: { tenantId: payload.tenantId },
      select: { userId: true, user: { select: { username: true } } },
    });
    return { ...payload, people: Object.fromEntries(members.map((m) => [m.userId, m.user.username])) };
  }

  /**
   * El equipo del comercio recibe el carrito entero. Cada distribuidor vinculado
   * (sus dueños y el vendedor asignado) recibe solo lo que es suyo: nunca ve lo
   * que el comercio arma con la competencia.
   */
  private async broadcast(retailerTenantId: string, payload: OrgCartPayload) {
    const members = await this.prisma.tenantMembership.findMany({
      where: { tenantId: retailerTenantId, active: true, user: { active: true } },
      select: { userId: true },
    });
    const memberIds = members.map((m) => m.userId);
    this.hub.emitToUsers(memberIds, { type: "cart_updated", data: payload });

    const links = await this.prisma.tenantLink.findMany({
      where: { clientTenantId: retailerTenantId, status: "ACTIVE" },
      select: { accountManagerId: true, supplierTenantId: true, supplierTenant: { select: { providerKey: true } } },
    });
    if (links.length === 0) return;
    // Dueños y admins del distribuidor, y el vendedor asignado solo si sigue activo en ese equipo.
    const supplierMembers = await this.prisma.tenantMembership.findMany({
      where: {
        tenantId: { in: links.map((link) => link.supplierTenantId) },
        active: true,
        user: { active: true },
      },
      select: { userId: true, tenantId: true, role: true },
    });
    const owners = supplierMembers.filter((m) => m.role === "OWNER" || m.role === "ADMIN");
    const already = new Set(memberIds);
    for (const link of links) {
      const ids = [
        ...owners.filter((o) => o.tenantId === link.supplierTenantId).map((o) => o.userId),
        ...supplierMembers
          .filter((m) => m.tenantId === link.supplierTenantId && m.userId === link.accountManagerId)
          .map((m) => m.userId),
      ].filter((id) => !already.has(id));
      if (ids.length === 0) continue;
      this.hub.emitToUsers([...new Set(ids)], {
        type: "cart_updated",
        data: onlyProvider(payload, link.supplierTenant.providerKey),
      });
    }
  }

  private assertRetailer(tenant: TenantContext) {
    if (tenant.tenantType !== "RETAILER") {
      throw new ForbiddenException("El carrito es del comercio");
    }
  }


  list(tenant: TenantContext, userId: string) {
    return this.prisma.cartItem.findMany({
      where: { userId, tenantId: tenant.tenantId },
      orderBy: { createdAt: "asc" },
    });
  }

  async addItem(tenant: TenantContext, userId: string, dto: AddCartItemDto) {
    return this.prisma.cartItem.upsert({
      where: {
        userId_tenantId_provider_externalId: {
          userId,
          tenantId: tenant.tenantId,
          provider: dto.provider,
          externalId: dto.externalId,
        },
      },
      create: {
        userId,
        tenantId: tenant.tenantId,
        provider: dto.provider,
        externalId: dto.externalId,
        name: dto.name,
        price: dto.price,
        imageUrl: dto.imageUrl,
        quantity: dto.quantity,
      },
      update: { quantity: { increment: dto.quantity } },
    });
  }

  private async assertOwnedItem(tenant: TenantContext, userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({ where: { id: itemId } });
    if (!item || item.tenantId !== tenant.tenantId) {
      throw new NotFoundException("Ítem no encontrado en el carrito");
    }
    if (item.userId !== userId) throw new ForbiddenException("Este ítem no pertenece a tu carrito");
    return item;
  }

  async updateItem(tenant: TenantContext, userId: string, itemId: string, dto: UpdateCartItemDto) {
    await this.assertOwnedItem(tenant, userId, itemId);
    return this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity: dto.quantity } });
  }

  async removeItem(tenant: TenantContext, userId: string, itemId: string) {
    await this.assertOwnedItem(tenant, userId, itemId);
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return { id: itemId };
  }

  async clear(tenant: TenantContext, userId: string) {
    await this.prisma.cartItem.deleteMany({ where: { userId, tenantId: tenant.tenantId } });
    return { cleared: true };
  }
}
