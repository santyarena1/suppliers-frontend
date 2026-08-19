"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { ADMIN_MARCAS_NAV } from "@/lib/brands/nav";
import { adminBrandsApi, type Distributor } from "@/lib/brands";
import { Loader2, Plus } from "lucide-react";

export default function AdminDistribuidoresPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setDistributors(await adminBrandsApi.distributors()); }
    catch { showToast("Error al cargar", false); }
    finally { setLoading(false); }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await adminBrandsApi.createDistributor({ name, code: code || undefined });
      showToast("Distribuidor creado");
      setName(""); setCode("");
      await load();
    } catch { showToast("Error al crear", false); }
  }

  return (
    <RoleGuard allowed={["ROLE_ADMIN"]}>
      <BrandModuleShell title="Distribuidores globales" nav={ADMIN_MARCAS_NAV}>
        <form onSubmit={create} className="flex gap-2 mb-6">
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del distribuidor"
            className="flex-1 px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white" />
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código (opcional)"
            className="w-32 px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white" />
          <button type="submit" className="flex items-center gap-1 bg-brand-600 hover:bg-brand-500 text-white text-sm px-4 py-2 rounded-lg">
            <Plus className="w-4 h-4" /> Crear
          </button>
        </form>
        {loading ? <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : (
          <div className="space-y-2">
            {distributors.map((d) => (
              <div key={d.id} className="flex items-center justify-between bg-surface-800 border border-surface-700 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{d.name}</p>
                  {d.code && <p className="text-xs text-surface-500">{d.code}</p>}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded ${d.active ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                  {d.active ? "Activo" : "Inactivo"}
                </span>
              </div>
            ))}
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
