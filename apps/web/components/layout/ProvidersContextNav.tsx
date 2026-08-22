"use client";

import { LayoutDashboard } from "lucide-react";
import { IMPLEMENTED_PROVIDERS, canSyncProvider, type Provider, type ProviderStatus } from "@/lib/api";
import { PROVIDER_TEXT_COLOR } from "@/lib/providerColors";
import { useProviderStatuses } from "@/lib/providerStatus";
import ContextNav, { type ContextNavItem } from "./ContextNav";

function dotFor(status?: ProviderStatus) {
  if (!canSyncProvider(status)) return "bg-surface-600";
  if (status?.lastSyncedAt) return "bg-emerald-500";
  return "bg-amber-500";
}

export default function ProvidersContextNav({ children }: { children: React.ReactNode }) {
  const statuses = useProviderStatuses();

  const items: ContextNavItem[] = [
    { href: "/proveedores", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "#activos", label: `Activos — ${IMPLEMENTED_PROVIDERS.length}`, kind: "heading" },
    ...IMPLEMENTED_PROVIDERS.map((provider) => ({
      href: `/proveedores/${provider}`,
      label: provider.replace(/_/g, " "),
      exact: true,
      dotClass: dotFor(statuses[provider]),
      colorClass: PROVIDER_TEXT_COLOR[provider as Provider] || "",
    })),
  ];

  return <ContextNav items={items}>{children}</ContextNav>;
}
