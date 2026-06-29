"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { ADMIN_MARCAS_NAV } from "@/lib/brands/nav";
import { adminBrandsApi, type BrandAccess } from "@/lib/brands";
import { ACCESS_STATUS_LABELS } from "@/lib/brands/constants";
import { Loader2, Ban } from "lucide-react";

export default function AdminAccesosPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [accesses, setAccesses] = useState<BrandAccess[]>([]);
  const [brandFilter, setBrandFilter] = useState("");

  useEffect(() => { load(); }, [brandFilter]);

  async function load() {
    setLoading(true);
    try {
      setAccesses(await adminBrandsApi.accesses({ brandId: brandFilter || undefined }));
    } catch { showToast("Error al cargar accesos", false); }
    finally { setLoading(false); }
  }

  async function block(id: string, blocked: boolean) {
    try {
      await adminBrandsApi.blockAccess(id, blocked);
      showToast(blocked ? "Relación bloqueada" : "Bloqueo removido");
      await load();
    } catch { showToast("Error", false); }
  }

  async function revoke(id: string) {
    if (!confirm("¿Revocar acceso?")) return;
    try { await adminBrandsApi.revokeAccess(id); showToast("Acceso revocado"); await load(); }
    catch { showToast("Error", false); }
  }

  const brands = [...new Set(accesses.map((a) => a.brandName).filter(Boolean))];

  return (
    <RoleGuard allowed={["ROLE_ADMIN"]}>
      <BrandModuleShell title="Accesos marca-usuario" subtitle="Auditoría de relaciones" nav={ADMIN_MARCAS_NAV}>
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}
          className="mb-5 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-200">
          <option value="">Todas las marcas</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>

        {loading ? <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : (
          <div className="space-y-2">
            {accesses.map((a) => (
              <div key={a.id} className="flex items-center gap-3 bg-surface-800 border border-surface-700 rounded-lg px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm text-white">
                    <span className="font-medium">{a.brandName}</span>
                    <span className="text-surface-500"> → </span>
                    <span>{a.userEmail}</span>
                  </p>
                  <p className="text-xs text-surface-500 mt-0.5">{ACCESS_STATUS_LABELS[a.status]}</p>
                  {a.blockedByAdmin && <p className="text-[10px] text-red-400 mt-0.5">Bloqueado por admin</p>}
                </div>
                <button onClick={() => block(a.id, !a.blockedByAdmin)} className="text-surface-400 hover:text-yellow-400 p-1.5">
                  <Ban className="w-4 h-4" />
                </button>
                <button onClick={() => revoke(a.id)} className="text-xs text-red-400 hover:underline">Revocar</button>
              </div>
            ))}
            {accesses.length === 0 && <p className="text-sm text-surface-500">Sin relaciones registradas.</p>}
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
