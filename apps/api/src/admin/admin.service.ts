import { forgetSession } from "../auth/jwt.strategy";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import {
  KNOWN_PROVIDERS,
  LIST_PROVIDER_PREFIX,
  DEFAULT_MODULES_BY_ROLE,
  MODULE_KEYS,
  providerLabel,
  type ModuleKey,
  type Provider,
  type UserRole,
} from "@nodo/shared";
import { generatePassword } from "../common/generate-password";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateProviderDisplayDto } from "./dto/update-provider-display.dto";
import { UpdateBrandDisplayDto } from "./dto/update-brand-display.dto";
import { CreateBannerDto, UpdateBannerDto } from "./dto/banner.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService
  ) {}

  // ---------- Usuarios ----------

  /**
   * Alta de un superadmin. Es el único usuario que existe sin organización:
   * el resto se crea como miembro de una (`POST /admin/tenants/:id/members/new`).
   */
  async createUser(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { email: { equals: dto.email.trim().toLowerCase(), mode: "insensitive" } }] },
    });
    if (existing) {
      throw new ConflictException(
        existing.username === dto.username ? "El nombre de usuario ya está en uso" : "El email ya está registrado"
      );
    }
    const password = dto.password ?? generatePassword();
    const passwordHash = await argon2.hash(password);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email.trim().toLowerCase(),
        passwordHash,
        role: "ROLE_ADMIN",
        emailVerifiedAt: new Date(),
        active: dto.active ?? true,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      // Solo cuando la generó la plataforma: es la única vez que puede verse.
      ...(dto.password ? {} : { generatedPassword: password }),
    };
  }

  async updateUser(userId: string, dto: UpdateUserDto) {
    await this.assertUserExists(userId);
    if (dto.username) {
      const clash = await this.prisma.user.findFirst({ where: { username: dto.username, id: { not: userId } } });
      if (clash) throw new ConflictException("El nombre de usuario ya está en uso");
    }
    if (dto.email) {
      const email = dto.email.trim().toLowerCase();
      const clash = await this.prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, id: { not: userId } },
      });
      if (clash) throw new ConflictException("El email ya está registrado");
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.username ? { username: dto.username } : {}),
        ...(dto.email ? { email: dto.email.trim().toLowerCase(), emailVerifiedAt: new Date() } : {}),
      },
      select: { id: true, username: true, email: true, role: true, brandId: true },
    });
    return user;
  }

  /** Poner o quitar el pedido de "completar cuenta" sin tocar la contraseña. */
  async setAccountSetupRequired(userId: string, required: boolean) {
    await this.assertUserExists(userId);
    await this.prisma.user.update({ where: { id: userId }, data: { mustSetupAccount: required } });
    forgetSession(userId);
    return { id: userId, mustSetupAccount: required };
  }

  async resetPassword(userId: string, password?: string, requireSetup = true) {
    await this.assertUserExists(userId);
    const nextPassword = password ?? generatePassword();
    const passwordHash = await argon2.hash(nextPassword);
    // Contraseña nueva: se cierran las sesiones abiertas y se levanta el bloqueo. Es
    // temporal: al entrar tiene que confirmar su mail y elegir otra o conectar Google.
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
        failedLoginCount: 0,
        loginLockedUntil: null,
        mustSetupAccount: requireSetup,
      },
    });
    forgetSession(userId);
    return {
      id: userId,
      mustSetupAccount: requireSetup,
      // Solo cuando la generó la plataforma: es la única vez que puede verse.
      ...(password ? {} : { generatedPassword: nextPassword }),
    };
  }

  /**
   * Manda un mail a la cuenta. El email es el canal de la plataforma: no hay
   * baja ni casilla de "puede o no recibir información".
   */
  async sendUserEmail(userId: string, dto: { subject: string; text: string }) {
    const user = await this.assertUserExists(userId);
    const html = `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${escapeHtml(dto.text)}</pre>`;
    await this.mail.send({ to: user.email, subject: dto.subject, text: dto.text, html });
    return { sent: true, to: user.email };
  }

  /**
   * El nivel de plataforma ya no se elige a mano: se es superadmin o no. Al
   * quitarlo, el nivel vuelve a salir de la organización (marca → ROLE_BRAND,
   * cualquier otra → ROLE_USER), igual que al crear un miembro.
   */
  async setSuperadmin(userId: string, on: boolean) {
    const existing = await this.assertUserExists(userId);
    if (on) {
      const user = await this.prisma.user.update({ where: { id: userId }, data: { role: "ROLE_ADMIN" } });
      return { id: user.id, role: user.role };
    }
    if (existing.role === "ROLE_ADMIN") await this.assertNotLastActiveAdmin(userId);
    const brandMemberships = await this.prisma.tenantMembership.count({
      where: { userId, active: true, tenant: { type: "BRAND" } },
    });
    const role: UserRole = brandMemberships > 0 ? "ROLE_BRAND" : "ROLE_USER";
    const user = await this.prisma.user.update({ where: { id: userId }, data: { role } });
    return { id: user.id, role: user.role };
  }

  private async assertNotLastActiveAdmin(userId: string) {
    const others = await this.prisma.user.count({
      where: { role: "ROLE_ADMIN", active: true, id: { not: userId } },
    });
    if (others === 0) {
      throw new BadRequestException("No se puede quitar el rol del último administrador activo");
    }
  }

  private async assertUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    return user;
  }

  // ---------- Módulos ----------

  /**
   * Usado por `GET me/permissions` para cualquier usuario autenticado. Los
   * módulos salen solo del nivel de plataforma; lo que cada persona puede hacer
   * dentro de su organización lo define su rol ahí, no excepciones sueltas.
   */
  async getEffectivePermissions(_userId: string, role: UserRole): Promise<ModuleKey[]> {
    const defaults = DEFAULT_MODULES_BY_ROLE[role] ?? [];
    return MODULE_KEYS.filter((module) => defaults.includes(module as ModuleKey));
  }

  // ---------- Visibilidad / display de proveedores ----------

  async listProviderDisplay() {
    const [configs, listSuppliers] = await Promise.all([
      this.prisma.providerDisplayConfig.findMany(),
      this.prisma.tenant.findMany({
        where: { providerKey: { startsWith: LIST_PROVIDER_PREFIX } },
        select: { providerKey: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    const byProvider = new Map(configs.map((c) => [c.provider, c]));
    const listNames = new Map(listSuppliers.map((t) => [t.providerKey ?? "", t.name]));
    const providers: string[] = [
      ...KNOWN_PROVIDERS,
      ...listSuppliers.map((t) => t.providerKey).filter((k): k is string => Boolean(k)),
    ];
    return providers.map((provider) => {
      const c = byProvider.get(provider);
      return {
        provider,
        name: providerLabel(provider, listNames.get(provider)),
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

  // ---------- Identidad visual ----------

  async getPlatformSettings() {
    const row = await this.prisma.platformSettings.findUnique({ where: { id: "platform" } });
    if (row) return row;
    return this.prisma.platformSettings.create({
      data: { id: "platform", brandPreset: "violet" },
    });
  }

  async updatePlatformSettings(brandPreset: string) {
    return this.prisma.platformSettings.upsert({
      where: { id: "platform" },
      create: { id: "platform", brandPreset },
      update: { brandPreset },
    });
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
