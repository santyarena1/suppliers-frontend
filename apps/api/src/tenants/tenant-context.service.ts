import { ForbiddenException, Injectable } from "@nestjs/common";
import type { JwtPayload, TenantRole, TenantType } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";

export interface TenantContext {
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  tenantRole: TenantRole;
  userId: string;
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
      // Una persona pertenece a una sola organización; si por algún arrastre
      // hubiera más de una, elegir siempre la misma evita que el alcance de un
      // usuario cambie entre pedidos.
      orderBy: { createdAt: "asc" },
      include: {
        tenant: { select: { id: true, name: true, type: true, mirrorsCommercialFromId: true } },
      },
    });
    if (!membership) return null;

    return this.toContext(membership);
  }

  /**
   * La organización de la sesión en curso.
   *
   * La membresía de la base gana: si se movió al superadmin de un comercio a
   * otro, un token viejo no lo deja operando el carrito ajeno. Si todavía no
   * hay membresía, se usa lo que traiga el token.
   */
  async fromSession(user: JwtPayload): Promise<TenantContext | null> {
    const fromDb = await this.forUser(user.userId);
    if (fromDb) return fromDb;
    if (user.tenantId && user.tenantName && user.tenantType && user.tenantRole) {
      return {
        tenantId: user.tenantId,
        tenantName: user.tenantName,
        tenantType: user.tenantType,
        tenantRole: user.tenantRole,
        userId: user.userId,
        commercialTenantId: user.commercialTenantId ?? user.tenantId,
      };
    }
    return null;
  }

  /** Igual que `fromSession`, pero falla si no hay organización. */
  async requireFromSession(user: JwtPayload): Promise<TenantContext> {
    const context = await this.fromSession(user);
    if (!context) {
      throw new ForbiddenException(
        "Tu usuario no pertenece a ninguna organización. Pedile a un administrador que te asigne una."
      );
    }
    return context;
  }

  private toContext(membership: {
    role: string;
    userId: string;
    tenant: { id: string; name: string; type: string; mirrorsCommercialFromId: string | null };
  }): TenantContext {
    return {
      tenantId: membership.tenant.id,
      tenantName: membership.tenant.name,
      tenantType: membership.tenant.type as TenantType,
      tenantRole: membership.role as TenantRole,
      userId: membership.userId,
      commercialTenantId: membership.tenant.mirrorsCommercialFromId ?? membership.tenant.id,
    };
  }
}
