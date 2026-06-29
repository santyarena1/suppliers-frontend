"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import StatCard from "@/components/brands/StatCard";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { ADMIN_MARCAS_NAV } from "@/lib/brands/nav";
import { adminBrandsApi } from "@/lib/brands";
import { Loader2 } from "lucide-react";

export default function AdminMarcasHomePage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Record<string, number>>({});

  useEffect(() => {
    adminBrandsApi.metrics()
      .then(setMetrics)
      .catch(() => showToast("Error al cargar métricas", false))
      .finally(() => setLoading(false));
  }, []);

  return (
    <RoleGuard allowed={["ROLE_ADMIN"]}>
      <BrandModuleShell title="Administración de Marcas" subtitle="Control del módulo B2B" nav={ADMIN_MARCAS_NAV}>
        {loading ? (
          <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Marcas registradas" value={metrics.brandCount ?? 0} />
            <StatCard label="Distribuidores" value={metrics.distributorCount ?? 0} />
            <StatCard label="Accesos activos" value={metrics.activeAccessCount ?? 0} accent="success" />
            <StatCard label="Importaciones (30d)" value={metrics.importsLast30Days ?? 0} />
            <StatCard label="Productos totales" value={metrics.productCount ?? 0} />
            <StatCard label="Invitaciones pendientes" value={metrics.pendingInvitations ?? 0} accent="warning" />
            <StatCard label="Accesos bloqueados" value={metrics.blockedAccessCount ?? 0} accent="danger" />
            <StatCard label="Usuarios con marcas" value={metrics.usersWithBrands ?? 0} />
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
