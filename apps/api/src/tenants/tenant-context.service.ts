import { ForbiddenException, Injectable } from "@nestjs/common";
import type { JwtPayload, TenantRole, TenantType } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";

export interface TenantContext {
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  tenantRole: TenantRole;
  userId: string;
}

/**
 * Resuelve a qué organización pertenece una persona.
 *
 * Es la única fuente de verdad del alcance de negocio: el `role` del `User` es solo
 * el nivel de plataforma. El superadmin no pertenece a ninguna organización a
 * propósito, así que para él siempre devuelve `null`.
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
      include: { tenant: { select: { id: true, name: true, type: true } } },
    });
    if (!membership) return null;

    return {
      tenantId: membership.tenant.id,
      tenantName: membership.tenant.name,
      tenantType: membership.tenant.type as TenantType,
      tenantRole: membership.role as TenantRole,
      userId: membership.userId,
    };
  }

  /**
   * La organización de la sesión en curso.
   *
   * Prefiere lo que trae el token, pero cae a la base si no está: las sesiones
   * emitidas antes de que el token llevara organización siguen siendo válidas hasta
   * que vencen, y no queremos que a esa gente le falle todo mientras tanto.
   */
  async fromSession(user: JwtPayload): Promise<TenantContext | null> {
    if (user.tenantId && user.tenantName && user.tenantType && user.tenantRole) {
      return {
        tenantId: user.tenantId,
        tenantName: user.tenantName,
        tenantType: user.tenantType,
        tenantRole: user.tenantRole,
        userId: user.userId,
      };
    }
    return this.forUser(user.userId);
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
}
