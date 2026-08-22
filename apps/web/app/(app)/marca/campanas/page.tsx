"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { BRAND_PANEL_NAV } from "@/lib/brands/nav";
import { brandPanelApi, type BrandCampaign } from "@/lib/brands";
import { Loader2, Plus } from "lucide-react";

export default function MarcaCampanasPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<BrandCampaign[]>([]);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setCampaigns(await brandPanelApi.campaigns()); }
    catch { showToast("Error al cargar campañas", false); }
    finally { setLoading(false); }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await brandPanelApi.createCampaign({
        name, description, startDate, endDate,
        productIds: [], distributorIds: [], attachmentUrls: [], visibleUserIds: [], status: "DRAFT",
      });
      showToast("Campaña creada");
      setModal(false);
      await load();
    } catch { showToast("Error al crear", false); }
  }

  return (
    <RoleGuard allowed={["ROLE_BRAND"]} redirectTo="/marcas">
      <BrandModuleShell title="Campañas comerciales" nav={BRAND_PANEL_NAV}
        headerAction={
          <button onClick={() => setModal(true)} className="flex items-center gap-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg px-3.5 py-2">
            <Plus className="w-3.5 h-3.5" /> Nueva campaña
          </button>
        }>
        {loading ? <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {campaigns.map((c) => (
              <div key={c.id} className="bg-surface-800 border border-surface-700 rounded-xl p-4">
                <div className="flex justify-between items-start">
                  <h3 className="font-medium text-white">{c.name}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-brand-600/15 text-brand-400">{c.status}</span>
                </div>
                <p className="text-xs text-surface-400 mt-2">{c.description}</p>
                <p className="text-[10px] text-surface-500 mt-2">
                  {new Date(c.startDate).toLocaleDateString("es-AR")} — {new Date(c.endDate).toLocaleDateString("es-AR")}
                </p>
              </div>
            ))}
            {campaigns.length === 0 && <p className="text-sm text-surface-500 col-span-2">Sin campañas.</p>}
          </div>
        )}
        {modal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <form onSubmit={create} className="bg-surface-900 border border-surface-700 rounded-xl w-full max-w-lg p-6 space-y-4">
              <h3 className="text-base font-semibold text-white">Nueva campaña</h3>
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre"
                className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white" />
              <textarea required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción" rows={3}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white" />
              <div className="grid grid-cols-2 gap-3">
                <input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white" />
                <input required type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="text-sm text-surface-400 px-4 py-2">Cancelar</button>
                <button type="submit" className="text-sm bg-brand-600 text-white px-4 py-2 rounded-lg">Crear</button>
              </div>
            </form>
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
