"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { ADMIN_MARCAS_NAV } from "@/lib/brands/nav";
import { adminBrandsApi, type AuditLogEntry } from "@/lib/brands";
import { Loader2 } from "lucide-react";

export default function AdminAuditoriaPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    adminBrandsApi.auditLog()
      .then((r) => setEntries(r.items))
      .catch(() => showToast("Error al cargar auditoría", false))
      .finally(() => setLoading(false));
  }, []);

  return (
    <RoleGuard allowed={["ROLE_ADMIN"]}>
      <BrandModuleShell title="Auditoría global" nav={ADMIN_MARCAS_NAV}>
        {loading ? <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="bg-surface-800 border border-surface-700 rounded-lg px-4 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-white font-medium">{e.action}</span>
                  <span className="text-[10px] text-surface-500">{new Date(e.createdAt).toLocaleString("es-AR")}</span>
                </div>
                <p className="text-xs text-surface-400 mt-1">
                  {e.entityType} · {e.performedByName ?? e.performedBy}
                  {e.brandId && ` · Marca ${e.brandId}`}
                </p>
              </div>
            ))}
            {entries.length === 0 && <p className="text-sm text-surface-500">Sin registros.</p>}
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
