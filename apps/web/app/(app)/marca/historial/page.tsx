"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { BRAND_PANEL_NAV } from "@/lib/brands/nav";
import { brandPanelApi, type AuditLogEntry } from "@/lib/brands";
import { Loader2 } from "lucide-react";

export default function MarcaHistorialPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [entityType, setEntityType] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await brandPanelApi.auditLog(entityType || undefined);
        setEntries(res.items);
      } catch {
        showToast("Error al cargar historial", false);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [entityType, showToast]);

  return (
    <RoleGuard allowed={["ROLE_BRAND"]} redirectTo="/marcas">
      <BrandModuleShell title="Historial de cambios" subtitle="Auditoría de tu marca" nav={BRAND_PANEL_NAV}>
        <select value={entityType} onChange={(e) => setEntityType(e.target.value)}
          className="mb-5 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-200">
          <option value="">Todas las entidades</option>
          <option value="PRODUCT">Productos</option>
          <option value="AVAILABILITY">Disponibilidad</option>
          <option value="IMPORT">Importaciones</option>
          <option value="ACCESS">Accesos</option>
          <option value="NEWS">Novedades</option>
          <option value="CAMPAIGN">Campañas</option>
          <option value="MATERIAL">Materiales</option>
        </select>

        {loading ? <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="bg-surface-800 border border-surface-700 rounded-lg px-4 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-white font-medium">{e.action}</span>
                  <span className="text-[10px] text-surface-500">{new Date(e.createdAt).toLocaleString("es-AR")}</span>
                </div>
                <p className="text-xs text-surface-400 mt-1">{e.entityType} · {e.performedByName ?? e.performedBy}</p>
              </div>
            ))}
            {entries.length === 0 && <p className="text-sm text-surface-500">Sin registros de auditoría.</p>}
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
