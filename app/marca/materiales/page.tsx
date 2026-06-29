"use client";

import { useEffect, useState, useRef } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { BRAND_PANEL_NAV } from "@/lib/brands/nav";
import { brandPanelApi, type BrandMaterial } from "@/lib/brands";
import { MATERIAL_TYPES, MATERIAL_TYPE_LABELS } from "@/lib/brands/constants";
import { Loader2, Upload, Download, Trash2 } from "lucide-react";

export default function MarcaMaterialesPage() {
  const { toast, showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<BrandMaterial[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("CATALOG");
  const [uploading, setUploading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setMaterials(await brandPanelApi.materials()); }
    catch { showToast("Error al cargar", false); }
    finally { setLoading(false); }
  }

  async function upload(file: File) {
    if (!title.trim()) { showToast("Ingresá un título", false); return; }
    setUploading(true);
    try {
      await brandPanelApi.uploadMaterial({ title, type }, file);
      showToast("Material subido");
      setTitle("");
      await load();
    } catch { showToast("Error al subir", false); }
    finally { setUploading(false); }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar material?")) return;
    try { await brandPanelApi.deleteMaterial(id); showToast("Eliminado"); await load(); }
    catch { showToast("Error", false); }
  }

  return (
    <RoleGuard allowed={["ROLE_BRAND"]} redirectTo="/marcas">
      <BrandModuleShell title="Marketing y materiales" nav={BRAND_PANEL_NAV}>
        <div className="bg-surface-800 border border-surface-700 rounded-xl p-4 mb-6 space-y-3">
          <div className="flex flex-wrap gap-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del material"
              className="flex-1 min-w-[200px] px-3 py-2 bg-surface-900 border border-surface-700 rounded-lg text-sm text-white" />
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="px-3 py-2 bg-surface-900 border border-surface-700 rounded-lg text-sm text-white">
              {MATERIAL_TYPES.map((t) => <option key={t} value={t}>{MATERIAL_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Subir archivo
          </button>
        </div>

        {loading ? <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : (
          <div className="space-y-2">
            {materials.map((m) => (
              <div key={m.id} className="flex items-center gap-3 bg-surface-800 border border-surface-700 rounded-lg px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{m.title}</p>
                  <p className="text-xs text-surface-500">{MATERIAL_TYPE_LABELS[m.type]} · {new Date(m.createdAt).toLocaleDateString("es-AR")}</p>
                </div>
                <a href={m.fileUrl} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300 p-1.5"><Download className="w-4 h-4" /></a>
                <button onClick={() => remove(m.id)} className="text-surface-400 hover:text-red-400 p-1.5"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            {materials.length === 0 && <p className="text-sm text-surface-500">Sin materiales cargados.</p>}
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
