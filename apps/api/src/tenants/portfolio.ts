import { TENANT_ROLES_CAN_MANAGE_PORTFOLIO, type PermissionKey, type TenantRole } from "@nodo/shared";

/** Un comercio activo sin pedido en 30 días se marca inactivo en la cartera. */
export const CLIENT_INACTIVE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Quien no tiene "Ver toda la cartera" solo ve las cuentas que le asignaron.
 * Por defecto es el caso del vendedor; el dueño puede cambiarlo. Sin permisos
 * resueltos (usos puros) decide el rol.
 */
export function clientLinkVisibleTo(
  link: { accountManagerId: string | null },
  actor: { tenantRole: TenantRole; userId: string; permissions?: readonly PermissionKey[] }
): boolean {
  const seesAll = actor.permissions
    ? actor.permissions.includes("portfolio.view_all")
    : actor.tenantRole !== "SELLER";
  return seesAll || link.accountManagerId === actor.userId;
}

export function canEditClientTerms(role: TenantRole): boolean {
  return role === "SELLER" || TENANT_ROLES_CAN_MANAGE_PORTFOLIO.includes(role);
}

export function normalizeBrandName(name: string): string {
  return name.trim().toLowerCase();
}

export function clientIsInactive(
  status: string,
  lastOrderAt: Date | string | null | undefined,
  now = new Date()
): boolean {
  if (status !== "ACTIVE") return false;
  if (!lastOrderAt) return true;
  const at = typeof lastOrderAt === "string" ? new Date(lastOrderAt) : lastOrderAt;
  return now.getTime() - at.getTime() > CLIENT_INACTIVE_AFTER_MS;
}

export function orderItemsMatchBrands(items: unknown, brandNames: string[]): boolean {
  if (brandNames.length === 0) return false;
  const wanted = new Set(brandNames.map(normalizeBrandName).filter(Boolean));
  if (wanted.size === 0) return false;
  const list = Array.isArray(items) ? items : [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const brand = item.brand ?? item.displayBrand;
    if (typeof brand === "string" && wanted.has(normalizeBrandName(brand))) return true;
  }
  return false;
}

export function orderSkuKeys(order: { tenantId: string; provider: string; items: unknown }): string[] {
  const items = Array.isArray(order.items) ? order.items : [];
  const keys: string[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const sku = String(item.externalId ?? item.code ?? "").trim();
    if (sku) keys.push(`${order.tenantId}:${order.provider}:${sku}`);
  }
  return keys;
}

export function orderMatchesPmScope(
  order: { tenantId: string; provider: string; items: unknown },
  brandNames: string[],
  allowedSkuKeys: Set<string>
): boolean {
  if (orderItemsMatchBrands(order.items, brandNames)) return true;
  return orderSkuKeys(order).some((key) => allowedSkuKeys.has(key));
}
