"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { BRAND_PANEL_NAV } from "@/lib/brands/nav";
import { brandPanelApi, type BrandNews, type BrandNewsInput } from "@/lib/brands";
import { NEWS_TYPES, NEWS_TYPE_LABELS } from "@/lib/brands/constants";
import { Loader2, Plus } from "lucide-react";

const empty: BrandNewsInput = { title: "", description: "", type: "COMMERCIAL_NOTICE", status: "DRAFT" };

export default function MarcaNovedadesPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [news, setNews] = useState<BrandNews[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<BrandNewsInput>(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setNews(await brandPanelApi.news()); }
    catch { showToast("Error al cargar", false); }
    finally { setLoading(false); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await brandPanelApi.createNews(form);
      showToast("Novedad creada");
      setModal(false);
      setForm(empty);
      await load();
    } catch { showToast("Error al guardar", false); }
    finally { setSaving(false); }
  }

  return (
    <RoleGuard allowed={["ROLE_BRAND"]} redirectTo="/marcas">
      <BrandModuleShell title="Novedades" subtitle="Publicaciones para usuarios autorizados" nav={BRAND_PANEL_NAV}
        headerAction={
          <button onClick={() => setModal(true)} className="flex items-center gap-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg px-3.5 py-2">
            <Plus className="w-3.5 h-3.5" /> Nueva novedad
          </button>
        }>
        {loading ? <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : (
          <div className="space-y-3">
            {news.map((n) => (
              <article key={n.id} className="bg-surface-800 border border-surface-700 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-brand-600/15 text-brand-400">{NEWS_TYPE_LABELS[n.type]}</span>
                  <span className="text-[10px] text-surface-500">{n.status}</span>
                </div>
                <h3 className="text-sm font-semibold text-white">{n.title}</h3>
                <p className="text-xs text-surface-400 mt-1">{n.description}</p>
              </article>
            ))}
            {news.length === 0 && <p className="text-sm text-surface-500">Sin novedades publicadas.</p>}
          </div>
        )}
        {modal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <form onSubmit={save} className="bg-surface-900 border border-surface-700 rounded-xl w-full max-w-lg p-6 space-y-4">
              <h3 className="text-base font-semibold text-white">Nueva novedad</h3>
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Título" className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white" />
              <textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descripción" rows={4} className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white" />
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as BrandNewsInput["type"] })}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white">
                {NEWS_TYPES.map((t) => <option key={t} value={t}>{NEWS_TYPE_LABELS[t]}</option>)}
              </select>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as BrandNewsInput["status"] })}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white">
                <option value="DRAFT">Borrador</option>
                <option value="PUBLISHED">Publicado</option>
              </select>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="text-sm text-surface-400 px-4 py-2">Cancelar</button>
                <button type="submit" disabled={saving} className="text-sm bg-brand-600 text-white px-4 py-2 rounded-lg disabled:opacity-50">Guardar</button>
              </div>
            </form>
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
