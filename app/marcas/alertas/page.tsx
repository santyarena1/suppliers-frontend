"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { USER_BRANDS_NAV } from "@/lib/brands/nav";
import { userBrandsApi, type BrandNotification } from "@/lib/brands";
import { Loader2, Bell, Check } from "lucide-react";

export default function AlertasPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<BrandNotification[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setNotifications(await userBrandsApi.notifications());
    } catch {
      showToast("Error al cargar alertas", false);
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    try {
      await userBrandsApi.markNotificationRead(id);
      await load();
    } catch {
      showToast("Error al marcar como leída", false);
    }
  }

  async function markAllRead() {
    try {
      await userBrandsApi.markAllNotificationsRead();
      showToast("Todas marcadas como leídas");
      await load();
    } catch {
      showToast("Error", false);
    }
  }

  return (
    <RoleGuard allowed={["ROLE_USER", "ROLE_ADMIN"]}>
      <BrandModuleShell
        title="Alertas"
        subtitle="Notificaciones de tus marcas autorizadas"
        nav={USER_BRANDS_NAV}
        headerAction={
          notifications.some((n) => !n.read) ? (
            <button onClick={markAllRead} className="text-xs text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Marcar todas leídas
            </button>
          ) : undefined
        }
      >
        {loading ? (
          <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-20 text-surface-400 text-sm">
            <Bell className="w-10 h-10 mx-auto mb-3 text-surface-600" />
            No tenés alertas pendientes.
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                  n.read ? "bg-surface-800/50 border-surface-800" : "bg-brand-600/5 border-brand-500/20"
                }`}
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{n.title}</p>
                  <p className="text-xs text-surface-400 mt-1">{n.message}</p>
                  <p className="text-[10px] text-surface-500 mt-1">
                    {n.brandName && `${n.brandName} · `}
                    {new Date(n.createdAt).toLocaleString("es-AR")}
                  </p>
                </div>
                {!n.read && (
                  <button onClick={() => markRead(n.id)} className="text-xs text-brand-400 hover:underline flex-shrink-0">
                    Leída
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
