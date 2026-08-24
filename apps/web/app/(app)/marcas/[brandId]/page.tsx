"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import StatCard from "@/components/brands/StatCard";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { USER_BRANDS_NAV } from "@/lib/brands/nav";
import { userBrandsApi, type BrandAccount } from "@/lib/brands";
import { assetUrl } from "@/lib/assets";
import { Loader2, Grid3X3, Newspaper, Megaphone, FolderOpen, GraduationCap } from "lucide-react";

export default function MarcaDetallePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState<BrandAccount | null>(null);

  useEffect(() => {
    if (!brandId) return;
    async function load() {
      setLoading(true);
      try {
        const data = await userBrandsApi.getBrand(brandId);
        setBrand(data);
      } catch {
        showToast("No tenés acceso a esta marca o no existe", false);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [brandId, showToast]);

  const sections = [
    { href: `/marcas/${brandId}/disponibilidad`, label: "Mapa de disponibilidad", icon: Grid3X3 },
    { href: "/marcas/novedades", label: "Novedades", icon: Newspaper },
    { href: "/marcas/favoritos", label: "Favoritos", icon: Megaphone },
    { href: "/marcas/comparador", label: "Comparador", icon: FolderOpen },
    { href: "/marcas/alertas", label: "Alertas", icon: GraduationCap },
  ];

  return (
    <RoleGuard allowed={["ROLE_USER", "ROLE_ADMIN"]}>
      <BrandModuleShell
        title={brand?.name ?? "Marca"}
        subtitle={brand?.description ?? "Resumen comercial"}
        nav={USER_BRANDS_NAV}
      >
        {loading ? (
          <div className="flex justify-center py-32">
            <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
          </div>
        ) : !brand ? (
          <div className="text-center py-20 text-surface-400 text-sm">
            Marca no disponible.{" "}
            <Link href="/marcas" className="text-brand-400 hover:underline">
              Volver al inicio
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start gap-5">
              {brand.logoUrl && (
                <img src={assetUrl(brand.logoUrl)} alt="" className="w-20 h-20 rounded-xl object-contain bg-white/5 border border-surface-700" />
              )}
              <div>
                <h2 className="text-xl font-semibold text-white">{brand.name}</h2>
                {brand.description && <p className="text-sm text-surface-400 mt-2 max-w-2xl">{brand.description}</p>}
                {brand.contactEmail && (
                  <p className="text-xs text-surface-500 mt-2">Contacto: {brand.contactEmail}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Estado" value={brand.active && !brand.suspended ? "Activa" : "Inactiva"} />
              <StatCard label="Actualización" value={new Date(brand.updatedAt).toLocaleDateString("es-AR")} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sections.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 bg-surface-800 border border-surface-700 rounded-xl px-4 py-4 hover:border-brand-500/40 transition-all"
                >
                  <Icon className="w-5 h-5 text-brand-400" />
                  <span className="text-sm font-medium text-white">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
