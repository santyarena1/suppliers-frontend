"use client";

import { TENANT_ROLES_CAN_MANAGE_COMMERCE, TENANT_ROLES_CAN_ORDER, TENANT_ROLES_CAN_APPROVE_ORDERS } from "@/lib/api";
import { getTenant } from "@/lib/auth";

/** Quien manda el local: administrador, o un OWNER residual de la migración. */
export function canManageCommerce() {
  const role = getTenant()?.role;
  return !!role && (TENANT_ROLES_CAN_MANAGE_COMMERCE as readonly string[]).includes(role);
}

export function canMutateCart() {
  const role = getTenant()?.role;
  return !!role && (TENANT_ROLES_CAN_ORDER as readonly string[]).includes(role);
}

export function canApproveOrders() {
  const role = getTenant()?.role;
  return !!role && (TENANT_ROLES_CAN_APPROVE_ORDERS as readonly string[]).includes(role);
}

export function isViewer() {
  return getTenant()?.role === "VIEWER";
}
