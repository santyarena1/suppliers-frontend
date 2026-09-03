"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { isNavItemActive } from "@/lib/nav";
import ProviderBadge from "@/components/ProviderBadge";

export interface ContextNavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  exact?: boolean;
  dotClass?: string;
  colorClass?: string;
  /** Si está, muestra logo+color admin del proveedor. */
  provider?: string;
  kind?: "link" | "heading";
}

interface Props {
  items: ContextNavItem[];
  children: React.ReactNode;
}

export default function ContextNav({ items, children }: Props) {
  const pathname = usePathname();

  function itemClass(active: boolean, extra = "") {
    return `flex items-center gap-2 rounded-md transition-all ${
      active
        ? "bg-brand-600/15 text-brand-400 font-medium"
        : `text-surface-400 hover:text-surface-100 hover:bg-surface-800 ${extra}`
    }`;
  }

  function renderLabel(item: ContextNavItem, active: boolean, compact = false) {
    if (item.provider) {
      return (
        <ProviderBadge
          provider={item.provider}
          label={item.label}
          variant={compact ? "logo-only" : "inline"}
          size="sm"
          className="!gap-1.5 min-w-0"
          nameClassName={active ? "!text-brand-400" : ""}
        />
      );
    }
    return (
      <span className={`truncate ${!active && item.colorClass ? item.colorClass : ""}`}>
        {item.label}
      </span>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <aside className="hidden lg:flex flex-shrink-0 w-52 border-r border-surface-800 bg-surface-950 flex-col overflow-y-auto">
        <nav className="px-3 py-4 flex flex-col gap-0.5">
          {items.map((item) => {
            if (item.kind === "heading") {
              return (
                <p key={item.href} className="px-3 pt-3 pb-1 text-[10px] font-semibold text-surface-600 uppercase tracking-widest">
                  {item.label}
                </p>
              );
            }
            const active = isNavItemActive(item, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${itemClass(active)} px-3 py-1.5 text-xs`}
              >
                {item.dotClass && (
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.dotClass}`} />
                )}
                {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                {renderLabel(item, active)}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="lg:hidden flex-shrink-0 border-b border-surface-800 px-3 py-2 overflow-x-auto bg-surface-950">
          <nav className="flex gap-1 min-w-max">
            {items.filter((item) => item.kind !== "heading").map((item) => {
              const active = isNavItemActive(item, pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${itemClass(active)} min-h-10 px-3 py-2 text-xs whitespace-nowrap`}
                >
                  {item.dotClass && (
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.dotClass}`} />
                  )}
                  {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                  {renderLabel(item, active, true)}
                </Link>
              );
            })}
          </nav>
        </div>
        {children}
      </div>
    </div>
  );
}
