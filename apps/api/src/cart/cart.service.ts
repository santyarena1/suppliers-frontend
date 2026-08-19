import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AddCartItemDto } from "./dto/add-item.dto";
import { UpdateCartItemDto } from "./dto/update-item.dto";

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.cartItem.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    return this.prisma.cartItem.upsert({
      where: { userId_provider_externalId: { userId, provider: dto.provider, externalId: dto.externalId } },
      create: {
        userId,
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

  private async assertOwnedItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException("Ítem no encontrado en el carrito");
    if (item.userId !== userId) throw new ForbiddenException("Este ítem no pertenece a tu carrito");
    return item;
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    await this.assertOwnedItem(userId, itemId);
    return this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity: dto.quantity } });
  }

  async removeItem(userId: string, itemId: string) {
    await this.assertOwnedItem(userId, itemId);
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return { id: itemId };
  }

  async clear(userId: string) {
    await this.prisma.cartItem.deleteMany({ where: { userId } });
    return { cleared: true };
  }
}
