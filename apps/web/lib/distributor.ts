"use client";

import { TENANT_ROLES_CAN_MANAGE_DISTRIBUTOR, TENANT_ROLES_CAN_SEE_PORTFOLIO } from "@/lib/api";
import { getTenant } from "@/lib/auth";

export function isDistributor() {
  return getTenant()?.type === "DISTRIBUTOR";
}

export function canManageDistributor() {
  const role = getTenant()?.role;
  return isDistributor() && !!role && (TENANT_ROLES_CAN_MANAGE_DISTRIBUTOR as readonly string[]).includes(role);
}

export function canSeePortfolio() {
  const tenant = getTenant();
  if (tenant?.type !== "DISTRIBUTOR") return false;
  return (TENANT_ROLES_CAN_SEE_PORTFOLIO as readonly string[]).includes(tenant.role);
}

export function isDistributorSeller() {
  return getTenant()?.type === "DISTRIBUTOR" && getTenant()?.role === "SELLER";
}
