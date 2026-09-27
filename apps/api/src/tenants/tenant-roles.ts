import { ForbiddenException } from "@nestjs/common";
import { PERMISSIONS, TENANT_ROLE_LABELS, type PermissionKey, type TenantRole, type TenantType } from "@nodo/shared";
import type { TenantContext } from "./tenant-context.service";

export function hasPermission(tenant: Pick<TenantContext, "permissions">, key: PermissionKey): boolean {
  return tenant.permissions.includes(key);
}

/**
 * Corta si la persona no tiene el permiso dentro de su organización. Los
 * permisos salen de su rol más las excepciones que cargó el dueño.
 */
export function assertPermission(tenant: Pick<TenantContext, "permissions" | "tenantName">, key: PermissionKey) {
  if (hasPermission(tenant, key)) return;
  const label = PERMISSIONS.find((permission) => permission.key === key)?.label ?? key;
  throw new ForbiddenException(`No tenés permiso para “${label}” en ${tenant.tenantName}. Pedíselo al dueño.`);
}

/**
 * Corta si quien hace el pedido no tiene el rol necesario dentro de su organización.
 *
 * El rol de plataforma (`ROLE_USER`, `ROLE_ADMIN`) dice qué es la persona para NODO;
 * este dice qué puede hacer adentro de su comercio. Un vendedor y su dueño son los
 * dos `ROLE_USER`, y sin embargo uno no debería poder vaciar el catálogo del otro.
 */
export function assertTenantRole(tenant: TenantContext, allowed: readonly TenantRole[]) {
  if (allowed.includes(tenant.tenantRole)) return;
  const necesarios = allowed.map((role) => TENANT_ROLE_LABELS[role] ?? role).join(" o ");
  throw new ForbiddenException(`Esta acción es solo para ${necesarios} de ${tenant.tenantName}`);
}

export function assertTenantType(tenant: TenantContext, allowed: readonly TenantType[]) {
  if (allowed.includes(tenant.tenantType)) return;
  throw new ForbiddenException("Esta acción no aplica a tu tipo de organización");
}
