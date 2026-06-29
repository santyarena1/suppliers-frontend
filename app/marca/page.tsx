"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import StatCard from "@/components/brands/StatCard";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { BRAND_PANEL_NAV } from "@/lib/brands/nav";
import { brandPanelApi, type BrandDashboardStats } from "@/lib/brands";
import { Loader2, AlertTriangle } from "lucide-react";

export default function MarcaDashboardPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<BrandDashboardStats | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        setStats(await brandPanelApi.dashboard());
      } catch {
        showToast("Error al cargar dashboard", false);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [showToast]);

  return (
    <RoleGuard allowed={["ROLE_BRAND"]} redirectTo="/marcas">
      <BrandModuleShell title="Panel de Marca" subtitle="Resumen operativo y comercial" nav={BRAND_PANEL_NAV}>
        {loading ? (
          <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
        ) : stats ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Productos" value={stats.productCount} />
              <StatCard label="Distribuidores activos" value={stats.activeDistributors} />
              <StatCard label="Usuarios autorizados" value={stats.authorizedUsers} accent="success" />
              <StatCard label="Invitaciones pendientes" value={stats.pendingInvitations} accent="warning" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Stock crítico" value={stats.criticalStockCount} accent="danger" />
              <StatCard label="Sin stock" value={stats.outOfStockCount} accent="danger" />
              <StatCard label="Próximos ingresos" value={stats.incomingCount} accent="success" />
              <StatCard label="Discontinuados" value={stats.discontinuedCount} />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard label="Lanzamientos activos" value={stats.activeLaunches} />
              <StatCard label="Campañas activas" value={stats.activeCampaigns} />
              <StatCard label="Materiales" value={stats.materialsCount} />
            </div>

            {stats.lastAvailabilityUpdate && (
              <p className="text-xs text-surface-500">
                Última actualización de disponibilidad:{" "}
                {new Date(stats.lastAvailabilityUpdate).toLocaleString("es-AR")}
              </p>
            )}

            {stats.alerts.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" /> Alertas importantes
                </h2>
                <div className="space-y-2">
                  {stats.alerts.map((a, i) => (
                    <div key={i} className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-4 py-3 text-sm text-yellow-200/90">
                      {a.message}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/marca/disponibilidad" className="text-sm text-brand-400 hover:underline">Actualizar mapa de disponibilidad →</Link>
              <Link href="/marca/importaciones" className="text-sm text-brand-400 hover:underline">Importar Excel/CSV →</Link>
              <Link href="/marca/usuarios" className="text-sm text-brand-400 hover:underline">Invitar usuarios →</Link>
            </div>
          </div>
        ) : (
          <p className="text-center py-20 text-surface-400 text-sm">No se pudo cargar el dashboard.</p>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
