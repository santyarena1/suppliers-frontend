"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { ADMIN_MARCAS_NAV } from "@/lib/brands/nav";
import { adminBrandsApi, type BrandAccount, type AdminBrandInput } from "@/lib/brands";
import { Loader2, Plus, Ban, Trash2 } from "lucide-react";

export default function AdminMarcasListPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<BrandAccount[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<AdminBrandInput>({
    name: "", contactEmail: "", adminUsername: "", adminPassword: "",
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setBrands(await adminBrandsApi.brands()); }
    catch { showToast("Error al cargar marcas", false); }
    finally { setLoading(false); }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await adminBrandsApi.createBrand(form);
      showToast("Marca creada");
      setModal(false);
      await load();
    } catch { showToast("Error al crear marca", false); }
  }

  async function suspend(id: string, suspended: boolean) {
    try {
      await adminBrandsApi.suspendBrand(id, suspended);
      showToast(suspended ? "Marca suspendida" : "Marca reactivada");
      await load();
    } catch { showToast("Error", false); }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar marca permanentemente?")) return;
    try { await adminBrandsApi.deleteBrand(id); showToast("Marca eliminada"); await load(); }
    catch { showToast("Error al eliminar", false); }
  }

  return (
    <RoleGuard allowed={["ROLE_ADMIN"]}>
      <BrandModuleShell title="Gestión de marcas" nav={ADMIN_MARCAS_NAV}
        headerAction={
          <button onClick={() => setModal(true)} className="flex items-center gap-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg px-3.5 py-2">
            <Plus className="w-3.5 h-3.5" /> Nueva marca
          </button>
        }>
        {loading ? <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : (
          <div className="space-y-2">
            {brands.map((b) => (
              <div key={b.id} className="flex items-center gap-4 bg-surface-800 border border-surface-700 rounded-xl px-4 py-3">
                <div className="flex-1">
                  <p className="font-medium text-white">{b.name}</p>
                  <p className="text-xs text-surface-500">{b.contactEmail} · {b.slug}</p>
                  <p className="text-[10px] text-surface-600 mt-0.5">
                    {b.suspended ? "Suspendida" : b.active ? "Activa" : "Inactiva"}
                  </p>
                </div>
                <button onClick={() => suspend(b.id, !b.suspended)} className="text-surface-400 hover:text-yellow-400 p-1.5" title="Suspender">
                  <Ban className="w-4 h-4" />
                </button>
                <button onClick={() => remove(b.id)} className="text-surface-400 hover:text-red-400 p-1.5"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            {brands.length === 0 && <p className="text-sm text-surface-500">No hay marcas registradas.</p>}
          </div>
        )}
        {modal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <form onSubmit={create} className="bg-surface-900 border border-surface-700 rounded-xl w-full max-w-lg p-6 space-y-3">
              <h3 className="text-base font-semibold text-white mb-2">Crear cuenta de marca</h3>
              {(["name", "contactEmail", "adminUsername", "adminPassword"] as const).map((f) => (
                <input key={f} required type={f === "adminPassword" ? "password" : "text"}
                  placeholder={f} value={form[f]}
                  onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white" />
              ))}
              <input placeholder="description" value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white" />
              <div className="flex justify-end gap-2 pt-2">
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
