import {
  Home, Search, ShoppingCart, Boxes, Building2, ClipboardList, Shield,
  Settings, Activity, Users, Briefcase, QrCode, MessageSquare, ShoppingBag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ModuleKey, TenantRole, TenantType } from "@/lib/api";
import type { UserRole } from "@/lib/auth";

/**
 * Navegación declarativa del sidebar.
 *
 * Inicio / Búsqueda / Carrito van sueltos (acceso diario) para el comercio.
 * El distribuidor busca **su** catálogo (sin carrito ni otras integraciones)
 * y administra cartera, códigos, pedidos de clientes y chat. El Product
 * Manager también ve la cartera completa (quién vende a cada local).
 *
 * Visibilidad:
 *  - `module` — permiso de plataforma (`GET /me/permissions`).
 *  - `tenantTypes` — tipo de organización de la sesión.
 *  - `tenantRoles` — rol interno (vendedor vs gerente, etc.).
 *  - `roles` — fallback de plataforma.
 * Superadmin (`ROLE_ADMIN`) siempre ve administración. Si además tiene
 * membresía (Administración, espejando el Comercio de Pruebas), ve búsqueda
 * y carrito: el carrito es el suyo; credenciales y vínculos, los de testuser1.
 */

export type NavSectionId = "providers" | "portfolio" | "brands" | "system";

export type NavItemId =
  | "home"
  | "search"
  | "cart"
  | "orders"
  | "providers"
  | "cartera"
  | "codigos"
  | "client-orders"
  | "chat"
  | "brands-portal"
  | "brands-panel"
  | "brands-admin"
  | "settings"
  | "diagnostics"
  | "admin";

export interface NavItemDef {
  id: NavItemId;
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  module?: ModuleKey;
  /** Tipos de organización que ven este ítem. Se ignora si no hay tenant en sesión. */
  tenantTypes?: TenantType[];
  /** Rol interno. Se ignora si no hay membresía. */
  tenantRoles?: TenantRole[];
  /** Fallback mientras /me no exponga la membresía. */
  roles?: UserRole[];
  badge?: "cart";
  sublabel?: "providers";
  section?: NavSectionId;
}

export interface NavSectionDef {
  id: NavSectionId;
  label: string;
}

export const NAV_SECTIONS: NavSectionDef[] = [
  { id: "providers", label: "Proveedores" },
  { id: "portfolio", label: "Cartera" },
  { id: "brands", label: "Marcas" },
  { id: "system", label: "Sistema" },
];

