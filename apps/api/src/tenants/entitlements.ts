import { ConflictException, ForbiddenException, SetMetadata } from "@nestjs/common";
import {
  entitlementAllows,
  minimumPlanFor,
  PLAN_CAPABILITY_UPSELL,
  PLAN_CATALOG,
  searchLimitMessage,
  UNRESTRICTED_ENTITLEMENTS,
  type PlanCapabilityKey,
  type TenantEntitlements,
} from "@nodo/shared";
import type { TenantContext } from "./tenant-context.service";

/** Motivos estables que viajan en `code` del error: el front arma la UI con esto. */
export const ENTITLEMENT_ERROR_CODES = {
  featureUnavailable: "PLAN_FEATURE_UNAVAILABLE",
  searchLimit: "PLAN_SEARCH_LIMIT",
  suspended: "SUBSCRIPTION_SUSPENDED",
} as const;

export const REQUIRED_CAPABILITY_KEY = "nodo:requiredCapability";
export const ALLOW_WHEN_RESTRICTED_KEY = "nodo:allowWhenRestricted";
export const REQUIRES_ACTIVE_SUBSCRIPTION_KEY = "nodo:requiresActiveSubscription";

/**
 * El endpoint es de una capacidad del plan (checkout directo, cuenta corriente…).
 * Lo corta `TenantGuard` con el mismo error que `assertCapability`.
 */
export const RequiresCapability = (key: PlanCapabilityKey) => SetMetadata(REQUIRED_CAPABILITY_KEY, key);

/** Sigue andando con la suscripción suspendida (ver y regularizar la suscripción). */
export const AllowWhenRestricted = () => SetMetadata(ALLOW_WHEN_RESTRICTED_KEY, true);

/** Lectura que es operación (el buscador): se corta con la suscripción suspendida. */
export const RequiresActiveSubscription = () => SetMetadata(REQUIRES_ACTIVE_SUBSCRIPTION_KEY, true);

export function entitlementsOf(tenant: Pick<TenantContext, "entitlements">): TenantEntitlements {
  return tenant.entitlements ?? UNRESTRICTED_ENTITLEMENTS;
}

export function hasCapability(tenant: Pick<TenantContext, "entitlements">, key: PlanCapabilityKey): boolean {
  return entitlementAllows(entitlementsOf(tenant), key);
}

export function suspendedError() {
  return new ForbiddenException({
    code: ENTITLEMENT_ERROR_CODES.suspended,
    message:
      "Tu suscripción está suspendida. Tus datos siguen intactos: regularizá el pago para reactivar NODO.",
  });
}

export function assertOperational(tenant: Pick<TenantContext, "entitlements">) {
  const entitlements = entitlementsOf(tenant);
  if (entitlements.enforced && entitlements.access !== "FULL") throw suspendedError();
}

/**
 * Corta si el plan de la organización no incluye la capacidad. Es la
 * restricción real: el front solo esconde botones.
 */
export function assertCapability(tenant: Pick<TenantContext, "entitlements">, key: PlanCapabilityKey) {
  assertOperational(tenant);
  if (hasCapability(tenant, key)) return;
  const requiredPlan = minimumPlanFor(key);
  throw new ForbiddenException({
    code: ENTITLEMENT_ERROR_CODES.featureUnavailable,
    message: PLAN_CAPABILITY_UPSELL[key],
    details: {
      capability: key,
      plan: entitlementsOf(tenant).plan,
      requiredPlan,
      requiredPlanLabel: PLAN_CATALOG[requiredPlan].label,
    },
  });
}

export function searchLimitError(max: number, active: number) {
  return new ConflictException({
    code: ENTITLEMENT_ERROR_CODES.searchLimit,
    message: searchLimitMessage(max),
    details: { maxSearchProviders: max, activeSearchProviders: active, requiredPlan: "PRO" },
  });
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Lo que decide `TenantGuard` según el plan. Puro para poder testearlo:
 * - con la suscripción suspendida no se escribe nada (salvo lo marcado) y no se busca;
 * - un endpoint de una capacidad que el plan no tiene se corta.
 */
export function checkEntitlements(
  tenant: Pick<TenantContext, "entitlements"> | null | undefined,
  route: { method: string; capability?: PlanCapabilityKey; allowWhenRestricted?: boolean; requiresActive?: boolean }
) {
  if (!tenant) return;
  const entitlements = entitlementsOf(tenant);
  if (!entitlements.enforced) return;
  if (entitlements.access !== "FULL" && !route.allowWhenRestricted) {
    if (MUTATING.has(route.method.toUpperCase()) || route.requiresActive || route.capability) throw suspendedError();
  }
  if (route.capability) assertCapability(tenant, route.capability);
}
