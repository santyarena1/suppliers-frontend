import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  isPermissionKey,
  resolveEntitlements,
  resolvePermissions,
  type JwtPayload,
  type PermissionKey,
  type PermissionOverrides,
  type SubscriptionDates,
  type SubscriptionStatus,
  type TenantEntitlements,
  type TenantPlan,
  type TenantRole,
  type TenantType,
} from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";

/** Columnas de la suscripción que hacen falta para saber qué puede hacer la org. */
export const SUBSCRIPTION_DATES_SELECT = {
  status: true,
  currentPeriodEnd: true,
  nextBillingAt: true,
  gracePeriodEnd: true,
  trialEndsAt: true,
  courtesyUntil: true,
  suspensionReason: true,
  setupFeeStatus: true,
  setupFeeBlocksCustom: true,
} as const;

type SubscriptionDatesRow = {
  status: string;
  currentPeriodEnd: Date | null;
  nextBillingAt: Date | null;
  gracePeriodEnd: Date | null;
  trialEndsAt: Date | null;
  courtesyUntil: Date | null;
  suspensionReason: string | null;
  setupFeeStatus: string;
  setupFeeBlocksCustom: boolean;
};

export function toSubscriptionDates(row: SubscriptionDatesRow | null | undefined): SubscriptionDates | null {
  if (!row) return null;
  return {
    ...row,
    status: row.status as SubscriptionStatus,
    setupFeeStatus: row.setupFeeStatus as SubscriptionDates["setupFeeStatus"],
  };
}

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
  /**
   * Plan y suscripción de la organización (no de la persona). Ausente solo en
   * contextos armados a mano (tests): se toma como sin restricciones.
   */
  entitlements?: TenantEntitlements;
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
        tenant: {
          select: {
            id: true,
            name: true,
            type: true,
            mirrorsCommercialFromId: true,
            plan: true,
            subscription: { select: SUBSCRIPTION_DATES_SELECT },
          },
        },
        user: { select: { role: true } },
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
      // El superadmin opera sin topes en su sesión. Al entrar como otro usuario el
      // token es de ese usuario, así que ve y sufre las restricciones de su plan.
      entitlements: resolveEntitlements({
        tenantType,
        plan: (membership.tenant.plan ?? "PRO") as TenantPlan,
        subscription: toSubscriptionDates(membership.tenant.subscription),
        platformAdmin: membership.user?.role === "ROLE_ADMIN",
      }),
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
      this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { active: true, plan: true, subscription: { select: SUBSCRIPTION_DATES_SELECT } },
      }),
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
      entitlements: resolveEntitlements({
        tenantType: user.tenantType,
        plan: (tenantRow.plan ?? "PRO") as TenantPlan,
        subscription: toSubscriptionDates(tenantRow.subscription),
        platformAdmin: user.role === "ROLE_ADMIN" && !user.impersonatedBy,
      }),
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
