"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import StockStatusBadge from "@/components/brands/StockStatusBadge";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { USER_BRANDS_NAV } from "@/lib/brands/nav";
import { userBrandsApi, type BrandFavorite } from "@/lib/brands";
import { Loader2, Heart, HeartOff } from "lucide-react";

export default function FavoritosPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<BrandFavorite[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setFavorites(await userBrandsApi.favorites());
    } catch {
      showToast("Error al cargar favoritos", false);
    } finally {
      setLoading(false);
    }
  }

  async function remove(brandId: string, productId: string) {
    try {
      await userBrandsApi.removeFavorite(brandId, productId);
      showToast("Eliminado de favoritos");
      await load();
    } catch {
      showToast("Error al eliminar", false);
    }
  }

  return (
    <RoleGuard allowed={["ROLE_USER", "ROLE_ADMIN"]}>
      <BrandModuleShell title="Favoritos" subtitle="Productos de marca que seguís" nav={USER_BRANDS_NAV}>
        {loading ? (
          <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
        ) : favorites.length === 0 ? (
          <div className="text-center py-20 text-surface-400 text-sm">
            <Heart className="w-10 h-10 mx-auto mb-3 text-surface-600" />
            No tenés productos favoritos. Marcá productos desde el mapa de disponibilidad.
          </div>
        ) : (
          <div className="space-y-2">
            {favorites.map((f) => (
              <div key={f.id} className="flex items-center gap-4 bg-surface-800 border border-surface-700 rounded-xl px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{f.product.commercialName}</p>
                  <p className="text-xs text-surface-500">{f.product.brandSku} · {f.product.model}</p>
                  {f.product.discontinued && <StockStatusBadge status="DISCONTINUED" />}
                </div>
                <button
                  onClick={() => remove(f.brandId, f.productId)}
                  className="text-surface-400 hover:text-red-400 p-2"
                  title="Quitar de favoritos"
                >
                  <HeartOff className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
