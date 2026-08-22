import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { Prisma, UserRole } from "@prisma/client";
import {
  TENANT_ROLES_BY_TYPE,
  type TenantRole,
  type TenantType,
} from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateAccessCodeDto,
  CreateMembershipDto,
  CreateTenantDto,
  CreateTenantUserDto,
  SetProductManagerScopeDto,
  UpdateMembershipDto,
  UpdateTenantDto,
  UpsertLinkDto,
} from "./dto/tenant.dto";

const MEMBERSHIP_INCLUDE = {
  user: {
    select: { id: true, username: true, email: true, role: true, active: true, endDate: true },
  },
} satisfies Prisma.TenantMembershipInclude;

const TENANT_INCLUDE = {
  brand: { select: { id: true, name: true } },
  memberships: { include: MEMBERSHIP_INCLUDE, orderBy: { createdAt: "asc" } },
  accessCodes: { orderBy: { createdAt: "desc" } },
  pmScopes: true,
} satisfies Prisma.TenantInclude;

/** Alfabeto sin caracteres ambiguos: el código se dicta o se tipea a mano. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateAccessCode(): string {
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Organizaciones ----------

  /**
   * Árbol completo para el panel de superadmin: cada organización con sus
   * usuarios y sus vínculos hacia y desde otras organizaciones, más los
   * usuarios que todavía no pertenecen a ninguna organización.
   */
  async tree() {
    const [tenants, links, unassigned] = await Promise.all([
      this.prisma.tenant.findMany({ include: TENANT_INCLUDE, orderBy: [{ type: "asc" }, { name: "asc" }] }),
      this.prisma.tenantLink.findMany({
        include: {
          clientTenant: { select: { id: true, name: true, type: true } },
          supplierTenant: { select: { id: true, name: true, type: true } },
          accountManager: { select: { id: true, username: true, email: true } },
        },
      }),
      this.prisma.user.findMany({
        where: { memberships: { none: {} } },
        select: { id: true, username: true, email: true, role: true, active: true, endDate: true },
        orderBy: { username: "asc" },
      }),
    ]);

    const nodes = tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      type: tenant.type,
      providerKey: tenant.providerKey,
      brand: tenant.brand,
      contactEmail: tenant.contactEmail,
      contactPhone: tenant.contactPhone,
      notes: tenant.notes,
      advertisingEnabled: tenant.advertisingEnabled,
      active: tenant.active,
      createdAt: tenant.createdAt,
      members: tenant.memberships.map((membership) => ({
        ...this.serializeMember(membership),
        // Marcas que este usuario controla si es Product Manager.
        managedBrands: tenant.pmScopes
          .filter((scope) => scope.userId === membership.userId)
          .map((scope) => scope.brandName),
      })),
      accessCodes: tenant.accessCodes.map((code) => ({
        id: code.id,
        code: code.code,
        label: code.label,
        maxUses: code.maxUses,
        usedCount: code.usedCount,
        expiresAt: code.expiresAt,
        revoked: code.revoked,
        createdAt: code.createdAt,
      })),
      suppliers: links
        .filter((link) => link.clientTenantId === tenant.id)
        .map((link) => this.serializeLink(link, "supplier")),
      clients: links
        .filter((link) => link.supplierTenantId === tenant.id)
        .map((link) => this.serializeLink(link, "client")),
    }));

    return { tenants: nodes, unassignedUsers: unassigned };
  }

  /** Relaciones directas e indirectas de un usuario, para la vista de detalle. */
  async userRelations(userId: string) {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { userId },
      include: {
        tenant: {
          include: {
            memberships: { include: MEMBERSHIP_INCLUDE },
            supplierLinks: {
              include: {
                supplierTenant: { select: { id: true, name: true, type: true } },
                accountManager: { select: { id: true, username: true, email: true } },
              },
            },
            clientLinks: {
              include: {
                clientTenant: { select: { id: true, name: true, type: true } },
                accountManager: { select: { id: true, username: true, email: true } },
              },
            },
          },
        },
      },
    });

    const managedAccounts = await this.prisma.tenantLink.findMany({
      where: { accountManagerId: userId },
      include: {
        clientTenant: { select: { id: true, name: true, type: true } },
        supplierTenant: { select: { id: true, name: true, type: true } },
        accountManager: { select: { id: true, username: true, email: true } },
      },
    });

    return {
      organizations: memberships.map((membership) => ({
        membershipId: membership.id,
        role: membership.role,
        title: membership.title,
        active: membership.active,
        tenant: {
          id: membership.tenant.id,
          name: membership.tenant.name,
          type: membership.tenant.type,
        },
        // Compañeros dentro de la misma organización (relación directa).
        colleagues: membership.tenant.memberships
          .filter((other) => other.userId !== userId)
          .map((other) => this.serializeMember(other)),
        // Organizaciones alcanzables desde la suya (relación indirecta).
        suppliers: membership.tenant.supplierLinks.map((link) => this.serializeLink(link, "supplier")),
        clients: membership.tenant.clientLinks.map((link) => this.serializeLink(link, "client")),
      })),
      // Cuentas donde este usuario es el vendedor asignado (relación directa).
      assignedAccounts: managedAccounts.map((link) => ({
        linkId: link.id,
        status: link.status,
        discountPercent: link.discountPercent,
        client: link.clientTenant,
        supplier: link.supplierTenant,
      })),
    };
  }

  async createTenant(dto: CreateTenantDto) {
    await this.assertTenantNameFree(dto.name);
    if (dto.providerKey) await this.assertProviderKeyFree(dto.providerKey);
    if (dto.brandId) await this.assertBrandFree(dto.brandId);
    this.assertProviderKeyMatchesType(dto.type, dto.providerKey);
    this.assertBrandMatchesType(dto.type, dto.brandId);

    return this.prisma.tenant.create({
      data: {
        name: dto.name.trim(),
        type: dto.type,
        providerKey: dto.providerKey ?? null,
        brandId: dto.brandId ?? null,
        contactEmail: dto.contactEmail ?? null,
        contactPhone: dto.contactPhone ?? null,
        notes: dto.notes ?? null,
        advertisingEnabled: dto.advertisingEnabled ?? false,
      },
      include: TENANT_INCLUDE,
    });
  }

  async updateTenant(tenantId: string, dto: UpdateTenantDto) {
    const tenant = await this.assertTenantExists(tenantId);
    if (dto.name && dto.name.trim() !== tenant.name) await this.assertTenantNameFree(dto.name, tenantId);
    if (dto.providerKey) {
      await this.assertProviderKeyFree(dto.providerKey, tenantId);
      this.assertProviderKeyMatchesType(tenant.type, dto.providerKey);
    }
    if (dto.brandId) {
      await this.assertBrandFree(dto.brandId, tenantId);
      this.assertBrandMatchesType(tenant.type, dto.brandId);
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.providerKey === undefined ? {} : { providerKey: dto.providerKey }),
        ...(dto.brandId === undefined ? {} : { brandId: dto.brandId }),
        ...(dto.contactEmail === undefined ? {} : { contactEmail: dto.contactEmail }),
        ...(dto.contactPhone === undefined ? {} : { contactPhone: dto.contactPhone }),
        ...(dto.notes === undefined ? {} : { notes: dto.notes }),
        ...(dto.advertisingEnabled === undefined ? {} : { advertisingEnabled: dto.advertisingEnabled }),
        ...(dto.active === undefined ? {} : { active: dto.active }),
      },
      include: TENANT_INCLUDE,
    });
  }

  async deleteTenant(tenantId: string) {
    await this.assertTenantExists(tenantId);
    const members = await this.prisma.tenantMembership.count({ where: { tenantId } });
    if (members > 0) {
      throw new BadRequestException("Quitá primero los usuarios de la organización");
    }
    await this.prisma.tenant.delete({ where: { id: tenantId } });
    return { id: tenantId };
  }

  // ---------- Membresías ----------

  async addMember(tenantId: string, dto: CreateMembershipDto) {
    const tenant = await this.assertTenantExists(tenantId);
    this.assertRoleAllowed(tenant.type, dto.role);

    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException("Usuario no encontrado");

    const existing = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: dto.userId } },
    });
    if (existing) throw new ConflictException("El usuario ya pertenece a esta organización");

    return this.prisma.tenantMembership.create({
      data: { tenantId, userId: dto.userId, role: dto.role, title: dto.title ?? null },
      include: MEMBERSHIP_INCLUDE,
    });
  }

  /** Crea el usuario y su membresía en una sola operación. */
  async createMemberUser(tenantId: string, dto: CreateTenantUserDto) {
    const tenant = await this.assertTenantExists(tenantId);
    this.assertRoleAllowed(tenant.type, dto.role);

    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email }] },
    });
    if (clash) {
      throw new ConflictException(
        clash.username === dto.username ? "El nombre de usuario ya está en uso" : "El email ya está registrado"
      );
    }

    const passwordHash = await argon2.hash(dto.password);
    // El rol de plataforma se deriva del tipo de organización: las marcas
    // acceden al módulo de Marcas, el resto entra como usuario común.
    const platformRole = tenant.type === "BRAND" ? UserRole.ROLE_BRAND : UserRole.ROLE_USER;

    const membership = await this.prisma.tenantMembership.create({
      data: {
        tenant: { connect: { id: tenantId } },
        role: dto.role,
        title: dto.title ?? null,
        user: {
          create: {
            username: dto.username,
            email: dto.email,
            passwordHash,
            role: platformRole,
            brandId: tenant.type === "BRAND" ? tenant.brandId : null,
          },
        },
      },
      include: MEMBERSHIP_INCLUDE,
    });
    return membership;
  }

  async updateMember(membershipId: string, dto: UpdateMembershipDto) {
    const membership = await this.prisma.tenantMembership.findUnique({
      where: { id: membershipId },
      include: { tenant: true },
    });
    if (!membership) throw new NotFoundException("Membresía no encontrada");
    if (dto.role) this.assertRoleAllowed(membership.tenant.type, dto.role);
    if (dto.role && dto.role !== "OWNER" && membership.role === "OWNER") {
      await this.assertNotLastOwner(membership.tenantId, membershipId);
    }
    if (dto.active === false && membership.role === "OWNER") {
      await this.assertNotLastOwner(membership.tenantId, membershipId);
    }

    return this.prisma.tenantMembership.update({
      where: { id: membershipId },
      data: {
        ...(dto.role === undefined ? {} : { role: dto.role }),
        ...(dto.title === undefined ? {} : { title: dto.title }),
        ...(dto.active === undefined ? {} : { active: dto.active }),
      },
      include: MEMBERSHIP_INCLUDE,
    });
  }

  async removeMember(membershipId: string) {
    const membership = await this.prisma.tenantMembership.findUnique({ where: { id: membershipId } });
    if (!membership) throw new NotFoundException("Membresía no encontrada");
    if (membership.role === "OWNER") await this.assertNotLastOwner(membership.tenantId, membershipId);

    await this.prisma.$transaction([
      this.prisma.productManagerScope.deleteMany({
        where: { tenantId: membership.tenantId, userId: membership.userId },
      }),
      this.prisma.tenantLink.updateMany({
        where: { supplierTenantId: membership.tenantId, accountManagerId: membership.userId },
        data: { accountManagerId: null },
      }),
      this.prisma.tenantMembership.delete({ where: { id: membershipId } }),
    ]);
    return { id: membershipId };
  }

  // ---------- Vínculos entre organizaciones ----------

  async upsertLink(dto: UpsertLinkDto) {
    const [client, supplier] = await Promise.all([
      this.assertTenantExists(dto.clientTenantId),
      this.assertTenantExists(dto.supplierTenantId),
    ]);
    if (client.id === supplier.id) throw new BadRequestException("Una organización no puede vincularse consigo misma");
    if (client.type !== "RETAILER") {
      throw new BadRequestException("El lado cliente del vínculo tiene que ser un comercio");
    }
    if (supplier.type === "RETAILER") {
      throw new BadRequestException("El lado proveedor tiene que ser un distribuidor o una marca");
    }
    if (dto.accountManagerId) {
      const isMember = await this.prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: supplier.id, userId: dto.accountManagerId } },
      });
      if (!isMember) throw new BadRequestException("El vendedor asignado no pertenece a esa organización");
    }

    const data = {
      accountManagerId: dto.accountManagerId ?? null,
      status: dto.status ?? "ACTIVE",
      discountPercent: dto.discountPercent ?? null,
      notes: dto.notes ?? null,
    };

    return this.prisma.tenantLink.upsert({
      where: {
        clientTenantId_supplierTenantId: {
          clientTenantId: dto.clientTenantId,
          supplierTenantId: dto.supplierTenantId,
        },
      },
      create: { clientTenantId: dto.clientTenantId, supplierTenantId: dto.supplierTenantId, ...data },
      update: data,
      include: {
        clientTenant: { select: { id: true, name: true, type: true } },
        supplierTenant: { select: { id: true, name: true, type: true } },
        accountManager: { select: { id: true, username: true, email: true } },
      },
    });
  }

  async deleteLink(linkId: string) {
    const link = await this.prisma.tenantLink.findUnique({ where: { id: linkId } });
    if (!link) throw new NotFoundException("Vínculo no encontrado");
    await this.prisma.tenantLink.delete({ where: { id: linkId } });
    return { id: linkId };
  }

  // ---------- Códigos de vinculación ----------

  async createAccessCode(tenantId: string, dto: CreateAccessCodeDto) {
    const tenant = await this.assertTenantExists(tenantId);
    if (tenant.type === "RETAILER") {
      throw new BadRequestException("Solo los distribuidores y las marcas generan códigos de vinculación");
    }
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    return this.prisma.tenantAccessCode.create({
      data: {
        tenantId,
        code: generateAccessCode(),
        label: dto.label ?? null,
        maxUses: dto.maxUses ?? 1,
        expiresAt,
      },
    });
  }

  async revokeAccessCode(codeId: string) {
    const code = await this.prisma.tenantAccessCode.findUnique({ where: { id: codeId } });
    if (!code) throw new NotFoundException("Código no encontrado");
    return this.prisma.tenantAccessCode.update({ where: { id: codeId }, data: { revoked: true } });
  }

  // ---------- Alcance del Product Manager ----------

  async setProductManagerScope(membershipId: string, dto: SetProductManagerScopeDto) {
    const membership = await this.prisma.tenantMembership.findUnique({
      where: { id: membershipId },
      include: { tenant: true },
    });
    if (!membership) throw new NotFoundException("Membresía no encontrada");
    if (membership.role !== "PRODUCT_MANAGER") {
      throw new BadRequestException("Solo un Product Manager tiene marcas asignadas");
    }

    const brandNames = Array.from(new Set(dto.brandNames.map((name) => name.trim()).filter(Boolean)));
    await this.prisma.$transaction([
      this.prisma.productManagerScope.deleteMany({
        where: { tenantId: membership.tenantId, userId: membership.userId },
      }),
      this.prisma.productManagerScope.createMany({
        data: brandNames.map((brandName) => ({
          tenantId: membership.tenantId,
          userId: membership.userId,
          brandName,
        })),
      }),
    ]);
    return { membershipId, brandNames };
  }

  // ---------- Helpers ----------

  /**
   * `tenantRole` es el alcance funcional dentro de la organización y
   * `platformRole` el nivel de acceso a Nodo: son cosas distintas y la interfaz
   * las muestra por separado.
   */
  private serializeMember(membership: {
    id: string;
    role: string;
    title: string | null;
    active: boolean;
    user: { id: string; username: string; email: string; role: string; active: boolean; endDate: Date | null };
  }) {
    return {
      membershipId: membership.id,
      tenantRole: membership.role,
      title: membership.title,
      membershipActive: membership.active,
      userId: membership.user.id,
      username: membership.user.username,
      email: membership.user.email,
      platformRole: membership.user.role,
      active: membership.user.active,
      endDate: membership.user.endDate,
    };
  }

  private serializeLink(
    link: {
      id: string;
      status: string;
      discountPercent: Prisma.Decimal | null;
      notes: string | null;
      clientTenant?: { id: string; name: string; type: string };
      supplierTenant?: { id: string; name: string; type: string };
      accountManager: { id: string; username: string; email: string } | null;
    },
    side: "supplier" | "client"
  ) {
    return {
      linkId: link.id,
      status: link.status,
      discountPercent: link.discountPercent,
      notes: link.notes,
      accountManager: link.accountManager,
      tenant: side === "supplier" ? link.supplierTenant : link.clientTenant,
    };
  }

  private async assertTenantExists(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Organización no encontrada");
    return tenant;
  }

  private async assertTenantNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.tenant.findFirst({
      where: { name: name.trim(), ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (clash) throw new ConflictException("Ya existe una organización con ese nombre");
  }

  private async assertProviderKeyFree(providerKey: string, exceptId?: string) {
    const clash = await this.prisma.tenant.findFirst({
      where: { providerKey, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (clash) throw new ConflictException(`El proveedor ya está asignado a ${clash.name}`);
  }

  private async assertBrandFree(brandId: string, exceptId?: string) {
    const brand = await this.prisma.brandAccount.findUnique({ where: { id: brandId } });
    if (!brand) throw new NotFoundException("Marca no encontrada");
    const clash = await this.prisma.tenant.findFirst({
      where: { brandId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (clash) throw new ConflictException(`La marca ya está asignada a ${clash.name}`);
  }

  private assertProviderKeyMatchesType(type: TenantType, providerKey?: string | null) {
    if (providerKey && type !== "DISTRIBUTOR") {
      throw new BadRequestException("Solo un distribuidor puede tener un proveedor del catálogo asignado");
    }
  }

  private assertBrandMatchesType(type: TenantType, brandId?: string | null) {
    if (brandId && type !== "BRAND") {
      throw new BadRequestException("Solo una organización de tipo marca puede tener una marca asignada");
    }
  }

  private assertRoleAllowed(type: TenantType, role: TenantRole) {
    if (!TENANT_ROLES_BY_TYPE[type].includes(role)) {
      throw new BadRequestException("Ese rol no aplica al tipo de organización");
    }
  }

  private async assertNotLastOwner(tenantId: string, exceptMembershipId: string) {
    const others = await this.prisma.tenantMembership.count({
      where: { tenantId, role: "OWNER", active: true, id: { not: exceptMembershipId } },
    });
    if (others === 0) {
      throw new BadRequestException("La organización tiene que conservar al menos un dueño activo");
    }
  }
}
