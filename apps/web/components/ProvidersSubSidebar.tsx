"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IMPLEMENTED_PROVIDERS, Provider, providersApi, ProviderStatus, canSyncProvider } from "@/lib/api";
import { PROVIDER_TEXT_COLOR } from "@/lib/providerColors";
import { LayoutDashboard } from "lucide-react";

type StatusMap = Partial<Record<string, ProviderStatus>>;

export default function ProvidersSubSidebar() {
  const pathname = usePathname();
  const [statuses, setStatuses] = useState<StatusMap>({});

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(IMPLEMENTED_PROVIDERS.map((p) => providersApi.status(p))).then((results) => {
      if (cancelled) return;
      const map: StatusMap = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") map[IMPLEMENTED_PROVIDERS[i]] = r.value.data;
      });
      setStatuses(map);
    });
    return () => { cancelled = true; };
  }, [pathname]);

  return (
    <aside className="hidden lg:flex flex-shrink-0 w-48 border-r border-surface-800 bg-surface-950 flex-col overflow-y-auto">
      <div className="px-3 py-4">
        <Link
          href="/proveedores"
          className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all ${
            pathname === "/proveedores"
              ? "bg-brand-600/15 text-brand-400 font-medium"
              : "text-surface-300 hover:text-white hover:bg-surface-800"
          }`}
        >
          <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
          Dashboard
        </Link>
      </div>

      <div className="px-3 pb-4 flex-1">
        <p className="px-3 text-[10px] font-semibold text-surface-600 uppercase tracking-widest mb-1.5">
          Activos — {IMPLEMENTED_PROVIDERS.length}
        </p>
        <nav className="flex flex-col gap-0.5">
          {IMPLEMENTED_PROVIDERS.map((provider) => {
            const active = pathname === `/proveedores/${provider}`;
            const s = statuses[provider];
            const dotColor = !canSyncProvider(s)
              ? "bg-surface-600"
              : s?.lastSyncedAt
              ? "bg-emerald-500"
              : "bg-amber-500";
            return (
              <Link
                key={provider}
                href={`/proveedores/${provider}`}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-all ${
                  active
                    ? "bg-brand-600/15 text-brand-400 font-semibold"
                    : "text-surface-400 hover:text-surface-100 hover:bg-surface-800"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                <span className={`truncate ${active ? "" : PROVIDER_TEXT_COLOR[provider as Provider] || ""}`}>
                  {provider.replace(/_/g, " ")}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
