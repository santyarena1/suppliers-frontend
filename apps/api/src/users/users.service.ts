import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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

  async updateActiveStatus(userId: string, active: boolean) {
    const existing = await this.assertExists(userId);
    if (existing.role === "ROLE_ADMIN" && active === false) {
      await this.assertNotLastActiveAdmin(userId);
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { active },
    });
    return { id: user.id, active: user.active };
  }

  async updateEndDate(userId: string, endDate: string | null) {
    await this.assertExists(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { endDate: endDate ? new Date(endDate) : null },
    });
    return { id: user.id, endDate: user.endDate };
  }

  async delete(userId: string) {
    const existing = await this.assertExists(userId);
    if (existing.role === "ROLE_ADMIN") {
      await this.assertNotLastActiveAdmin(userId);
    }
    await this.prisma.user.delete({ where: { id: userId } });
    return { id: userId };
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
