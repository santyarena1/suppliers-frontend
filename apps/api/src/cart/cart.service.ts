import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { TENANT_ROLES_CAN_ORDER } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { AddCartItemDto } from "./dto/add-item.dto";
import { UpdateCartItemDto } from "./dto/update-item.dto";

/**
 * Un carrito por comercio, compartido: lo que se agrega en el celular aparece en
 * la caja. El de solo lectura puede verlo; no lo toca.
 */
@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenant: TenantContext) {
    return this.prisma.cartItem.findMany({
      where: { tenantId: tenant.tenantId },
      orderBy: { createdAt: "asc" },
    });
  }

  async addItem(tenant: TenantContext, userId: string, dto: AddCartItemDto) {
    this.assertCanMutate(tenant);
    return this.prisma.cartItem.upsert({
      where: {
        tenantId_provider_externalId: {
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
        snapshot: dto.snapshot as Prisma.InputJsonValue | undefined,
      },
      update: {
        userId,
        quantity: { increment: dto.quantity },
        name: dto.name,
        price: dto.price,
        imageUrl: dto.imageUrl,
        ...(dto.snapshot === undefined ? {} : { snapshot: dto.snapshot as Prisma.InputJsonValue }),
      },
    });
  }

  private async assertOwnedItem(tenant: TenantContext, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({ where: { id: itemId } });
    if (!item || item.tenantId !== tenant.tenantId) {
      throw new NotFoundException("Ítem no encontrado en el carrito");
    }
    return item;
  }

  async updateItem(tenant: TenantContext, userId: string, itemId: string, dto: UpdateCartItemDto) {
    this.assertCanMutate(tenant);
    await this.assertOwnedItem(tenant, itemId);
    return this.prisma.cartItem.update({
      where: { id: itemId },
      data: {
        userId,
        ...(dto.quantity === undefined ? {} : { quantity: dto.quantity }),
        ...(dto.snapshot === undefined ? {} : { snapshot: dto.snapshot as Prisma.InputJsonValue }),
      },
    });
  }

  async removeItem(tenant: TenantContext, userId: string, itemId: string) {
    this.assertCanMutate(tenant);
    await this.assertOwnedItem(tenant, itemId);
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return { id: itemId };
  }

  async clear(tenant: TenantContext, provider?: string) {
    this.assertCanMutate(tenant);
    await this.prisma.cartItem.deleteMany({
      where: { tenantId: tenant.tenantId, ...(provider ? { provider } : {}) },
    });
    return { cleared: true };
  }

  private assertCanMutate(tenant: TenantContext) {
    if (!TENANT_ROLES_CAN_ORDER.includes(tenant.tenantRole)) {
      throw new ForbiddenException(`Tu rol en ${tenant.tenantName} no puede modificar el carrito`);
    }
  }
}
