import { Home, Building2, Truck, Users, History, Settings, Bell, Palette, Megaphone, CircleDot, FolderOpen, GraduationCap } from "lucide-react";
import type { ContextNavItem } from "@/components/layout/ContextNav";

export const USER_BRANDS_NAV: ContextNavItem[] = [
  { href: "/marcas", label: "Marcas", icon: Home, exact: true },
  { href: "/avisos", label: "Avisos", icon: Bell },
];

export const BRAND_PANEL_NAV: ContextNavItem[] = [
  { href: "/marca", label: "Panel", icon: Home, exact: true },
  { href: "/marca/productos", label: "Productos", icon: CircleDot },
  { href: "/marca/materiales", label: "Materiales", icon: FolderOpen },
  { href: "/marca/capacitaciones", label: "Capacitaciones", icon: GraduationCap },
  { href: "/marca/acciones", label: "Acciones", icon: Megaphone },
  { href: "/marca/landing", label: "Espacio", icon: Palette },
  { href: "/marca/cuentas", label: "Cuentas", icon: Users },
];

export const ADMIN_MARCAS_NAV: ContextNavItem[] = [
  { href: "/admin/marcas", label: "Resumen", icon: Home, exact: true },
  { href: "/admin/marcas/marcas", label: "Marcas", icon: Building2 },
  { href: "/admin/marcas/distribuidores", label: "Distribuidores", icon: Truck },
  { href: "/admin/marcas/accesos", label: "Accesos", icon: Users },
  { href: "/admin/marcas/auditoria", label: "Auditoría", icon: History },
  { href: "/admin/marcas/configuracion", label: "Configuración", icon: Settings },
];
