"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { BRAND_PANEL_NAV } from "@/lib/brands/nav";
import { brandPanelApi, type BrandTraining } from "@/lib/brands";
import { TRAINING_TYPES } from "@/lib/brands/constants";
import { Loader2, Plus, ExternalLink } from "lucide-react";

export default function MarcaCapacitacionesPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [trainings, setTrainings] = useState<BrandTraining[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", type: "VIDEO" as const, contentUrl: "", description: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setTrainings(await brandPanelApi.trainings()); }
    catch { showToast("Error al cargar", false); }
    finally { setLoading(false); }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await brandPanelApi.createTraining({ ...form, productIds: [] });
      showToast("Capacitación creada");
      setModal(false);
      await load();
    } catch { showToast("Error", false); }
  }

  return (
    <RoleGuard allowed={["ROLE_BRAND"]} redirectTo="/marcas">
      <BrandModuleShell title="Capacitaciones" subtitle="Material para vendedores" nav={BRAND_PANEL_NAV}
        headerAction={
          <button onClick={() => setModal(true)} className="flex items-center gap-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg px-3.5 py-2">
            <Plus className="w-3.5 h-3.5" /> Agregar
          </button>
        }>
        {loading ? <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {trainings.map((t) => (
              <div key={t.id} className="bg-surface-800 border border-surface-700 rounded-xl p-4">
                <p className="font-medium text-white">{t.title}</p>
                <p className="text-xs text-surface-500 mt-1">{t.type}</p>
                {t.description && <p className="text-xs text-surface-400 mt-2">{t.description}</p>}
                <a href={t.contentUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-brand-400 mt-3 hover:underline">
                  <ExternalLink className="w-3 h-3" /> Abrir contenido
                </a>
              </div>
            ))}
            {trainings.length === 0 && <p className="text-sm text-surface-500">Sin capacitaciones.</p>}
          </div>
        )}
        {modal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <form onSubmit={create} className="bg-surface-900 border border-surface-700 rounded-xl w-full max-w-lg p-6 space-y-4">
              <h3 className="text-base font-semibold text-white">Nueva capacitación</h3>
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Título"
                className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white" />
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white">
                {TRAINING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input required value={form.contentUrl} onChange={(e) => setForm({ ...form, contentUrl: e.target.value })} placeholder="URL del contenido"
                className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white" />
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descripción" rows={2}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="text-sm text-surface-400 px-4 py-2">Cancelar</button>
                <button type="submit" className="text-sm bg-brand-600 text-white px-4 py-2 rounded-lg">Guardar</button>
              </div>
            </form>
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
