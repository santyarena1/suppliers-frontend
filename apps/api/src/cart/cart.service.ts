import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { ChatHub } from "../chat/chat.hub";
import { AddCartItemDto } from "./dto/add-item.dto";
import { UpdateCartItemDto } from "./dto/update-item.dto";
import { UpsertOrgCartDto } from "./dto/org-cart.dto";

/**
 * El carrito personal (`/cart/items`) quedó por compatibilidad.
 * El carrito que usa la web es el de la organización: un solo armado por local,
 * visible para el equipo y para el vendedor del distribuidor vinculado.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: ChatHub
  ) {}

  async getOrgCart(tenant: TenantContext) {
    this.assertRetailer(tenant);
    const row = await this.prisma.orgCart.findUnique({ where: { tenantId: tenant.tenantId } });
    return this.serializeOrg(row, tenant.tenantId);
  }

  async putOrgCart(tenant: TenantContext, userId: string, dto: UpsertOrgCartDto) {
    this.assertRetailer(tenant);
    const row = await this.prisma.orgCart.upsert({
      where: { tenantId: tenant.tenantId },
      create: {
        tenantId: tenant.tenantId,
        items: dto.items as Prisma.InputJsonValue,
        schemes: (dto.schemes ?? []) as Prisma.InputJsonValue,
        updatedByUserId: userId,
      },
      update: {
        items: dto.items as Prisma.InputJsonValue,
        schemes: (dto.schemes ?? []) as Prisma.InputJsonValue,
        updatedByUserId: userId,
      },
    });
    const payload = this.serializeOrg(row, tenant.tenantId);
    const watchers = await this.cartWatcherIds(tenant.tenantId);
    this.hub.emitToUsers(watchers, { type: "cart_updated", data: payload });
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
    if (!link || link.supplierTenantId !== tenant.tenantId) {
      throw new NotFoundException("Cliente no encontrado");
    }
    if (tenant.tenantRole === "SELLER" && link.accountManagerId !== tenant.userId) {
      throw new NotFoundException("Cliente no encontrado");
    }
    const row = await this.prisma.orgCart.findUnique({ where: { tenantId: link.clientTenantId } });
    return this.serializeOrg(row, link.clientTenantId);
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

  private async cartWatcherIds(retailerTenantId: string) {
    const members = await this.prisma.tenantMembership.findMany({
      where: { tenantId: retailerTenantId, active: true, user: { active: true } },
      select: { userId: true },
    });
    const links = await this.prisma.tenantLink.findMany({
      where: { clientTenantId: retailerTenantId, status: { in: ["ACTIVE", "SUSPENDED"] } },
      select: { accountManagerId: true, supplierTenantId: true },
    });
    const sellerIds = links.map((link) => link.accountManagerId).filter((id): id is string => Boolean(id));
    const owners = await this.prisma.tenantMembership.findMany({
      where: {
        tenantId: { in: links.map((link) => link.supplierTenantId) },
        active: true,
        role: { in: ["OWNER", "ADMIN"] },
        user: { active: true },
      },
      select: { userId: true },
    });
    return [...new Set([...members.map((m) => m.userId), ...sellerIds, ...owners.map((m) => m.userId)])];
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
