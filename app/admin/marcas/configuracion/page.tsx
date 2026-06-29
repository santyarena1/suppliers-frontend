"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { ADMIN_MARCAS_NAV } from "@/lib/brands/nav";
import { adminBrandsApi, type Category } from "@/lib/brands";
import { STOCK_STATUSES, STOCK_STATUS_LABELS } from "@/lib/brands/constants";
import { Loader2, Plus } from "lucide-react";

export default function AdminConfiguracionPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setCategories(await adminBrandsApi.categories()); }
    catch { showToast("Error al cargar categorías", false); }
    finally { setLoading(false); }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await adminBrandsApi.createCategory({ name });
      showToast("Categoría creada");
      setName("");
      await load();
    } catch { showToast("Error", false); }
  }

  return (
    <RoleGuard allowed={["ROLE_ADMIN"]}>
      <BrandModuleShell title="Configuración general" nav={ADMIN_MARCAS_NAV}>
        <section className="mb-10">
          <h3 className="text-sm font-semibold text-white mb-3">Categorías de producto</h3>
          <form onSubmit={create} className="flex gap-2 mb-4">
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva categoría"
              className="flex-1 px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white" />
            <button type="submit" className="flex items-center gap-1 bg-brand-600 hover:bg-brand-500 text-white text-sm px-4 py-2 rounded-lg">
              <Plus className="w-4 h-4" /> Agregar
            </button>
          </form>
          {loading ? <Loader2 className="w-5 h-5 animate-spin text-brand-500" /> : (
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <span key={c.id} className="text-xs px-2.5 py-1 rounded-lg bg-surface-800 border border-surface-700 text-surface-300">
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-white mb-3">Estados de disponibilidad permitidos</h3>
          <div className="flex flex-wrap gap-2">
            {STOCK_STATUSES.map((s) => (
              <span key={s} className="text-[10px] px-2 py-1 rounded border border-surface-700 text-surface-400">
                {STOCK_STATUS_LABELS[s]}
              </span>
            ))}
          </div>
        </section>
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
