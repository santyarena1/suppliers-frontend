"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { clearSession, getUser, isAdmin, isBrand, isUser } from "@/lib/auth";
import { Search, Key, Users, LogOut, BarChart2, ShoppingCart, Menu, X, Home, Activity, Building2, Shield, Boxes } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useMyModules } from "@/lib/permissions";
import type { ModuleKey } from "@/lib/api";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const user = getUser();
  const { totalCount, byProvider } = useCart();
  const providerCount = Object.keys(byProvider).length;
  const [mobileOpen, setMobileOpen] = useState(false);
  const myModules = useMyModules();
  const canSee = (m: ModuleKey) => myModules === null || myModules.includes(m);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  function logout() {
    clearSession();
    router.push("/login");
  }

  const links = [
    { href: "/", label: "Inicio", icon: Home, badge: undefined as number | undefined, sublabel: undefined as string | undefined, exact: true, module: null as ModuleKey | null },
    { href: "/search", label: "Búsqueda", icon: Search, badge: undefined as number | undefined, sublabel: undefined as string | undefined, exact: false, module: "search" as ModuleKey | null },
    { href: "/cart", label: "Carrito", icon: ShoppingCart, badge: totalCount > 0 ? totalCount : undefined, sublabel: providerCount > 0 ? `${providerCount} prov.` : undefined, exact: false, module: "cart" as ModuleKey | null },
    { href: "/credentials", label: "Credenciales", icon: Key, badge: undefined as number | undefined, sublabel: undefined as string | undefined, exact: false, module: "credentials" as ModuleKey | null },
    { href: "/proveedores", label: "Proveedores", icon: Boxes, badge: undefined as number | undefined, sublabel: undefined as string | undefined, exact: false, module: "providers" as ModuleKey | null },
    ...(isUser() || isAdmin() ? [{ href: "/marcas", label: "Portal de Marcas", icon: Building2, badge: undefined as number | undefined, sublabel: undefined as string | undefined, exact: false, module: "brands" as ModuleKey | null }] : []),
    ...(isBrand() ? [{ href: "/marca", label: "Panel de Marca", icon: Building2, badge: undefined as number | undefined, sublabel: undefined as string | undefined, exact: false, module: "brands" as ModuleKey | null }] : []),
    { href: "/diagnostics", label: "Diagnóstico", icon: Activity, badge: undefined as number | undefined, sublabel: undefined as string | undefined, exact: false, module: "diagnostics" as ModuleKey | null },
    ...(isAdmin() ? [
      { href: "/admin", label: "Administración", icon: Users, badge: undefined as number | undefined, sublabel: undefined as string | undefined, exact: false, module: "admin" as ModuleKey | null },
      { href: "/admin/marcas", label: "Marcas (Admin)", icon: Shield, badge: undefined as number | undefined, sublabel: undefined as string | undefined, exact: false, module: "admin" as ModuleKey | null },
    ] : []),
  ].filter((l) => l.module === null || canSee(l.module));

  const SidebarContent = (
    <>
      <div className="px-5 py-5 border-b border-surface-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-brand-600 rounded-md flex items-center justify-center">
            <BarChart2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">NODO</p>
            <p className="text-xs text-surface-400 mt-0.5">Proveedores</p>
          </div>
        </div>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden text-surface-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {links.map(({ href, label, icon: Icon, badge, sublabel, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all relative ${
                active
                  ? "bg-brand-600/15 text-brand-400 font-medium"
                  : "text-surface-400 hover:text-surface-100 hover:bg-surface-800"
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-brand-400" : ""}`} />
              <span className="flex-1">{label}</span>
              {badge != null && (
                <span className="bg-brand-600 text-white text-[10px] font-bold rounded-full min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center">
                  {badge}
                </span>
              )}
              {sublabel && badge == null && (
                <span className="text-[10px] text-surface-500">{sublabel}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-surface-800">
        <div className="px-3 py-2 rounded-md bg-surface-800 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-surface-100 truncate">{user?.username}</p>
            {user?.role === "ROLE_ADMIN" && (
              <p className="text-[10px] text-brand-400 font-medium">Administrador</p>
            )}
            {user?.role === "ROLE_BRAND" && (
              <p className="text-[10px] text-violet-400 font-medium">Marca</p>
            )}
          </div>
          <button
            onClick={logout}
            title="Cerrar sesión"
            className="text-surface-500 hover:text-surface-200 transition-colors flex-shrink-0 ml-2"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-surface-900 border-b border-surface-800 flex items-center justify-between px-4 h-12">
        <button onClick={() => setMobileOpen(true)} className="text-surface-300 hover:text-white">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 bg-brand-600 rounded flex items-center justify-center">
            <BarChart2 className="w-3 h-3 text-white" />
          </div>
          <span className="text-sm font-semibold text-white">NODO</span>
        </div>
        <Link href="/cart" className="relative text-surface-300 hover:text-white">
          <ShoppingCart className="w-5 h-5" />
          {totalCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-brand-600 text-white text-[9px] font-bold rounded-full min-w-[1rem] h-4 px-1 flex items-center justify-center">
              {totalCount}
            </span>
          )}
        </Link>
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)} className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" />
      )}

      {/* Sidebar */}
      <aside className={`flex-shrink-0 border-r border-surface-800 flex flex-col bg-surface-900 transition-transform
        fixed lg:sticky top-0 left-0 z-50 lg:z-auto
        h-screen w-64 lg:w-56
        ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        {SidebarContent}
      </aside>
    </>
  );
}
