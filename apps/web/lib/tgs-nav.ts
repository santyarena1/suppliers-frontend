import {
  ClipboardList,
  LayoutDashboard,
  Package,
  RotateCcw,
  ShoppingBag,
  ShoppingBasket,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import type { ContextNavItem } from "@/components/layout/ContextNav";

export const TGS_NAV: ContextNavItem[] = [
  { href: "/sistema-tgs", label: "Resumen", icon: LayoutDashboard, exact: true },
  { href: "/sistema-tgs/stock", label: "Stock", icon: Package },
  { href: "/sistema-tgs/clientes", label: "Clientes", icon: Users },
  { href: "/sistema-tgs/ventas", label: "Ventas", icon: ShoppingBag },
  { href: "/sistema-tgs/productos-vendidos", label: "Productos vendidos", icon: ShoppingBasket },
  { href: "/sistema-tgs/compras", label: "Compras", icon: Truck },
  { href: "/sistema-tgs/ctacte", label: "Cta. cte.", icon: Wallet },
  { href: "/sistema-tgs/ordenes", label: "Órdenes", icon: ClipboardList },
  { href: "/sistema-tgs/rma", label: "RMA", icon: RotateCcw },
];
