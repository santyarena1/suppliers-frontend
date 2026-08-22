"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, LogOut, PanelLeft, PanelLeftClose, X } from "lucide-react";
import { clearSession, getUser, type UserRole } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { invalidateMyModules, useMyModules } from "@/lib/permissions";
import {
  NAV_SECTIONS,
  type NavItemDef,
  type NavSectionId,
  findActiveNavId,
  visibleNavItems,
} from "@/lib/nav";
import NodoLogo from "../NodoLogo";
import NodoWordmark from "../NodoWordmark";

const COLLAPSED_KEY = "nodo.sidebar.collapsed";
const OPEN_SECTION_KEY = "nodo.sidebar.openSection";
const SECTION_IDS = new Set<NavSectionId>(["providers", "brands", "system"]);

const ROLE_LABEL: Partial<Record<UserRole, { text: string; className: string }>> = {
  ROLE_ADMIN: { text: "Administrador", className: "text-brand-400" },
  ROLE_BRAND: { text: "Marca", className: "text-violet-400" },
};

function readOpenSection(): NavSectionId | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(OPEN_SECTION_KEY);
  if (raw && SECTION_IDS.has(raw as NavSectionId)) return raw as NavSectionId;
  return null;
}

function persistOpenSection(id: NavSectionId | null) {
  if (id) localStorage.setItem(OPEN_SECTION_KEY, id);
  else localStorage.removeItem(OPEN_SECTION_KEY);
}

interface Props {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({ mobileOpen, onCloseMobile }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const user = getUser();
  const { totalCount, byProvider } = useCart();
  const providerCount = Object.keys(byProvider).length;
  const myModules = useMyModules();

  const [collapsed, setCollapsed] = useState(false);
  const [openSection, setOpenSection] = useState<NavSectionId | null>(null);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    setOpenSection(readOpenSection());
  }, []);

  const items = useMemo(
    () => visibleNavItems({ role: user?.role ?? null, modules: myModules }),
    [user?.role, myModules],
  );

  const pinned = items.filter((item) => !item.section);
  const activeId = findActiveNavId(items, pathname);
  const activeItem = items.find((item) => item.id === activeId);

  useEffect(() => {
    if (!activeItem?.section) return;
    setOpenSection((prev) => {
      if (prev === activeItem.section) return prev;
      persistOpenSection(activeItem.section!);
      return activeItem.section!;
    });
  }, [activeItem?.section]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  function toggleSection(id: NavSectionId) {
    setOpenSection((prev) => {
      const next = prev === id ? null : id;
      persistOpenSection(next);
      return next;
    });
  }

  function logout() {
    invalidateMyModules();
    clearSession();
    router.push("/login");
  }

  const roleMeta = user?.role ? ROLE_LABEL[user.role] : undefined;

  function renderLink(item: NavItemDef, opts?: { collapsed?: boolean }) {
    const Icon = item.icon;
    const active = item.id === activeId;
    const badge = item.badge === "cart" && totalCount > 0 ? totalCount : undefined;
    const sublabel = item.sublabel === "providers" && providerCount > 0 && badge == null
      ? `${providerCount} prov.`
      : undefined;

    return (
      <Link
        key={item.id}
        href={item.href}
        title={opts?.collapsed ? item.label : undefined}
        className={`flex items-center gap-2.5 rounded-md text-sm transition-all relative ${
          opts?.collapsed ? "justify-center px-2 py-2" : "px-3 py-2"
        } ${
          active
            ? "bg-brand-600/15 text-brand-400 font-medium"
            : "text-surface-400 hover:text-surface-100 hover:bg-surface-800"
        }`}
      >
        <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-brand-400" : ""}`} />
        {!opts?.collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {badge != null && (
              <span className="bg-brand-600 text-white text-[10px] font-bold rounded-full min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center">
                {badge}
              </span>
            )}
            {sublabel && <span className="text-[10px] text-surface-500">{sublabel}</span>}
          </>
        )}
        {opts?.collapsed && badge != null && (
          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-brand-500" />
        )}
      </Link>
    );
  }

  const iconMode = collapsed && !mobileOpen;

  return (
    <aside
      className={`flex-shrink-0 border-r border-surface-800 flex flex-col bg-surface-900 transition-all
        fixed lg:sticky top-0 left-0 z-50 lg:z-auto
        h-screen
        ${iconMode ? "lg:w-16" : "w-64 lg:w-56"}
        ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
    >
      <div className={`py-5 border-b border-surface-800 flex items-center ${iconMode ? "px-2 justify-center" : "px-5 justify-between"}`}>
        <div className={`flex items-center ${iconMode ? "" : "gap-2.5"}`}>
          <NodoLogo className="w-7 h-7" />
          {!iconMode && (
            <div>
              <NodoWordmark className="h-3.5" />
              <p className="text-xs text-surface-400 mt-1">Proveedores</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden text-surface-400 hover:text-white"
          aria-label="Cerrar menú"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className={`flex-1 py-4 flex flex-col gap-0.5 overflow-y-auto ${iconMode ? "px-2" : "px-3"}`}>
        {pinned.map((item) => renderLink(item, { collapsed: iconMode }))}

        {NAV_SECTIONS.map((section) => {
          const sectionItems = items.filter((item) => item.section === section.id);
          if (sectionItems.length === 0) return null;
          const open = openSection === section.id;
          const sectionActive = sectionItems.some((item) => item.id === activeId);

          if (iconMode) {
            return (
              <div key={section.id} className="mt-3 flex flex-col gap-0.5">
                <div className="mx-auto w-6 border-t border-surface-800 mb-1" />
                {sectionItems.map((item) => renderLink(item, { collapsed: true }))}
              </div>
            );
          }

          return (
            <div key={section.id} className="mt-3">
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                  sectionActive ? "text-surface-300" : "text-surface-600 hover:text-surface-400"
                }`}
              >
                {section.label}
                <ChevronDown className={`w-3 h-3 transition-transform ${open ? "" : "-rotate-90"}`} />
              </button>
              {open && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {sectionItems.map((item) => renderLink(item))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className={`py-4 border-t border-surface-800 ${iconMode ? "px-2" : "px-3"}`}>
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "Expandir menú" : "Colapsar menú"}
          className="hidden lg:flex w-full items-center justify-center mb-2 text-surface-500 hover:text-surface-200 py-1.5 rounded-md hover:bg-surface-800 transition-colors"
        >
          {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>

        <div className={`rounded-md bg-surface-800 flex items-center ${iconMode ? "justify-center p-2" : "justify-between px-3 py-2"}`}>
          {!iconMode && (
            <div className="min-w-0">
              <p className="text-xs font-medium text-surface-100 truncate">{user?.username}</p>
              {roleMeta && (
                <p className={`text-[10px] font-medium ${roleMeta.className}`}>{roleMeta.text}</p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={logout}
            title="Cerrar sesión"
            className="text-surface-500 hover:text-surface-200 transition-colors flex-shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