export const NAV_ITEMS: NavItemDef[] = [
  { id: "home", href: "/", label: "Inicio", icon: Home, exact: true },
  {
    id: "search",
    href: "/search",
    label: "Búsqueda",
    icon: Search,
    module: "search",
    tenantTypes: ["RETAILER", "DISTRIBUTOR"],
  },
  {
    id: "cart",
    href: "/cart",
    label: "Carrito",
    icon: ShoppingCart,
    module: "cart",
    badge: "cart",
    sublabel: "providers",
    tenantTypes: ["RETAILER"],
  },

  {
    id: "orders",
    href: "/pedidos",
    label: "Pedidos",
    icon: ClipboardList,
    module: "cart",
    tenantTypes: ["RETAILER"],
    section: "providers",
  },
  {
    id: "providers",
    href: "/proveedores",
    label: "Proveedores",
    icon: Boxes,
    module: "providers",
    tenantTypes: ["RETAILER"],
    section: "providers",
  },
  {
    id: "chat",
    href: "/chat",
    label: "Chat",
    icon: MessageSquare,
    tenantTypes: ["RETAILER", "DISTRIBUTOR"],
    tenantRoles: ["OWNER", "ADMIN", "BUYER", "SELLER", "VIEWER"],
  },

  {
    id: "cartera",
    href: "/cartera",
    label: "Clientes",
    icon: Briefcase,
    tenantTypes: ["DISTRIBUTOR"],
    tenantRoles: ["OWNER", "ADMIN", "SELLER", "PRODUCT_MANAGER", "VIEWER"],
    section: "portfolio",
  },
  {
    id: "codigos",
    href: "/codigos",
    label: "Códigos",
    icon: QrCode,
    tenantTypes: ["DISTRIBUTOR"],
    tenantRoles: ["OWNER", "ADMIN"],
    section: "portfolio",
  },
  {
    id: "client-orders",
    href: "/pedidos-clientes",
    label: "Pedidos de clientes",
    icon: ShoppingBag,
    tenantTypes: ["DISTRIBUTOR"],
    tenantRoles: ["OWNER", "ADMIN", "SELLER", "VIEWER"],
    section: "portfolio",
  },

  {
    id: "brands-portal",
    href: "/marcas",
    label: "Portal de Marcas",
    icon: Building2,
    module: "brands",
    tenantTypes: ["RETAILER"],
    roles: ["ROLE_USER", "ROLE_ADMIN"],
    section: "brands",
  },
  {
    id: "brands-panel",
    href: "/marca",
    label: "Panel de Marca",
    icon: Building2,
    module: "brands",
    tenantTypes: ["BRAND"],
    roles: ["ROLE_BRAND"],
    section: "brands",
  },
  {
    id: "brands-admin",
    href: "/admin/marcas",
    label: "Marcas (Admin)",
    icon: Shield,
    module: "admin",
    roles: ["ROLE_ADMIN"],
    section: "brands",
  },

  { id: "settings", href: "/configuracion", label: "Configuración", icon: Settings, section: "system" },
  {
    id: "diagnostics",
    href: "/diagnostics",
    label: "Diagnóstico",
    icon: Activity,
    module: "diagnostics",
    roles: ["ROLE_ADMIN"],
    section: "system",
  },
  {
    id: "admin",
    href: "/admin",
    label: "Administración",
    icon: Users,
    module: "admin",
    roles: ["ROLE_ADMIN"],
    section: "system",
  },
];

export interface NavContext {
  role: UserRole | null;
  modules: ModuleKey[] | null;
  tenantType?: TenantType | null;
  tenantRole?: TenantRole | null;
  isSuperadmin?: boolean;
}

export function isNavItemActive(item: Pick<NavItemDef, "href" | "exact">, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** El href más largo gana — evita que /admin y /admin/marcas queden activos a la vez. */
export function findActiveNavId(items: NavItemDef[], pathname: string): NavItemId | null {
  const matches = items.filter((item) => isNavItemActive(item, pathname));
  if (matches.length === 0) return null;
  return matches.reduce((best, item) => (item.href.length > best.href.length ? item : best)).id;
}

export function canSeeNavItem(item: NavItemDef, ctx: NavContext): boolean {
  if (item.module && ctx.modules !== null && !ctx.modules.includes(item.module)) {
    return false;
  }

  if (item.tenantTypes) {
    if (!ctx.tenantType || !item.tenantTypes.includes(ctx.tenantType)) return false;
  }
  if (item.tenantRoles) {
    if (!ctx.tenantRole || !item.tenantRoles.includes(ctx.tenantRole)) return false;
  }

  const platformAdmin = ctx.isSuperadmin || ctx.role === "ROLE_ADMIN";

  // Quien pertenece a una organización ve lo que pasó los filtros de tipo y
  // rol interno. El administrador de plataforma también, si tiene membresía:
  // no hay que "entrar como" para mirar el catálogo del comercio de pruebas.
  if (ctx.tenantType && !platformAdmin) {
    return true;
  }

  if (item.roles && ctx.role && !item.roles.includes(ctx.role)) return false;
  return true;
}

export function visibleNavItems(ctx: NavContext): NavItemDef[] {
  return NAV_ITEMS.filter((item) => canSeeNavItem(item, ctx));
}
