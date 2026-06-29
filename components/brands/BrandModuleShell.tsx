"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import MockFallbackBanner from "@/lib/brands/_dev-fallback/MockFallbackBanner";
import type { LucideIcon } from "lucide-react";

export interface ModuleNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

interface Props {
  title: string;
  subtitle?: string;
  nav: ModuleNavItem[];
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

export default function BrandModuleShell({ title, subtitle, nav, headerAction, children }: Props) {
  const pathname = usePathname();

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Navbar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 pt-12 lg:pt-0">
          <header className="flex-shrink-0 border-b border-surface-800 px-6 py-4 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-base font-semibold text-white">{title}</h1>
              {subtitle && <p className="text-xs text-surface-500 mt-0.5">{subtitle}</p>}
            </div>
            {headerAction}
          </header>

          <MockFallbackBanner />

          <div className="flex-shrink-0 border-b border-surface-800 px-6 overflow-x-auto">
            <nav className="flex gap-1 py-2 min-w-max">
              {nav.map(({ href, label, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                      active
                        ? "bg-brand-600/15 text-brand-400"
                        : "text-surface-400 hover:text-surface-100 hover:bg-surface-800"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        </div>
      </div>
    </AuthGuard>
  );
}
