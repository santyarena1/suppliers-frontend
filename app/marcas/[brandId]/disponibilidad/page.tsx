"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import AvailabilityMatrix from "@/components/brands/AvailabilityMatrix";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { USER_BRANDS_NAV } from "@/lib/brands/nav";
import {
  userBrandsApi,
  type BrandProduct,
  type ProductAvailability,
  type StockStatus,
} from "@/lib/brands";
import { STOCK_STATUSES, STOCK_STATUS_LABELS } from "@/lib/brands/constants";
import { Search, Download } from "lucide-react";

export default function DisponibilidadUsuarioPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<BrandProduct[]>([]);
  const [matrix, setMatrix] = useState<ProductAvailability[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StockStatus | "">("");
  const [distributorFilter, setDistributorFilter] = useState("");

  useEffect(() => {
    if (!brandId) return;
    async function load() {
      setLoading(true);
      try {
        const data = await userBrandsApi.availability(brandId, {
          search: search || undefined,
          status: statusFilter || undefined,
          distributorId: distributorFilter || undefined,
        });
        setProducts(data.products);
        setMatrix(data.matrix);
      } catch {
        showToast("Error al cargar disponibilidad", false);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [brandId, search, statusFilter, distributorFilter, showToast]);

  async function handleExport() {
    try {
      const res = await userBrandsApi.exportAvailability(brandId, { search: search || undefined });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `disponibilidad-${brandId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast("Exportación no disponible aún", false);
    }
  }

  const distributors = [...new Map(matrix.map((m) => [m.distributorId, m.distributorName])).entries()].map(
    ([id, name]) => ({ id, distributorId: id, distributor: { id, name, active: true, createdAt: "" }, brandId, active: true, visibleToUsers: true, createdAt: "" })
  );

  return (
    <RoleGuard allowed={["ROLE_USER", "ROLE_ADMIN"]}>
      <BrandModuleShell
        title="Mapa de Disponibilidad"
        subtitle="Estado comercial por producto y distribuidor"
        nav={USER_BRANDS_NAV}
        headerAction={
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 text-xs font-medium bg-surface-800 hover:bg-surface-700 border border-surface-700 text-surface-200 rounded-lg px-3 py-2"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar
          </button>
        }
      >
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full pl-9 pr-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white focus:border-brand-500 focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StockStatus | "")}
            className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-200 focus:border-brand-500 focus:outline-none"
          >
            <option value="">Todos los estados</option>
            {STOCK_STATUSES.map((s) => (
              <option key={s} value={s}>{STOCK_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <select
            value={distributorFilter}
            onChange={(e) => setDistributorFilter(e.target.value)}
            className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-200 focus:border-brand-500 focus:outline-none"
          >
            <option value="">Todos los distribuidores</option>
            {distributors.map((d) => (
              <option key={d.id} value={d.distributorId}>{d.distributor.name}</option>
            ))}
          </select>
        </div>

        <AvailabilityMatrix
          products={products}
          distributors={distributors}
          matrix={matrix}
          loading={loading}
        />
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
