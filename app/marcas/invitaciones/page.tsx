"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { USER_BRANDS_NAV } from "@/lib/brands/nav";
import { userBrandsApi, type BrandAccess } from "@/lib/brands";
import { ACCESS_STATUS_LABELS } from "@/lib/brands/constants";
import { Loader2, Mail, Check, X } from "lucide-react";

export default function InvitacionesPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [invitations, setInvitations] = useState<BrandAccess[]>([]);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setInvitations(await userBrandsApi.invitations());
    } catch {
      showToast("Error al cargar invitaciones", false);
    } finally {
      setLoading(false);
    }
  }

  async function accept(id: string) {
    setActing(id);
    try {
      await userBrandsApi.acceptInvitation(id);
      showToast("Invitación aceptada");
      await load();
    } catch {
      showToast("Error al aceptar", false);
    } finally {
      setActing(null);
    }
  }

  async function reject(id: string) {
    setActing(id);
    try {
      await userBrandsApi.rejectInvitation(id);
      showToast("Invitación rechazada");
      await load();
    } catch {
      showToast("Error al rechazar", false);
    } finally {
      setActing(null);
    }
  }

  return (
    <RoleGuard allowed={["ROLE_USER", "ROLE_ADMIN"]}>
      <BrandModuleShell title="Invitaciones" subtitle="Accesos pendientes de marcas" nav={USER_BRANDS_NAV}>
        {loading ? (
          <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
        ) : invitations.length === 0 ? (
          <div className="text-center py-20 text-surface-400 text-sm">
            <Mail className="w-10 h-10 mx-auto mb-3 text-surface-600" />
            No tenés invitaciones pendientes.
          </div>
        ) : (
          <div className="space-y-3">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 bg-surface-800 border border-surface-700 rounded-xl px-4 py-4">
                <div className="flex-1">
                  <p className="font-medium text-white">{inv.brandName ?? "Marca"}</p>
                  <p className="text-xs text-surface-500 mt-1">{ACCESS_STATUS_LABELS[inv.status]}</p>
                  <p className="text-[10px] text-surface-600 mt-1">
                    Invitado: {new Date(inv.invitedAt).toLocaleDateString("es-AR")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={acting === inv.id}
                    onClick={() => accept(inv.id)}
                    className="flex items-center gap-1 text-xs bg-brand-600 hover:bg-brand-500 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" /> Aceptar
                  </button>
                  <button
                    disabled={acting === inv.id}
                    onClick={() => reject(inv.id)}
                    className="flex items-center gap-1 text-xs bg-surface-700 hover:bg-surface-600 text-surface-200 px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" /> Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
