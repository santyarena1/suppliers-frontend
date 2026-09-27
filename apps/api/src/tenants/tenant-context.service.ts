import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  isPermissionKey,
  resolvePermissions,
  type JwtPayload,
  type PermissionKey,
  type PermissionOverrides,
  type TenantRole,
  type TenantType,
} from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";

export interface TenantContext {
  userId: string;
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  tenantRole: TenantRole;
  /** `null` solo en el respaldo desde el JWT (sin membresía en la base). */
  membershipId: string | null;
  /** Permisos efectivos: defecto del rol + excepciones del rol y de la persona. */
  permissions: PermissionKey[];
  /**
   * Organización de la que se leen credenciales, vínculos y catálogo.
   * Distinta de `tenantId` cuando esta org espeja a otra (el superadmin de
   * prueba: carrito propio, mismas cuentas que testuser1).
   */
  commercialTenantId: string;
}

/** Filas de excepción → mapa; descarta claves que ya no están en el catálogo. */
export function toOverrides(rows: { permission: string; allowed: boolean }[]): PermissionOverrides {
  const overrides: PermissionOverrides = {};
  for (const row of rows) {
    if (isPermissionKey(row.permission)) overrides[row.permission] = row.allowed;
  }
  return overrides;
}

/** Credenciales, vínculos y catálogo. Carrito y pedidos siguen en `tenantId`. */
export function commercialId(tenant: TenantContext): string {
  return tenant.commercialTenantId;
}

/**
 * Resuelve a qué organización pertenece una persona.
 *
 * Es la única fuente de verdad del alcance de negocio: el `role` del `User` es solo
 * el nivel de plataforma. El superadmin de prueba tiene membresía en Administración
 * y espeja el Comercio de Pruebas para credenciales y vínculos. Sin membresía,
 * devuelve `null` y el árbol sigue andando.
 */
@Injectable()
export class TenantContextService {
  constructor(private readonly prisma: PrismaService) {}

  /** Busca la membresía activa de un usuario. `null` si no tiene ninguna. */
  async forUser(userId: string): Promise<TenantContext | null> {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId, active: true, tenant: { active: true } },
      orderBy: { createdAt: "asc" },
      include: {
        tenant: { select: { id: true, name: true, type: true, mirrorsCommercialFromId: true } },
        permissionOverrides: { select: { permission: true, allowed: true } },
      },
    });
    if (!membership) return null;

    const tenantType = membership.tenant.type as TenantType;
    const tenantRole = membership.role as TenantRole;
    const roleOverrides =
      tenantRole === "OWNER"
        ? []
        : await this.prisma.tenantRolePermission.findMany({
            where: { tenantId: membership.tenant.id, role: tenantRole },
            select: { permission: true, allowed: true },
          });

    return {
      userId,
      tenantId: membership.tenant.id,
      tenantName: membership.tenant.name,
      tenantType,
      tenantRole,
      membershipId: membership.id,
      permissions: resolvePermissions({
        type: tenantType,
        role: tenantRole,
        roleOverrides: toOverrides(roleOverrides),
        memberOverrides: toOverrides(membership.permissionOverrides),
      }),
      commercialTenantId: membership.tenant.mirrorsCommercialFromId ?? membership.tenant.id,
    };
  }

  /**
   * La organización de la sesión en curso.
   *
   * La membresía de la base gana: si se movió al superadmin de un comercio a
   * otro, un token viejo no lo deja operando el carrito ajeno.
   */
  async fromSession(user: JwtPayload): Promise<TenantContext | null> {
    const fromDb = await this.forUser(user.userId);
    if (fromDb) return fromDb;
    if (!(user.tenantId && user.tenantName && user.tenantType && user.tenantRole)) return null;

    // Respaldo para tokens de antes de las membresías. No revive a quien sacaron
    // de la organización ni a una organización desactivada.
    const [stale, tenantRow] = await Promise.all([
      this.prisma.tenantMembership.findFirst({ where: { userId: user.userId, tenantId: user.tenantId }, select: { id: true } }),
      this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { active: true } }),
    ]);
    if (stale || !tenantRow?.active) return null;

    const roleOverrides =
      user.tenantRole === "OWNER"
        ? []
        : await this.prisma.tenantRolePermission.findMany({
            where: { tenantId: user.tenantId, role: user.tenantRole },
            select: { permission: true, allowed: true },
          });
    return {
      userId: user.userId,
      tenantId: user.tenantId,
      tenantName: user.tenantName,
      tenantType: user.tenantType,
      tenantRole: user.tenantRole,
      membershipId: null,
      permissions: resolvePermissions({
        type: user.tenantType,
        role: user.tenantRole,
        roleOverrides: toOverrides(roleOverrides),
      }),
      commercialTenantId: user.commercialTenantId ?? user.tenantId,
    };
  }

  async requireFromSession(user: JwtPayload): Promise<TenantContext> {
    const context = await this.fromSession(user);
    if (!context) {
      throw new ForbiddenException(
        "Tu usuario no pertenece a ninguna organización. Pedile a un administrador que te asigne una."
      );
    }
    return context;
  }
}
