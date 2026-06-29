"use client";

import { useEffect, useState, useCallback } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import AvailabilityMatrix from "@/components/brands/AvailabilityMatrix";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { BRAND_PANEL_NAV } from "@/lib/brands/nav";
import {
  brandPanelApi,
  type BrandProduct,
  type BrandDistributor,
  type ProductAvailability,
  type AvailabilityInput,
  type StockStatus,
} from "@/lib/brands";
import { Save } from "lucide-react";

export default function MarcaDisponibilidadPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<BrandProduct[]>([]);
  const [distributors, setDistributors] = useState<BrandDistributor[]>([]);
  const [matrix, setMatrix] = useState<ProductAvailability[]>([]);
  const [pending, setPending] = useState<Map<string, StockStatus>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await brandPanelApi.availability();
      setProducts(data.products);
      setDistributors(data.distributors);
      setMatrix(data.matrix);
      setPending(new Map());
    } catch {
      showToast("Error al cargar disponibilidad", false);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  function handleCellChange(productId: string, distributorId: string, status: StockStatus) {
    const key = `${productId}:${distributorId}`;
    setPending((prev) => new Map(prev).set(key, status));
  }

  async function saveChanges() {
    if (pending.size === 0) return;
    setSaving(true);
    try {
      const items: AvailabilityInput[] = [];
      pending.forEach((status, key) => {
        const [productId, distributorId] = key.split(":");
        items.push({ productId, distributorId, status });
      });
      await brandPanelApi.bulkUpdateAvailability(items);
      showToast(`${items.length} celdas actualizadas`);
      await load();
    } catch {
      showToast("Error al guardar", false);
    } finally {
      setSaving(false);
    }
  }

  const displayMatrix = matrix.map((m) => {
    const key = `${m.productId}:${m.distributorId}`;
    const pendingStatus = pending.get(key);
    return pendingStatus ? { ...m, status: pendingStatus } : m;
  });

  return (
    <RoleGuard allowed={["ROLE_BRAND"]} redirectTo="/marcas">
      <BrandModuleShell
        title="Mapa de Disponibilidad"
        subtitle="Estado comercial por producto y distribuidor"
        nav={BRAND_PANEL_NAV}
        headerAction={
          pending.size > 0 ? (
            <button onClick={saveChanges} disabled={saving}
              className="flex items-center gap-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg px-3.5 py-2 disabled:opacity-50">
              <Save className="w-3.5 h-3.5" />
              {saving ? "Guardando..." : `Guardar (${pending.size})`}
            </button>
          ) : undefined
        }
      >
        <AvailabilityMatrix
          products={products}
          distributors={distributors}
          matrix={displayMatrix}
          loading={loading}
          editable
          onCellChange={handleCellChange}
        />
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
