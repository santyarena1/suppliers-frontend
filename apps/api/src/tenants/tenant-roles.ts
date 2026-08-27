import { ForbiddenException } from "@nestjs/common";
import { TENANT_ROLE_LABELS, type TenantRole, type TenantType } from "@nodo/shared";
import type { TenantContext } from "./tenant-context.service";

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
