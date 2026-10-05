import type { TenantRole, TenantType } from "./tenants";

/**
 * Permisos dentro de una organización.
 *
 * Cada rol trae valores por defecto (los de esta tabla) y el dueño de la
 * organización puede prender o apagar cualquiera, por rol o por persona.
 * El Dueño siempre tiene todos: así nadie se queda afuera de su propia org.
 * Diseño: docs/superpowers/specs/2026-09-26-permisos-por-organizacion-design.md
 */
export const PERMISSION_KEYS = [
  "orders.create",
  "orders.confirm",
  "orders.approve",
  "providers.manage",
  "providers.account",
  "catalog.purge",
  "team.manage",
  "codes.manage",
  "chat.write",
  "portfolio.view_all",
  "portfolio.manage",
  "portfolio.edit_terms",
  "brand.manage",
  "ads.manage",
  "integrations.manage",
  "prices.viewCost",
  "pricing.manage",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type PermissionGroup =
  | "orders"
  | "providers"
  | "team"
  | "chat"
  | "portfolio"
  | "brand"
  | "ads"
  | "integrations"
  | "pricing";

export const PERMISSION_GROUP_LABELS: Record<PermissionGroup, string> = {
  orders: "Pedidos",
  providers: "Proveedores",
  team: "Equipo",
  chat: "Chat",
  portfolio: "Cartera de clientes",
  brand: "Marca",
  ads: "Publicidad",
  integrations: "Integraciones",
  pricing: "Precios",
};

export interface PermissionDefinition {
  key: PermissionKey;
  group: PermissionGroup;
  label: string;
  description: string;
  /** Tipos de organización donde el permiso tiene sentido (y se muestra). */
  appliesTo: readonly TenantType[];
}

const BUYERS: readonly TenantType[] = ["RETAILER", "DISTRIBUTOR"];
const SUPPLIERS: readonly TenantType[] = ["DISTRIBUTOR", "BRAND"];
const ALL_TYPES: readonly TenantType[] = ["RETAILER", "DISTRIBUTOR", "BRAND"];

export const PERMISSIONS: readonly PermissionDefinition[] = [
  { key: "orders.create", group: "orders", label: "Armar y enviar pedidos", description: "Usar el carrito y mandar pedidos a los proveedores.", appliesTo: BUYERS },
  { key: "orders.confirm", group: "orders", label: "Confirmar sin aprobación", description: "Sus pedidos salen sin que otro los apruebe.", appliesTo: BUYERS },
  { key: "orders.approve", group: "orders", label: "Aprobar pedidos de otros", description: "Revisar y aprobar los pedidos que arma el resto del equipo.", appliesTo: BUYERS },
  { key: "providers.manage", group: "providers", label: "Configurar proveedores", description: "Credenciales, alta y baja de proveedores, listas de precios, configuración y sincronización.", appliesTo: ALL_TYPES },
  { key: "providers.account", group: "providers", label: "Cuenta corriente", description: "Ver la cuenta corriente y registrar pagos con los proveedores.", appliesTo: BUYERS },
  { key: "catalog.purge", group: "providers", label: "Vaciar catálogo", description: "Borrar todo el catálogo sincronizado de un proveedor.", appliesTo: BUYERS },
  { key: "team.manage", group: "team", label: "Gestionar equipo", description: "Invitar, quitar y cambiar el rol de los miembros.", appliesTo: ALL_TYPES },
  { key: "codes.manage", group: "team", label: "Códigos de vinculación", description: "Generar y revocar códigos para vincular clientes.", appliesTo: SUPPLIERS },
  { key: "chat.write", group: "chat", label: "Escribir en el chat", description: "Mandar mensajes a proveedores o clientes.", appliesTo: ALL_TYPES },
  { key: "portfolio.view_all", group: "portfolio", label: "Ver toda la cartera", description: "Si está apagado, solo ve las cuentas que tiene asignadas.", appliesTo: SUPPLIERS },
  { key: "portfolio.manage", group: "portfolio", label: "Gestionar cartera", description: "Asignar vendedores y suspender vínculos con clientes.", appliesTo: SUPPLIERS },
  { key: "portfolio.edit_terms", group: "portfolio", label: "Condiciones comerciales", description: "Editar las condiciones de un cliente.", appliesTo: ["DISTRIBUTOR"] },
  { key: "brand.manage", group: "brand", label: "Gestionar la marca", description: "Acciones comerciales, catálogo y recursos de la marca.", appliesTo: ["BRAND"] },
  { key: "ads.manage", group: "ads", label: "Publicidad", description: "Prender y gestionar publicidad.", appliesTo: ALL_TYPES },
  { key: "integrations.manage", group: "integrations", label: "API de catálogo", description: "Crear y administrar las API keys y los webhooks del catálogo.", appliesTo: ["RETAILER"] },
  { key: "prices.viewCost", group: "pricing", label: "Ver costos", description: "Ver lo que cobra cada distribuidor. Sin este permiso, con el modo vendedor, solo ve precios de venta y no compra.", appliesTo: ["RETAILER"] },
  { key: "pricing.manage", group: "pricing", label: "Márgenes de venta", description: "Configurar los márgenes de venta por distribuidor, categoría y producto.", appliesTo: ["RETAILER"] },
];

const MANAGERS: readonly TenantRole[] = ["OWNER", "ADMIN"];

/**
 * Valores por defecto: reproducen exactamente los permisos que antes estaban
 * fijos en código (TENANT_ROLES_CAN_*). Cambiar esto cambia lo que puede hacer
 * todo el mundo que no tenga excepciones cargadas.
 */
const DEFAULT_ROLES: Record<Exclude<PermissionKey, "chat.write">, readonly TenantRole[]> = {
  "orders.create": ["OWNER", "ADMIN", "BUYER", "SELLER"],
  "orders.confirm": ["OWNER", "ADMIN", "BUYER"],
  "orders.approve": MANAGERS,
  "providers.manage": MANAGERS,
  "providers.account": ["OWNER", "ADMIN", "BUYER", "SELLER", "PRODUCT_MANAGER", "MARKETING", "COMMERCIAL", "VIEWER"],
  "catalog.purge": MANAGERS,
  "team.manage": MANAGERS,
  "codes.manage": MANAGERS,
  "portfolio.view_all": ["OWNER", "ADMIN", "BUYER", "PRODUCT_MANAGER", "MARKETING", "COMMERCIAL", "VIEWER"],
  "portfolio.manage": MANAGERS,
  "portfolio.edit_terms": ["OWNER", "ADMIN", "SELLER"],
  "brand.manage": ["OWNER", "ADMIN", "MARKETING", "COMMERCIAL"],
  "ads.manage": MANAGERS,
  "integrations.manage": MANAGERS,
  // Modo vendedor: el vendedor del comercio cotiza con precio de venta, sin ver costos.
  "prices.viewCost": ["OWNER", "ADMIN", "BUYER"],
  "pricing.manage": MANAGERS,
};

/** El chat depende también del tipo: el vendedor del local no escribe, el del distro sí. */
const DEFAULT_CHAT_WRITERS: Record<TenantType, readonly TenantRole[]> = {
  RETAILER: ["OWNER", "ADMIN", "BUYER"],
  DISTRIBUTOR: ["OWNER", "ADMIN", "SELLER", "PRODUCT_MANAGER"],
  BRAND: ["OWNER", "ADMIN", "MARKETING", "COMMERCIAL"],
};

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}

