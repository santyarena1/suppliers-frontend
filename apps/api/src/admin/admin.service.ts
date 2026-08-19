import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { ALL_PROVIDERS, DEFAULT_MODULES_BY_ROLE, MODULE_KEYS, type ModuleKey, type Provider, type UserRole } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { UpdatePermissionsDto } from "./dto/update-permissions.dto";
import { UpdateProviderDisplayDto } from "./dto/update-provider-display.dto";
import { UpdateBrandDisplayDto } from "./dto/update-brand-display.dto";
import { CreateBannerDto, UpdateBannerDto } from "./dto/banner.dto";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Usuarios ----------

  async createUser(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email }] },
    });
    if (existing) {
      throw new ConflictException(
        existing.username === dto.username ? "El nombre de usuario ya está en uso" : "El email ya está registrado"
      );
    }
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: { username: dto.username, email: dto.email, passwordHash, role: dto.role },
    });
    return { id: user.id, username: user.username, email: user.email, role: user.role };
  }

  async updateRole(userId: string, dto: UpdateRoleDto) {
    await this.assertUserExists(userId);
    const user = await this.prisma.user.update({ where: { id: userId }, data: { role: dto.role } });
    return { id: user.id, role: user.role };
  }

  private async assertUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    return user;
  }

  // ---------- Permisos por módulo ----------

  async getPermissions(userId: string) {
    const user = await this.assertUserExists(userId);
    const overrides = await this.prisma.userModuleAccess.findMany({ where: { userId } });
    const overrideMap = new Map(overrides.map((o) => [o.module, o.allowed]));
    const defaults = DEFAULT_MODULES_BY_ROLE[user.role] ?? [];
    return MODULE_KEYS.map((module) => ({
      module,
      allowed: overrideMap.has(module) ? (overrideMap.get(module) as boolean) : defaults.includes(module as ModuleKey),
    }));
  }

  async updatePermissions(userId: string, dto: UpdatePermissionsDto) {
    await this.assertUserExists(userId);
    await this.prisma.$transaction(
      dto.permissions.map((p) =>
        this.prisma.userModuleAccess.upsert({
          where: { userId_module: { userId, module: p.module } },
          create: { userId, module: p.module, allowed: p.allowed },
          update: { allowed: p.allowed },
        })
      )
    );
    return this.getPermissions(userId);
  }

  /** Usado por `GET me/permissions` para cualquier usuario autenticado. */
  async getEffectivePermissions(userId: string, role: UserRole) {
    const overrides = await this.prisma.userModuleAccess.findMany({ where: { userId } });
    const overrideMap = new Map(overrides.map((o) => [o.module, o.allowed]));
    const defaults = DEFAULT_MODULES_BY_ROLE[role] ?? [];
    return MODULE_KEYS.filter((module) =>
      overrideMap.has(module) ? (overrideMap.get(module) as boolean) : defaults.includes(module as ModuleKey)
    );
  }

  // ---------- Visibilidad / display de proveedores ----------

  async listProviderDisplay() {
    const configs = await this.prisma.providerDisplayConfig.findMany();
    const byProvider = new Map(configs.map((c) => [c.provider, c]));
    return ALL_PROVIDERS.map((provider) => {
      const c = byProvider.get(provider);
      return {
        provider,
        visible: c?.visible ?? true,
        logoUrl: c?.logoUrl ?? null,
        textColor: c?.textColor ?? null,
      };
    });
  }

  async updateProviderDisplay(provider: Provider, dto: UpdateProviderDisplayDto) {
    const config = await this.prisma.providerDisplayConfig.upsert({
      where: { provider },
      create: { provider, ...dto },
      update: { ...dto },
    });
    return config;
  }

  // ---------- Visibilidad / display de marcas ----------

  async listBrandDisplay() {
    return this.prisma.brandAccount.findMany({
      select: { id: true, name: true, slug: true, logoUrl: true, textColor: true, visible: true },
      orderBy: { name: "asc" },
    });
  }

  async updateBrandDisplay(brandId: string, dto: UpdateBrandDisplayDto) {
    const existing = await this.prisma.brandAccount.findUnique({ where: { id: brandId } });
    if (!existing) throw new NotFoundException("Marca no encontrada");
    return this.prisma.brandAccount.update({ where: { id: brandId }, data: { ...dto } });
  }

  // ---------- Banners ----------

  listBanners(position?: string) {
    return this.prisma.homeBanner.findMany({
      where: position ? { position, active: true } : undefined,
      orderBy: { order: "asc" },
    });
  }

  listAllBanners() {
    return this.prisma.homeBanner.findMany({ orderBy: [{ position: "asc" }, { order: "asc" }] });
  }

  createBanner(dto: CreateBannerDto) {
    return this.prisma.homeBanner.create({ data: dto });
  }

  async updateBanner(id: string, dto: UpdateBannerDto) {
    const existing = await this.prisma.homeBanner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Banner no encontrado");
    return this.prisma.homeBanner.update({ where: { id }, data: dto });
  }

  async deleteBanner(id: string) {
    const existing = await this.prisma.homeBanner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Banner no encontrado");
    await this.prisma.homeBanner.delete({ where: { id } });
    return { id };
  }
}
