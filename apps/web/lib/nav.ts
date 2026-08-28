import {
  Home, Search, ShoppingCart, Boxes, Building2, ClipboardList, Shield,
  Settings, Users, GitCompare, Handshake, QrCode, UserCog, MessageSquare, Megaphone,
  Bell, Globe, Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ModuleKey, TenantRole, TenantType } from "@/lib/api";
import type { UserRole } from "@/lib/auth";

/**
 * Navegación declarativa del sidebar.
 *
 * Inicio / Búsqueda / Comparador / Carrito van sueltos (acceso diario).
 * El resto vive en secciones colapsables alineadas a los tipos de
 * organización (`TenantType`): Proveedores (comercio), Cartera (distribuidor),
 * Marcas y Sistema.
 *
 * Sistema:
 *  - Configuración — apariencia, preferencias y ajustes generales del sistema
 *  - Administración — usuarios, orgs, locales/precios, imágenes, diagnóstico
 */

export type NavSectionId = "providers" | "portfolio" | "brands" | "system";

export type NavItemId =
  | "home"
  | "search"
  | "compare"
  | "cart"
  | "orders"
  | "providers"
  | "clients"
  | "client-orders"
  | "codes"
  | "ads"
  | "chat"
  | "team"
  | "brands-portal"
  | "brands-panel"
  | "brand-actions"
  | "brand-landing"
  | "brand-accounts"
  | "brand-codes"
  | "brand-ads"
  | "notices"
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
  /** Roles internos. Si falta, cualquier rol de esa organización lo ve. */
  tenantRoles?: TenantRole[];
  /** Fallback mientras /me no exponga la membresía. */
  roles?: UserRole[];
  badge?: "cart" | "chat";
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
  { id: "search", href: "/search", label: "Búsqueda", icon: Search, module: "search", tenantTypes: ["RETAILER"] },
  { id: "compare", href: "/comparador", label: "Comparador", icon: GitCompare, module: "search", tenantTypes: ["RETAILER"] },
  { id: "cart", href: "/cart", label: "Carrito", icon: ShoppingCart, module: "cart", badge: "cart", sublabel: "providers", tenantTypes: ["RETAILER"] },
  { id: "chat", href: "/mensajes", label: "Mensajes", icon: MessageSquare, badge: "chat", tenantTypes: ["RETAILER", "DISTRIBUTOR", "BRAND"] },

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
    id: "clients",
    href: "/clientes",
    label: "Clientes",
    icon: Handshake,
    tenantTypes: ["DISTRIBUTOR"],
    section: "portfolio",
  },
  {
    id: "client-orders",
    href: "/pedidos",
    label: "Pedidos",
    icon: ClipboardList,
    tenantTypes: ["DISTRIBUTOR"],
    section: "portfolio",
  },
  {
    id: "codes",
    href: "/codigos",
    label: "Códigos",
    icon: QrCode,
    tenantTypes: ["DISTRIBUTOR"],
    tenantRoles: ["OWNER", "ADMIN"],
    section: "portfolio",
  },
  {
    id: "ads",
    href: "/publicidad",
    label: "Publicidad",
    icon: Megaphone,
    tenantTypes: ["DISTRIBUTOR"],
    tenantRoles: ["OWNER", "ADMIN"],
    section: "portfolio",
  },

  {
    id: "brands-portal",
    href: "/marcas",
    label: "Marcas",
    icon: Building2,
    tenantTypes: ["RETAILER", "DISTRIBUTOR"],
    section: "brands",
  },
  {
    id: "notices",
    href: "/avisos",
    label: "Avisos",
    icon: Bell,
    tenantTypes: ["RETAILER", "DISTRIBUTOR"],
    section: "brands",
  },
  {
    id: "brands-panel",
    href: "/marca",
    label: "Panel",
    icon: Building2,
    tenantTypes: ["BRAND"],
    section: "brands",
  },
  {
    id: "brand-actions",
    href: "/marca/acciones",
    label: "Acciones",
    icon: Target,
    tenantTypes: ["BRAND"],
    section: "brands",
  },
  {
    id: "brand-landing",
    href: "/marca/landing",
    label: "Landing",
    icon: Globe,
    tenantTypes: ["BRAND"],
    section: "brands",
  },
  {
    id: "brand-accounts",
    href: "/marca/cuentas",
    label: "Cuentas",
    icon: Handshake,
    tenantTypes: ["BRAND"],
    section: "brands",
  },
  {
    id: "brand-codes",
    href: "/codigos",
    label: "Códigos",
    icon: QrCode,
    tenantTypes: ["BRAND"],
    tenantRoles: ["OWNER", "ADMIN"],
    section: "brands",
  },
  {
    id: "brand-ads",
    href: "/publicidad",
    label: "Publicidad",
    icon: Megaphone,
    tenantTypes: ["BRAND"],
    tenantRoles: ["OWNER", "ADMIN"],
    section: "brands",
  },
  {
    id: "brands-admin",
    href: "/admin/marcas",
    label: "Marcas (legado)",
    icon: Shield,
    module: "admin",
    roles: ["ROLE_ADMIN"],
    section: "brands",
  },

  { id: "settings", href: "/configuracion", label: "Configuración", icon: Settings, section: "system" },
  {
    id: "team",
    href: "/equipo",
    label: "Equipo",
    icon: UserCog,
    tenantTypes: ["RETAILER", "DISTRIBUTOR", "BRAND"],
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
  /** Presente cuando la sesión conozca la organización activa. */
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

  const superadmin = ctx.isSuperadmin || ctx.role === "ROLE_ADMIN";

  if (ctx.tenantType && !superadmin) {
    if (item.tenantTypes && !item.tenantTypes.includes(ctx.tenantType)) return false;
    if (item.tenantRoles && ctx.tenantRole && !item.tenantRoles.includes(ctx.tenantRole)) return false;
    return true;
  }

  if (item.roles && ctx.role && !item.roles.includes(ctx.role)) return false;
  return true;
}

export function visibleNavItems(ctx: NavContext): NavItemDef[] {
  return NAV_ITEMS.filter((item) => canSeeNavItem(item, ctx));
}
