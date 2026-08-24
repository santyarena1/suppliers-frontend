"use client";

import { useEffect, useState, useRef } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { BRAND_PANEL_NAV } from "@/lib/brands/nav";
import { brandPanelApi, type BrandAccount } from "@/lib/brands";
import { assetsApi } from "@/lib/api";
import { assetUrl } from "@/lib/assets";
import { Loader2, Upload } from "lucide-react";

export default function MarcaPerfilPage() {
  const { toast, showToast } = useToast();
  const logoRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<BrandAccount | null>(null);
  const [form, setForm] = useState({ description: "", commercialData: "", contactEmail: "", contactPhone: "", website: "" });

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const p = await brandPanelApi.profile();
        setProfile(p);
        setForm({
          description: p.description ?? "",
          commercialData: p.commercialData ?? "",
          contactEmail: p.contactEmail ?? "",
          contactPhone: p.contactPhone ?? "",
          website: p.website ?? "",
        });
      } catch {
        showToast("Error al cargar perfil", false);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [showToast]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await brandPanelApi.updateProfile(form);
      setProfile(updated);
      showToast("Perfil actualizado");
    } catch { showToast("Error al guardar", false); }
    finally { setSaving(false); }
  }

  async function uploadLogo(file: File) {
    try {
      const { url } = await assetsApi.upload(file);
      const updated = await brandPanelApi.updateProfile({ logoUrl: url });
      setProfile(updated);
      showToast("Logo actualizado");
    } catch { showToast("Error al subir logo", false); }
  }

  return (
    <RoleGuard allowed={["ROLE_BRAND"]} redirectTo="/marcas">
      <BrandModuleShell title="Perfil de marca" nav={BRAND_PANEL_NAV}>
        {loading ? <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : profile && (
          <form onSubmit={save} className="max-w-xl space-y-5">
            <div className="flex items-center gap-4">
              {profile.logoUrl ? (
                <img src={assetUrl(profile.logoUrl)} alt="" className="w-20 h-20 rounded-xl object-contain bg-white/5 border border-surface-700" />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-surface-800 border border-surface-700" />
              )}
              <div>
                <p className="font-semibold text-white text-lg">{profile.name}</p>
                <input ref={logoRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
                <button type="button" onClick={() => logoRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-brand-400 hover:underline mt-1">
                  <Upload className="w-3 h-3" /> Cambiar logo
                </button>
              </div>
            </div>
            {(["description", "commercialData", "contactEmail", "contactPhone", "website"] as const).map((field) => (
              <div key={field}>
                <label className="text-xs text-surface-400 block mb-1">{field}</label>
                {field === "description" || field === "commercialData" ? (
                  <textarea value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} rows={3}
                    className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white focus:border-brand-500 focus:outline-none" />
                ) : (
                  <input value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white focus:border-brand-500 focus:outline-none" />
                )}
              </div>
            ))}
            <button type="submit" disabled={saving}
              className="bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </form>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
