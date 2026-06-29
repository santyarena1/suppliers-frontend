"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { BRAND_PANEL_NAV } from "@/lib/brands/nav";
import { brandPanelApi, type BrandProduct, type BrandProductInput } from "@/lib/brands";
import { Loader2, Plus, Pencil, EyeOff } from "lucide-react";

const emptyForm: BrandProductInput = {
  brandSku: "", model: "", commercialName: "", active: true,
};

export default function MarcaProductosPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<BrandProduct[]>([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<BrandProduct | null>(null);
  const [form, setForm] = useState<BrandProductInput>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [search]);

  async function load() {
    setLoading(true);
    try {
      const res = await brandPanelApi.products({ search: search || undefined, pageSize: 100 });
      setProducts(res.items);
    } catch {
      showToast("Error al cargar productos", false);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(p: BrandProduct) {
    setEditing(p);
    setForm({
      brandSku: p.brandSku, model: p.model, commercialName: p.commercialName,
      eanUpc: p.eanUpc ?? undefined, shortDescription: p.shortDescription ?? undefined,
      discontinued: p.discontinued, isLaunch: p.isLaunch, recommended: p.recommended,
      featured: p.featured, tags: p.tags,
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await brandPanelApi.updateProduct(editing.id, form);
        showToast("Producto actualizado");
      } else {
        await brandPanelApi.createProduct(form);
        showToast("Producto creado");
      }
      setShowModal(false);
      await load();
    } catch {
      showToast("Error al guardar", false);
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    if (!confirm("¿Desactivar este producto?")) return;
    try {
      await brandPanelApi.deactivateProduct(id);
      showToast("Producto desactivado");
      await load();
    } catch {
      showToast("Error", false);
    }
  }

  return (
    <RoleGuard allowed={["ROLE_BRAND"]} redirectTo="/marcas">
      <BrandModuleShell
        title="Productos"
        subtitle="Catálogo propio de la marca"
        nav={BRAND_PANEL_NAV}
        headerAction={
          <button onClick={openCreate} className="flex items-center gap-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg px-3.5 py-2">
            <Plus className="w-3.5 h-3.5" /> Nuevo producto
          </button>
        }
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, SKU o modelo..."
          className="w-full max-w-md mb-5 px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white focus:border-brand-500 focus:outline-none"
        />

        {loading ? (
          <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-surface-700">
            <table className="w-full text-sm">
              <thead className="bg-surface-800">
                <tr>
                  <th className="text-left px-4 py-3 text-surface-400 font-medium">Producto</th>
                  <th className="text-left px-4 py-3 text-surface-400 font-medium">SKU</th>
                  <th className="text-left px-4 py-3 text-surface-400 font-medium">Estado</th>
                  <th className="text-right px-4 py-3 text-surface-400 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-surface-800">
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{p.commercialName}</p>
                      <p className="text-xs text-surface-500">{p.model}</p>
                    </td>
                    <td className="px-4 py-3 text-surface-300 font-mono text-xs">{p.brandSku}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {!p.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">Inactivo</span>}
                        {p.discontinued && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-400">Discontinuado</span>}
                        {p.isLaunch && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400">Lanzamiento</span>}
                        {p.recommended && <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400">Recomendado</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(p)} className="text-surface-400 hover:text-brand-400 p-1.5"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => deactivate(p.id)} className="text-surface-400 hover:text-red-400 p-1.5"><EyeOff className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <form onSubmit={handleSave} className="bg-surface-900 border border-surface-700 rounded-xl w-full max-w-lg p-6 space-y-4">
              <h3 className="text-base font-semibold text-white">{editing ? "Editar producto" : "Nuevo producto"}</h3>
              {(["commercialName", "brandSku", "model", "eanUpc", "shortDescription"] as const).map((field) => (
                <div key={field}>
                  <label className="text-xs text-surface-400 block mb-1">{field}</label>
                  <input
                    required={field === "commercialName" || field === "brandSku" || field === "model"}
                    value={(form[field] as string) ?? ""}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white focus:border-brand-500 focus:outline-none"
                  />
                </div>
              ))}
              <div className="flex flex-wrap gap-4">
                {(["discontinued", "isLaunch", "recommended", "featured"] as const).map((flag) => (
                  <label key={flag} className="flex items-center gap-2 text-xs text-surface-300">
                    <input type="checkbox" checked={!!form[flag]} onChange={(e) => setForm({ ...form, [flag]: e.target.checked })} />
                    {flag}
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="text-sm text-surface-400 px-4 py-2">Cancelar</button>
                <button type="submit" disabled={saving} className="text-sm bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg disabled:opacity-50">
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