export function permissionsForType(type: TenantType): PermissionDefinition[] {
  return PERMISSIONS.filter((permission) => permission.appliesTo.includes(type));
}

export function defaultAllows(type: TenantType, role: TenantRole, key: PermissionKey): boolean {
  if (role === "OWNER") return true;
  if (key === "chat.write") return DEFAULT_CHAT_WRITERS[type].includes(role);
  return DEFAULT_ROLES[key].includes(role);
}

/** Excepciones guardadas: `true`/`false` pisan el valor heredado; ausente = heredar. */
export type PermissionOverrides = Partial<Record<PermissionKey, boolean>>;

/**
 * Permisos efectivos de una persona: Dueño → todos; si no, excepción de la
 * persona > excepción del rol en su organización > valor por defecto del rol.
 */
export function resolvePermissions(input: {
  type: TenantType;
  role: TenantRole;
  roleOverrides?: PermissionOverrides;
  memberOverrides?: PermissionOverrides;
}): PermissionKey[] {
  if (input.role === "OWNER") return [...PERMISSION_KEYS];
  return PERMISSION_KEYS.filter((key) => {
    const member = input.memberOverrides?.[key];
    if (member !== undefined) return member;
    const role = input.roleOverrides?.[key];
    if (role !== undefined) return role;
    return defaultAllows(input.type, input.role, key);
  });
}
