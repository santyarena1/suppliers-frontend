/**
 * Modelo multi-tenant de NODO. Ver docs/ARQUITECTURA_TENANTS.md.
 * El `UserRole` es el nivel de plataforma; el alcance funcional real de un
 * usuario lo define su membresía en una organización.
 */

export type TenantType = "RETAILER" | "DISTRIBUTOR" | "BRAND";

export type TenantRole =
  | "OWNER"
  | "ADMIN"
  | "BUYER"
  | "SELLER"
  | "PRODUCT_MANAGER"
  | "MARKETING"
  | "COMMERCIAL"
  | "VIEWER";

export type TenantLinkStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED";

export type OrderApprovalStatus = "NOT_REQUIRED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";

export const TENANT_TYPES: readonly TenantType[] = ["RETAILER", "DISTRIBUTOR", "BRAND"] as const;

/** Nombres normalizados para pantalla. Nunca mostrar la clave del enum. */
export const TENANT_TYPE_LABELS: Record<TenantType, string> = {
  RETAILER: "Comercio",
  DISTRIBUTOR: "Distribuidor",
  BRAND: "Marca",
};

export const TENANT_TYPE_DESCRIPTIONS: Record<TenantType, string> = {
  RETAILER: "Local o cadena que compra a los distribuidores vinculados",
  DISTRIBUTOR: "Proveedor o marca distribuidora que vende a los comercios",
  BRAND: "Marca que hace acciones comerciales sobre distribuidores y comercios",
};

export const TENANT_ROLE_LABELS: Record<TenantRole, string> = {
  OWNER: "Gerente",
  ADMIN: "Administrador",
  BUYER: "Comprador",
  SELLER: "Vendedor",
  PRODUCT_MANAGER: "Product Manager",
  MARKETING: "Marketing",
  COMMERCIAL: "Comercial",
  VIEWER: "Solo lectura",
};

/**
 * Nombre para pantalla. En un comercio un `OWNER` residual se muestra como
 * Administrador: ahí no existe “Dueño”.
 */
export function tenantRoleLabel(role: TenantRole, tenantType?: TenantType): string {
  if (tenantType === "RETAILER" && role === "OWNER") return TENANT_ROLE_LABELS.ADMIN;
  return TENANT_ROLE_LABELS[role];
}

/** Roles internos válidos para cada tipo de organización. */
export const TENANT_ROLES_BY_TYPE: Record<TenantType, readonly TenantRole[]> = {
  RETAILER: ["ADMIN", "BUYER", "SELLER", "VIEWER"],
  DISTRIBUTOR: ["OWNER", "ADMIN", "SELLER", "PRODUCT_MANAGER", "VIEWER"],
  BRAND: ["OWNER", "ADMIN", "MARKETING", "COMMERCIAL", "VIEWER"],
};

/** Roles que pueden armar un pedido (con o sin aprobación posterior). */
export const TENANT_ROLES_CAN_ORDER: readonly TenantRole[] = ["OWNER", "ADMIN", "BUYER", "SELLER"];

/**
 * Roles que confirman sin esperar firma. El comprador no está acá: lo decide
 * el tilde `buyerCanConfirm` del comercio, leído de la base al confirmar.
 */
export const TENANT_ROLES_CAN_CONFIRM_ORDERS: readonly TenantRole[] = ["OWNER", "ADMIN"];

/** Roles que pueden aprobar el pedido que armó otra persona de la organización. */
export const TENANT_ROLES_CAN_APPROVE_ORDERS: readonly TenantRole[] = ["OWNER", "ADMIN"];

/** Credenciales, markup, equipo, canje y sync a mano: quien manda el local. */
export const TENANT_ROLES_CAN_MANAGE_COMMERCE: readonly TenantRole[] = ["OWNER", "ADMIN"];

/** Roles que pueden vaciar el catálogo de la organización. */
export const TENANT_ROLES_CAN_PURGE_CATALOG: readonly TenantRole[] = ["OWNER", "ADMIN"];

/** Si este rol deja el pedido esperando firma, según el tilde del comprador. */
export function orderNeedsApproval(role: TenantRole, buyerCanConfirm: boolean): boolean {
  if (role === "OWNER" || role === "ADMIN") return false;
  if (role === "BUYER") return !buyerCanConfirm;
  return true;
}

export const TENANT_LINK_STATUS_LABELS: Record<TenantLinkStatus, string> = {
  PENDING: "Pendiente",
  ACTIVE: "Activo",
  SUSPENDED: "Suspendido",
  REVOKED: "Revocado",
};

export const ORDER_APPROVAL_STATUS_LABELS: Record<OrderApprovalStatus, string> = {
  NOT_REQUIRED: "Sin aprobación requerida",
  PENDING_APPROVAL: "Pendiente de aprobación",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
};
