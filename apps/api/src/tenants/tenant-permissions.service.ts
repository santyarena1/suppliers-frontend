import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  PERMISSION_GROUP_LABELS,
  TENANT_ROLES_BY_TYPE,
  defaultAllows,
  isPermissionKey,
  permissionsForType,
  resolvePermissions,
  type PermissionKey,
  type PermissionOverrides,
  type TenantRole,
  type TenantType,
} from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { toOverrides } from "./tenant-context.service";

/** `true`/`false` fija el valor; `null` vuelve a heredar. */
export type PermissionChanges = Partial<Record<PermissionKey, boolean | null>>;

type RoleMap = Partial<Record<TenantRole, PermissionOverrides>>;

/**
 * Permisos configurables de una organización: el dueño ajusta por rol y por
 * persona. Solo se guardan las diferencias con el valor heredado, así cambiar
 * un defecto en el código llega a todos los que no lo tocaron.
 */
@Injectable()
export class TenantPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async matrix(tenantId: string) {
    const type = await this.typeOf(tenantId);
    const roles = TENANT_ROLES_BY_TYPE[type];
    const permissions = permissionsForType(type);
    const [roleRows, members] = await Promise.all([
      this.prisma.tenantRolePermission.findMany({ where: { tenantId } }),
      this.prisma.tenantMembership.findMany({
        where: { tenantId, active: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          title: true,
          user: { select: { id: true, username: true, email: true } },
          permissionOverrides: { select: { permission: true, allowed: true } },
        },
      }),
    ]);

    const defaults: RoleMap = {};
    const roleOverrides: RoleMap = {};
    for (const role of roles) {
      defaults[role] = Object.fromEntries(permissions.map((p) => [p.key, defaultAllows(type, role, p.key)]));
      roleOverrides[role] = toOverrides(roleRows.filter((row) => row.role === role));
    }

    return {
      type,
      roles,
      groups: PERMISSION_GROUP_LABELS,
      permissions,
      defaults,
      roleOverrides,
      members: members.map((member) => {
        const role = member.role as TenantRole;
        const overrides = toOverrides(member.permissionOverrides);
        return {
          membershipId: member.id,
          userId: member.user.id,
          username: member.user.username,
          email: member.user.email,
          title: member.title,
          role,
          overrides,
          effective: resolvePermissions({ type, role, roleOverrides: roleOverrides[role], memberOverrides: overrides }),
        };
      }),
    };
  }

  async setRole(tenantId: string, role: TenantRole, changes: PermissionChanges) {
    const type = await this.typeOf(tenantId);
    if (role === "OWNER") throw new BadRequestException("El dueño siempre tiene todos los permisos");
    if (!TENANT_ROLES_BY_TYPE[type].includes(role)) {
      throw new BadRequestException("Ese rol no existe en este tipo de organización");
    }
    const entries = this.validChanges(type, changes);
    await this.prisma.$transaction(async (tx) => {
      for (const [permission, value] of entries) {
        const where = { tenantId, role, permission };
        // Igual al defecto = no es una excepción: se borra.
        if (value === null || value === defaultAllows(type, role, permission)) {
          await tx.tenantRolePermission.deleteMany({ where });
        } else {
          await tx.tenantRolePermission.upsert({
            where: { tenantId_role_permission: where },
            create: { ...where, allowed: value },
            update: { allowed: value },
          });
        }
      }
    });
    return this.matrix(tenantId);
  }

  async setMember(tenantId: string, membershipId: string, changes: PermissionChanges) {
    const type = await this.typeOf(tenantId);
    const membership = await this.prisma.tenantMembership.findUnique({ where: { id: membershipId } });
    if (!membership || membership.tenantId !== tenantId) throw new NotFoundException("Miembro no encontrado");
    if (membership.role === "OWNER") throw new BadRequestException("El dueño siempre tiene todos los permisos");
    const entries = this.validChanges(type, changes);
    await this.prisma.$transaction(async (tx) => {
      for (const [permission, value] of entries) {
        if (value === null) {
          await tx.tenantMemberPermission.deleteMany({ where: { membershipId, permission } });
        } else {
          await tx.tenantMemberPermission.upsert({
            where: { membershipId_permission: { membershipId, permission } },
            create: { membershipId, permission, allowed: value },
            update: { allowed: value },
          });
        }
      }
    });
    return this.matrix(tenantId);
  }

  private validChanges(type: TenantType, changes: PermissionChanges): [PermissionKey, boolean | null][] {
    const applicable = new Set(permissionsForType(type).map((p) => p.key));
    const entries = Object.entries(changes ?? {});
    for (const [key, value] of entries) {
      if (!isPermissionKey(key) || !applicable.has(key)) {
        throw new BadRequestException(`Permiso inválido para esta organización: ${key}`);
      }
      if (value !== null && typeof value !== "boolean") {
        throw new BadRequestException(`Valor inválido para ${key}`);
      }
    }
    return entries as [PermissionKey, boolean | null][];
  }

  private async typeOf(tenantId: string): Promise<TenantType> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, type: true } });
    if (!tenant) throw new NotFoundException("Organización no encontrada");
    return tenant.type as TenantType;
  }
}
