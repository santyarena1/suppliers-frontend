import { ForbiddenException, Injectable } from "@nestjs/common";
import type { JwtPayload, TenantRole, TenantType } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";

export interface TenantContext {
  userId: string;
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  tenantRole: TenantRole;
  /**
   * Organización de la que se leen credenciales, vínculos y catálogo.
   * Distinta de `tenantId` cuando esta org espeja a otra (el superadmin de
   * prueba: carrito propio, mismas cuentas que testuser1).
   */
  commercialTenantId: string;
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
      },
    });
    if (!membership) return null;

    return {
      userId,
      tenantId: membership.tenant.id,
      tenantName: membership.tenant.name,
      tenantType: membership.tenant.type as TenantType,
      tenantRole: membership.role as TenantRole,
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
    if (user.tenantId && user.tenantName && user.tenantType && user.tenantRole) {
      return {
        userId: user.userId,
        tenantId: user.tenantId,
        tenantName: user.tenantName,
        tenantType: user.tenantType,
        tenantRole: user.tenantRole,
        commercialTenantId: user.commercialTenantId ?? user.tenantId,
      };
    }
    return null;
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
