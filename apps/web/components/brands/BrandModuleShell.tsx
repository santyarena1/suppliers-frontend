"use client";

import ContextNav, { type ContextNavItem } from "@/components/layout/ContextNav";
import MockFallbackBanner from "@/lib/brands/_dev-fallback/MockFallbackBanner";

export type ModuleNavItem = ContextNavItem;

interface Props {
  title: string;
  subtitle?: string;
  nav: ContextNavItem[];
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

export default function BrandModuleShell({ title, subtitle, nav, headerAction, children }: Props) {
  return (
    <ContextNav items={nav}>
      <header className="flex-shrink-0 border-b border-surface-800 px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-white">{title}</h1>
          {subtitle && <p className="text-xs text-surface-500 mt-0.5">{subtitle}</p>}
        </div>
        {headerAction}
      </header>

      <MockFallbackBanner />

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">{children}</div>
    </ContextNav>
  );
}
