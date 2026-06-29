"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import StatCard from "@/components/brands/StatCard";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { USER_BRANDS_NAV } from "@/lib/brands/nav";
import { userBrandsApi, type UserBrandDashboard, type BrandAccess } from "@/lib/brands";
import { ACCESS_STATUS_LABELS } from "@/lib/brands/constants";
import { Loader2, ChevronRight, Building2 } from "lucide-react";

export default function MarcasHomePage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<UserBrandDashboard | null>(null);
  const [brands, setBrands] = useState<BrandAccess[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [dash, auth] = await Promise.all([
          userBrandsApi.dashboard(),
          userBrandsApi.authorized(),
        ]);
        setDashboard(dash);
        setBrands(auth);
      } catch {
        try {
          const auth = await userBrandsApi.authorized();
          setBrands(auth);
        } catch {
          showToast("Error al cargar el portal de marcas", false);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [showToast]);

  return (
    <RoleGuard allowed={["ROLE_USER", "ROLE_ADMIN"]}>
      <BrandModuleShell
        title="Portal de Marcas"
        subtitle="Información comercial de marcas que te autorizaron"
        nav={USER_BRANDS_NAV}
      >
        {loading ? (
          <div className="flex justify-center py-32">
            <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
          </div>
        ) : brands.length === 0 ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <Building2 className="w-12 h-12 text-surface-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">Sin marcas autorizadas</h2>
            <p className="text-sm text-surface-400 leading-relaxed">
              Solo podés ver marcas que te invitaron explícitamente. Revisá tu bandeja de invitaciones
              o contactá a tus representantes comerciales.
            </p>
            <Link
              href="/marcas/invitaciones"
              className="inline-block mt-6 text-sm text-brand-400 hover:text-brand-300 font-medium"
            >
              Ver invitaciones pendientes →
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {dashboard && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Marcas autorizadas" value={brands.length} />
                <StatCard
                  label="Alertas sin leer"
                  value={dashboard.unreadNotifications}
                  accent={dashboard.unreadNotifications > 0 ? "warning" : "default"}
                />
                <StatCard label="Campañas activas" value={dashboard.activeCampaigns.length} accent="success" />
                <StatCard label="Novedades recientes" value={dashboard.recentNews.length} />
              </div>
            )}

            <section>
              <h2 className="text-sm font-semibold text-white mb-3">Mis marcas autorizadas</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {brands.map((b) => (
                  <Link
                    key={b.brandId}
                    href={`/marcas/${b.brandId}`}
                    className="group flex items-center gap-4 bg-surface-800 border border-surface-700 rounded-xl p-4 hover:border-brand-500/40 transition-all"
                  >
                    {b.brandLogoUrl ? (
                      <img src={b.brandLogoUrl} alt="" className="w-12 h-12 rounded-lg object-contain bg-white/5" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-brand-600/20 flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-brand-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">{b.brandName ?? "Marca"}</p>
                      <p className="text-[10px] text-surface-500 mt-0.5">
                        {ACCESS_STATUS_LABELS[b.status]}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-surface-500 group-hover:text-brand-400" />
                  </Link>
                ))}
              </div>
            </section>

            {dashboard && dashboard.recentNews.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white">Novedades recientes</h2>
                  <Link href="/marcas/novedades" className="text-xs text-brand-400 hover:text-brand-300">
                    Ver todas
                  </Link>
                </div>
                <div className="space-y-2">
                  {dashboard.recentNews.slice(0, 5).map((n) => (
                    <div key={n.id} className="bg-surface-800 border border-surface-700 rounded-lg px-4 py-3">
                      <p className="text-sm font-medium text-white">{n.title}</p>
                      <p className="text-xs text-surface-400 mt-1 line-clamp-2">{n.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
