"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import StockStatusBadge from "@/components/brands/StockStatusBadge";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { USER_BRANDS_NAV } from "@/lib/brands/nav";
import { userBrandsApi, type BrandProduct, type ProductAvailability } from "@/lib/brands";
import { Loader2 } from "lucide-react";

export default function ComparadorPage() {
  const { toast, showToast } = useToast();
  const [brands, setBrands] = useState<{ brandId: string; brandName?: string }[]>([]);
  const [brandId, setBrandId] = useState("");
  const [products, setProducts] = useState<BrandProduct[]>([]);
  const [productId, setProductId] = useState("");
  const [availability, setAvailability] = useState<ProductAvailability[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    userBrandsApi.authorized().then((b) => {
      setBrands(b.map((x) => ({ brandId: x.brandId, brandName: x.brandName })));
      if (b[0]) setBrandId(b[0].brandId);
    }).catch(() => showToast("Error al cargar marcas", false));
  }, []);

  useEffect(() => {
    if (!brandId) return;
    userBrandsApi.products(brandId, { pageSize: 200 }).then((r) => setProducts(r.items)).catch(() => {});
  }, [brandId]);

  async function compare() {
    if (!brandId || !productId) return;
    setLoading(true);
    try {
      setAvailability(await userBrandsApi.compareAvailability(brandId, productId));
    } catch {
      showToast("Error al comparar", false);
    } finally {
      setLoading(false);
    }
  }

  const selected = products.find((p) => p.id === productId);

  return (
    <RoleGuard allowed={["ROLE_USER", "ROLE_ADMIN"]}>
      <BrandModuleShell title="Comparador por distribuidor" subtitle="Estado de un producto en cada canal" nav={USER_BRANDS_NAV}>
        <div className="flex flex-wrap gap-3 mb-6">
          <select value={brandId} onChange={(e) => { setBrandId(e.target.value); setProductId(""); setAvailability([]); }}
            className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-200 min-w-[180px]">
            {brands.map((b) => <option key={b.brandId} value={b.brandId}>{b.brandName}</option>)}
          </select>
          <select value={productId} onChange={(e) => setProductId(e.target.value)}
            className="flex-1 min-w-[240px] bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-200">
            <option value="">Seleccionar producto...</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.commercialName} ({p.brandSku})</option>)}
          </select>
          <button onClick={compare} disabled={!productId || loading}
            className="bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
            Comparar
          </button>
        </div>

        {loading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>}

        {selected && availability.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">{selected.commercialName}</h3>
            <p className="text-xs text-surface-500 mb-4">{selected.model} · {selected.brandSku}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {availability.map((a) => (
                <div key={a.id} className="bg-surface-800 border border-surface-700 rounded-xl p-4">
                  <p className="font-medium text-white text-sm">{a.distributorName}</p>
                  <div className="mt-2"><StockStatusBadge status={a.status} size="md" /></div>
                  {a.estimatedQuantity != null && (
                    <p className="text-xs text-surface-400 mt-2">Cant. est.: {a.estimatedQuantity}</p>
                  )}
                  {a.estimatedArrivalDate && (
                    <p className="text-xs text-surface-400">Ingreso: {new Date(a.estimatedArrivalDate).toLocaleDateString("es-AR")}</p>
                  )}
                  {a.notes && <p className="text-xs text-surface-500 mt-2">{a.notes}</p>}
                  <p className="text-[10px] text-surface-600 mt-2">
                    Actualizado: {new Date(a.updatedAt).toLocaleString("es-AR")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
