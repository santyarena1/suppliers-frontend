import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { AddCartItemDto } from "./dto/add-item.dto";
import { UpdateCartItemDto } from "./dto/update-item.dto";

/**
 * El carrito es personal —dos vendedores del mismo local arman el suyo— pero vive
 * dentro de una organización: al cambiar de comercio no se lleva lo que había juntado.
 */
@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

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
