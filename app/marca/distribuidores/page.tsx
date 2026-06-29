"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { BRAND_PANEL_NAV } from "@/lib/brands/nav";
import { brandPanelApi, adminBrandsApi, type BrandDistributor } from "@/lib/brands";
import { Loader2, Plus } from "lucide-react";

export default function MarcaDistribuidoresPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [distributors, setDistributors] = useState<BrandDistributor[]>([]);
  const [global, setGlobal] = useState<{ id: string; name: string }[]>([]);
  const [linkId, setLinkId] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [mine, all] = await Promise.all([
        brandPanelApi.distributors(),
        adminBrandsApi.distributors().catch(() => []),
      ]);
      setDistributors(mine);
      setGlobal(all);
    } catch {
      showToast("Error al cargar distribuidores", false);
    } finally {
      setLoading(false);
    }
  }

  async function link() {
    if (!linkId) return;
    try {
      await brandPanelApi.linkDistributor(linkId);
      showToast("Distribuidor vinculado");
      setLinkId("");
      await load();
    } catch {
      showToast("Error al vincular", false);
    }
  }

  async function toggle(id: string, field: "active" | "visibleToUsers", value: boolean) {
    try {
      await brandPanelApi.updateBrandDistributor(id, { [field]: value });
      await load();
    } catch {
      showToast("Error al actualizar", false);
    }
  }

  const unlinked = global.filter((g) => !distributors.some((d) => d.distributorId === g.id));

  return (
    <RoleGuard allowed={["ROLE_BRAND"]} redirectTo="/marcas">
      <BrandModuleShell title="Distribuidores" subtitle="Canales asociados a tu marca" nav={BRAND_PANEL_NAV}>
        {unlinked.length > 0 && (
          <div className="flex gap-2 mb-5">
            <select value={linkId} onChange={(e) => setLinkId(e.target.value)}
              className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-200">
              <option value="">Agregar distribuidor existente...</option>
              {unlinked.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button onClick={link} className="flex items-center gap-1 bg-brand-600 hover:bg-brand-500 text-white text-sm px-4 py-2 rounded-lg">
              <Plus className="w-4 h-4" /> Vincular
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
        ) : (
          <div className="space-y-2">
            {distributors.map((d) => (
              <div key={d.id} className="flex items-center gap-4 bg-surface-800 border border-surface-700 rounded-xl px-4 py-3">
                <div className="flex-1">
                  <p className="font-medium text-white">{d.distributor.name}</p>
                  {d.commercialNotes && <p className="text-xs text-surface-500 mt-1">{d.commercialNotes}</p>}
                </div>
                <label className="flex items-center gap-2 text-xs text-surface-300">
                  <input type="checkbox" checked={d.active} onChange={(e) => toggle(d.id, "active", e.target.checked)} />
                  Activo
                </label>
                <label className="flex items-center gap-2 text-xs text-surface-300">
                  <input type="checkbox" checked={d.visibleToUsers} onChange={(e) => toggle(d.id, "visibleToUsers", e.target.checked)} />
                  Visible
                </label>
              </div>
            ))}
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
