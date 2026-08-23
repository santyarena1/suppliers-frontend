import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateActiveStatusDto } from "./dto/update-active-status.dto";
import { UpdateEndDateDto } from "./dto/update-end-date.dto";
import { DeleteUserDto } from "./dto/delete-user.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        active: true,
        endDate: true,
        createdAt: true,
        updatedAt: true,
        brandId: true,
        brand: { select: { id: true, name: true, slug: true } },
        // Los proveedores configurados son los de la organización de la persona,
        // no los que cargó ella: la cuenta en el distribuidor es del comercio.
        memberships: {
          where: { active: true },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: {
            tenant: {
              select: { id: true, name: true, credentials: { select: { providerName: true } } },
            },
          },
        },
        accesses: {
          select: {
            brandId: true,
            status: true,
            brand: { select: { name: true, slug: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return users.map((user) => {
      const tenant = user.memberships[0]?.tenant ?? null;
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        active: user.active,
        endDate: user.endDate,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        brandId: user.brandId,
        brand: user.brand,
        tenantId: tenant?.id ?? null,
        tenantName: tenant?.name ?? null,
        providers: tenant?.credentials.map((c) => c.providerName) ?? [],
        brandAccesses: user.accesses.map((a) => ({
          brandId: a.brandId,
          brandName: a.brand.name,
          brandSlug: a.brand.slug,
          status: a.status,
        })),
      };
    });
  }

  private async assertExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    return user;
  }

  async updateActiveStatus(dto: UpdateActiveStatusDto) {
    const existing = await this.assertExists(dto.userId);
    if (existing.role === "ROLE_ADMIN" && dto.active === false) {
      await this.assertNotLastActiveAdmin(dto.userId);
    }
    const user = await this.prisma.user.update({
      where: { id: dto.userId },
      data: { active: dto.active },
    });
    return { id: user.id, active: user.active };
  }

  async updateEndDate(dto: UpdateEndDateDto) {
    await this.assertExists(dto.userId);
    const user = await this.prisma.user.update({
      where: { id: dto.userId },
      data: { endDate: dto.endDate ? new Date(dto.endDate) : null },
    });
    return { id: user.id, endDate: user.endDate };
  }

  async delete(dto: DeleteUserDto) {
    const existing = await this.assertExists(dto.userId);
    if (existing.role === "ROLE_ADMIN") {
      await this.assertNotLastActiveAdmin(dto.userId);
    }
    await this.prisma.user.delete({ where: { id: dto.userId } });
    return { id: dto.userId };
  }

  private async assertNotLastActiveAdmin(userId: string) {
    const others = await this.prisma.user.count({
      where: { role: "ROLE_ADMIN", active: true, id: { not: userId } },
    });
    if (others === 0) {
      throw new BadRequestException("No se puede quitar el último administrador activo");
    }
  }
}
