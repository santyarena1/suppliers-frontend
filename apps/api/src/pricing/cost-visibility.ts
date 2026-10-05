import { ForbiddenException, SetMetadata } from "@nestjs/common";
import type { PlanCapabilityKey } from "@nodo/shared";
import type { TenantContext } from "../tenants/tenant-context.service";

/**
 * Modo vendedor (docs/PLAN_MODO_VENDEDOR.md §3): quién ve costos.
 *
 * Solo aplica a comercios con la capacidad `sellerMode` en su plan (Pro y
 * Custom). Ahí, quien no tiene el permiso `prices.viewCost` (por defecto el
 * rol Vendedor) ve precios de venta y no puede entrar a nada que opere con
 * costos: compra, cuenta corriente, pedidos, listas, historial de sync.
 */
export const COST_HIDDEN_CODE = "COST_HIDDEN";

/** Rutas cuyo plan las habilita para comprar o ver la cuenta: todas operan con costos. */
export const COST_CAPABILITIES: readonly PlanCapabilityKey[] = [
  "directCheckout",
  "providerPortalAccess",
  "providerAccountAccess",
  "advancedAnalytics",
];

export const COST_SENSITIVE_KEY = "costSensitive";

/**
 * Marca un endpoint (o un controller entero) que devuelve u opera con costos.
 * `CostSensitive(false)` en un método lo libera dentro de un controller marcado.
 */
export const CostSensitive = (on = true) => SetMetadata(COST_SENSITIVE_KEY, on);

type CostViewer = Pick<TenantContext, "tenantType" | "permissions" | "entitlements">;

/**
 * El plan del comercio incluye el modo vendedor. Se mira el plan y no el estado
 * del pago: con la suscripción restringida el vendedor tampoco ve costos.
 */
export function sellerModeOn(tenant: Pick<TenantContext, "tenantType" | "entitlements"> | null | undefined): boolean {
  if (!tenant || tenant.tenantType !== "RETAILER") return false;
  const ent = tenant.entitlements;
  if (!ent || !ent.enforced) return true;
  return ent.capabilities.sellerMode === true;
}

/** Con el modo vendedor, esta persona ve solo precios de venta. */
export function hidesCost(tenant: CostViewer | null | undefined): boolean {
  if (!tenant || !sellerModeOn(tenant)) return false;
  return !tenant.permissions.includes("prices.viewCost");
}

export function costHiddenError() {
  return new ForbiddenException({
    code: COST_HIDDEN_CODE,
    message: "Tu rol ve precios de venta. Las compras y los costos los maneja quien tiene el permiso “Ver costos”.",
  });
}

/** Corta si la persona no puede ver costos y la ruta los usa. */
export function assertCostVisible(tenant: CostViewer | null | undefined) {
  if (hidesCost(tenant)) throw costHiddenError();
}
