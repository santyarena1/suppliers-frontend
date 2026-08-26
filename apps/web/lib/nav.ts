import {
  Home, Search, ShoppingCart, Boxes, Building2, ClipboardList, Shield,
  Settings, Users, GitCompare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ModuleKey, TenantType } from "@/lib/api";
import type { UserRole } from "@/lib/auth";

/**
 * Navegación declarativa del sidebar.
 *
 * Inicio / Búsqueda / Comparador / Carrito van sueltos (acceso diario).
 * El resto vive en 3 secciones colapsables alineadas a los tipos de
 * organización (`TenantType`): Proveedores, Marcas, Sistema.
 *
 * Sistema:
 *  - Configuración — apariencia, preferencias y ajustes generales del sistema
 *  - Administración — usuarios, orgs, locales/precios, imágenes, diagnóstico
 */

export type NavSectionId = "providers" | "brands" | "system";

export type NavItemId =
  | "home"
  | "search"
  | "compare"
  | "cart"
  | "orders"
  | "providers"
  | "brands-portal"
  | "brands-panel"
  | "brands-admin"
  | "settings"
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
  { id: "brands", label: "Marcas" },
  { id: "system", label: "Sistema" },
];

export const NAV_ITEMS: NavItemDef[] = [
  { id: "home", href: "/", label: "Inicio", icon: Home, exact: true },
  { id: "search", href: "/search", label: "Búsqueda", icon: Search, module: "search" },
  { id: "compare", href: "/comparador", label: "Comparador", icon: GitCompare, module: "search" },
  { id: "cart", href: "/cart", label: "Carrito", icon: ShoppingCart, module: "cart", badge: "cart", sublabel: "providers" },

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
  /** Presente cuando la sesión conozca la organización activa. */
  tenantType?: TenantType | null;
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

  const superadmin = ctx.isSuperadmin || ctx.role === "ROLE_ADMIN";

  if (ctx.tenantType && !superadmin) {
    if (item.tenantTypes && !item.tenantTypes.includes(ctx.tenantType)) return false;
    return true;
  }

  if (item.roles && ctx.role && !item.roles.includes(ctx.role)) return false;
  return true;
}

export function visibleNavItems(ctx: NavContext): NavItemDef[] {
  return NAV_ITEMS.filter((item) => canSeeNavItem(item, ctx));
}
