import {
  Home, Building2, Grid3X3, Truck, Upload, Users, Newspaper,
  Megaphone, FolderOpen, GraduationCap, History, Settings,
  Heart, Bell, GitCompare, Mail,
} from "lucide-react";
import type { ContextNavItem } from "@/components/layout/ContextNav";

export const USER_BRANDS_NAV: ContextNavItem[] = [
  { href: "/marcas", label: "Inicio", icon: Home, exact: true },
  { href: "/marcas/invitaciones", label: "Invitaciones", icon: Mail },
  { href: "/marcas/novedades", label: "Novedades", icon: Newspaper },
  { href: "/marcas/favoritos", label: "Favoritos", icon: Heart },
  { href: "/marcas/alertas", label: "Alertas", icon: Bell },
  { href: "/marcas/comparador", label: "Comparador", icon: GitCompare },
];

export const BRAND_PANEL_NAV: ContextNavItem[] = [
  { href: "/marca", label: "Dashboard", icon: Home, exact: true },
  { href: "/marca/productos", label: "Productos", icon: Grid3X3 },
  { href: "/marca/disponibilidad", label: "Mapa de disponibilidad", icon: Building2 },
  { href: "/marca/distribuidores", label: "Distribuidores", icon: Truck },
  { href: "/marca/importaciones", label: "Importaciones", icon: Upload },
  { href: "/marca/usuarios", label: "Usuarios", icon: Users },
  { href: "/marca/novedades", label: "Novedades", icon: Newspaper },
  { href: "/marca/campanas", label: "Campañas", icon: Megaphone },
  { href: "/marca/materiales", label: "Materiales", icon: FolderOpen },
  { href: "/marca/capacitaciones", label: "Capacitaciones", icon: GraduationCap },
  { href: "/marca/perfil", label: "Perfil", icon: Settings },
  { href: "/marca/historial", label: "Historial", icon: History },
];

export const ADMIN_MARCAS_NAV: ContextNavItem[] = [
  { href: "/admin/marcas", label: "Resumen", icon: Home, exact: true },
  { href: "/admin/marcas/marcas", label: "Marcas", icon: Building2 },
  { href: "/admin/marcas/distribuidores", label: "Distribuidores", icon: Truck },
  { href: "/admin/marcas/accesos", label: "Accesos", icon: Users },
  { href: "/admin/marcas/auditoria", label: "Auditoría", icon: History },
  { href: "/admin/marcas/configuracion", label: "Configuración", icon: Settings },
];
