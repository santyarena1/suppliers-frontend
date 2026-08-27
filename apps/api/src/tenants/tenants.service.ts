import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { Prisma, UserRole } from "@prisma/client";
import {
  TENANT_ROLES_BY_TYPE,
  TENANT_ROLES_CAN_MANAGE_PORTFOLIO,
  TENANT_ROLES_CAN_MANAGE_TEAM,
  type TenantRole,
  type TenantType,
} from "@nodo/shared";
import { generatePassword } from "../common/generate-password";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateAccessCodeDto,
  CreateMembershipDto,
  CreateOwnMemberDto,
  CreateTenantDto,
  SetProductManagerScopeDto,
  UpdateMembershipDto,
  UpdateOwnOrgDto,
  UpdateTenantDto,
  UpsertLinkDto,
} from "./dto/tenant.dto";
import type { TenantContext } from "./tenant-context.service";

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

/** El código se dicta por teléfono o se copia de un papel: llega como llega. */
function normalizeAccessCode(raw: string): string {
  const limpio = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return [limpio.slice(0, 4), limpio.slice(4, 8), limpio.slice(8, 12)].filter(Boolean).join("-");
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
      mirrorsCommercialFromId: tenant.mirrorsCommercialFromId,
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

    if (dto.mirrorsCommercialFromId === tenantId) {
      throw new BadRequestException("Una organización no puede espejar su propio catálogo");
    }
    if (dto.mirrorsCommercialFromId) await this.assertTenantExists(dto.mirrorsCommercialFromId);

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
        ...(dto.mirrorsCommercialFromId === undefined ? {} : { mirrorsCommercialFromId: dto.mirrorsCommercialFromId }),
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
  async createMemberUser(
    tenantId: string,
    dto: { username: string; email: string; password: string; role: TenantRole; title?: string }
  ) {
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

  /**
   * Canjea un código y deja vinculado al comercio con quien lo emitió.
   *
   * Es la única puerta de entrada a un proveedor que el comercio no conocía. Por eso
   * el código no dice nada hasta que se canjea: todos los rechazos responden lo mismo,
   * así nadie puede probar códigos al voleo para averiguar qué organizaciones existen.
   * Recién cuando el canje sale bien se revela el nombre.
   */
  async redeemAccessCode(client: TenantContext, userId: string, rawCode: string) {
    const invalido = new BadRequestException("El código no es válido o ya se usó");
    const code = await this.prisma.tenantAccessCode.findUnique({
      where: { code: normalizeAccessCode(rawCode) },
      include: { tenant: true },
    });

    if (!code) throw invalido;
    if (code.revoked) throw invalido;
    if (code.expiresAt && code.expiresAt.getTime() < Date.now()) throw invalido;
    if (code.usedCount >= code.maxUses) throw invalido;
    if (!code.tenant.active) throw invalido;
    if (code.tenantId === client.tenantId) throw invalido;
    if (client.tenantType !== "RETAILER") throw invalido;

    const [link] = await this.prisma.$transaction([
      this.prisma.tenantLink.upsert({
        where: {
          clientTenantId_supplierTenantId: {
            clientTenantId: client.tenantId,
            supplierTenantId: code.tenantId,
          },
        },
        create: {
          clientTenantId: client.tenantId,
          supplierTenantId: code.tenantId,
          status: "ACTIVE",
        },
        update: { status: "ACTIVE" },
      }),
      this.prisma.tenantAccessCode.update({
        where: { id: code.id },
        data: { usedCount: { increment: 1 } },
      }),
      this.prisma.tenantAccessCodeRedemption.create({
        data: {
          accessCodeId: code.id,
          redeemedByUserId: userId,
          redeemedByTenantId: client.tenantId,
        },
      }),
    ]);

    return {
      linkId: link.id,
      tenantName: code.tenant.name,
      tenantType: code.tenant.type,
      provider: code.tenant.providerKey,
    };
  }

  // ---------- Lo que la organización hace sobre sí misma ----------

  async getOwnOrg(tenant: TenantContext) {
    const row = await this.assertTenantExists(tenant.tenantId);
    const canManageTeam = TENANT_ROLES_CAN_MANAGE_TEAM.includes(tenant.tenantRole);
    const canManagePortfolio = TENANT_ROLES_CAN_MANAGE_PORTFOLIO.includes(tenant.tenantRole);
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      advertisingEnabled: row.advertisingEnabled,
      providerKey: row.providerKey,
      tenantRole: tenant.tenantRole,
      canManageTeam,
      canManagePortfolio,
    };
  }

  async updateOwnOrg(tenant: TenantContext, dto: UpdateOwnOrgDto) {
    if (!TENANT_ROLES_CAN_MANAGE_TEAM.includes(tenant.tenantRole)) {
      throw new BadRequestException("Solo el dueño o un administrador pueden editar la organización");
    }
    const row = await this.prisma.tenant.update({
      where: { id: tenant.tenantId },
      data: {
        ...(dto.contactEmail === undefined ? {} : { contactEmail: dto.contactEmail }),
        ...(dto.contactPhone === undefined ? {} : { contactPhone: dto.contactPhone }),
      },
    });
    return this.getOwnOrg({ ...tenant, tenantName: row.name });
  }

  async listOwnTeam(tenant: TenantContext) {
    const members = await this.prisma.tenantMembership.findMany({
      where: { tenantId: tenant.tenantId },
      include: MEMBERSHIP_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    const scopes = await this.prisma.productManagerScope.findMany({
      where: { tenantId: tenant.tenantId },
    });
    return {
      canManage: TENANT_ROLES_CAN_MANAGE_TEAM.includes(tenant.tenantRole),
      members: members.map((membership) => ({
        ...this.serializeMember(membership),
        managedBrands: scopes.filter((scope) => scope.userId === membership.userId).map((scope) => scope.brandName),
      })),
    };
  }

  async createOwnMember(tenant: TenantContext, dto: CreateOwnMemberDto) {
    this.assertCanManageTeam(tenant);
    this.assertRoleAllowed(tenant.tenantType, dto.role);
    if (tenant.tenantRole !== "OWNER" && dto.role === "OWNER") {
      throw new BadRequestException("Solo el dueño puede agregar a otro dueño");
    }
    const generated = dto.password ? null : generatePassword();
    const membership = await this.createMemberUser(tenant.tenantId, {
      username: dto.username,
      email: dto.email,
      password: dto.password ?? generated!,
      role: dto.role,
      title: dto.title,
    });
    return {
      ...this.serializeMember(membership),
      managedBrands: [] as string[],
      ...(generated ? { generatedPassword: generated } : {}),
    };
  }

  async updateOwnMember(tenant: TenantContext, membershipId: string, dto: UpdateMembershipDto) {
    this.assertCanManageTeam(tenant);
    const membership = await this.assertMembershipInTenant(membershipId, tenant.tenantId);
    if (tenant.tenantRole !== "OWNER" && (membership.role === "OWNER" || dto.role === "OWNER")) {
      throw new BadRequestException("Solo el dueño puede cambiar el rol de otro dueño");
    }
    const updated = await this.updateMember(membershipId, dto);
    return this.serializeMember(updated);
  }

  async removeOwnMember(tenant: TenantContext, membershipId: string) {
    this.assertCanManageTeam(tenant);
    const membership = await this.assertMembershipInTenant(membershipId, tenant.tenantId);
    if (tenant.tenantRole !== "OWNER" && membership.role === "OWNER") {
      throw new BadRequestException("Solo el dueño puede quitar a otro dueño");
    }
    if (membership.userId === tenant.userId) {
      throw new BadRequestException("No podés quitarte a vos mismo");
    }
    return this.removeMember(membershipId);
  }

  async resetOwnMemberPassword(tenant: TenantContext, membershipId: string) {
    this.assertCanManageTeam(tenant);
    const membership = await this.assertMembershipInTenant(membershipId, tenant.tenantId);
    if (tenant.tenantRole !== "OWNER" && membership.role === "OWNER") {
      throw new BadRequestException("Solo el dueño puede resetear la clave de otro dueño");
    }
    const password = generatePassword();
    await this.prisma.user.update({
      where: { id: membership.userId },
      data: { passwordHash: await argon2.hash(password) },
    });
    return { membershipId, generatedPassword: password };
  }

  async setOwnProductManagerScope(tenant: TenantContext, membershipId: string, dto: SetProductManagerScopeDto) {
    this.assertCanManageTeam(tenant);
    await this.assertMembershipInTenant(membershipId, tenant.tenantId);
    return this.setProductManagerScope(membershipId, dto);
  }

  async listOwnAccessCodes(tenant: TenantContext) {
    this.assertCanIssueCodes(tenant, { mutate: false });
    const codes = await this.prisma.tenantAccessCode.findMany({
      where: { tenantId: tenant.tenantId },
      orderBy: { createdAt: "desc" },
    });
    return {
      canManage: TENANT_ROLES_CAN_MANAGE_PORTFOLIO.includes(tenant.tenantRole),
      codes,
    };
  }

  async createOwnAccessCode(tenant: TenantContext, dto: CreateAccessCodeDto) {
    this.assertCanIssueCodes(tenant, { mutate: true });
    return this.createAccessCode(tenant.tenantId, dto);
  }

  async revokeOwnAccessCode(tenant: TenantContext, codeId: string) {
    this.assertCanIssueCodes(tenant, { mutate: true });
    const code = await this.prisma.tenantAccessCode.findUnique({ where: { id: codeId } });
    if (!code || code.tenantId !== tenant.tenantId) {
      throw new NotFoundException("Código no encontrado");
    }
    return this.revokeAccessCode(codeId);
  }

  private assertCanIssueCodes(tenant: TenantContext, _opts: { mutate: boolean }) {
    if (tenant.tenantType === "RETAILER") {
      throw new ForbiddenException("Los códigos de vinculación son del distribuidor o la marca");
    }
    if (!TENANT_ROLES_CAN_MANAGE_PORTFOLIO.includes(tenant.tenantRole)) {
      throw new ForbiddenException("Solo el dueño o un administrador gestionan los códigos");
    }
  }

  private assertCanManageTeam(tenant: TenantContext) {
    if (!TENANT_ROLES_CAN_MANAGE_TEAM.includes(tenant.tenantRole)) {
      throw new ForbiddenException("Solo el dueño o un administrador gestionan el equipo");
    }
  }

  private async assertMembershipInTenant(membershipId: string, tenantId: string) {
    const membership = await this.prisma.tenantMembership.findUnique({ where: { id: membershipId } });
    if (!membership || membership.tenantId !== tenantId) {
      throw new NotFoundException("Membresía no encontrada");
    }
    return membership;
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
