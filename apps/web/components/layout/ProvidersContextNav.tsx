"use client";

import { LayoutDashboard } from "lucide-react";
import { canSyncProvider, type Provider, type ProviderStatus } from "@/lib/api";
import { useMyProviders } from "@/lib/myProviders";
import { useProviderStatuses } from "@/lib/providerStatus";
import ContextNav, { type ContextNavItem } from "./ContextNav";

function dotFor(status?: ProviderStatus) {
  if (!canSyncProvider(status)) return "bg-surface-600";
  if (status?.lastSyncedAt) return "bg-emerald-500";
  return "bg-amber-500";
}

export default function ProvidersContextNav({ children }: { children: React.ReactNode }) {
  const statuses = useProviderStatuses();
  const { providers } = useMyProviders();
  const linked = providers.filter((p) => p.linked);

  const items: ContextNavItem[] = [
    { href: "/proveedores", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "#activos", label: `Activos — ${linked.length}`, kind: "heading" },
    ...linked.map(({ provider, name }) => ({
      href: `/proveedores/${provider}`,
      label: name,
      exact: true,
      provider,
      dotClass: dotFor(statuses[provider as Provider]),
    })),
  ];

  return <ContextNav items={items}>{children}</ContextNav>;
}
