"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import { userApi } from "@/lib/api";
import { isAdmin, getUser } from "@/lib/auth";
import {
  Users, ToggleLeft, ToggleRight, Trash2, Calendar,
  Loader2, AlertTriangle, CheckCircle2, XCircle, Zap
} from "lucide-react";

type UserTab = "status" | "enddate" | "delete";

export default function AdminPage() {
  const router = useRouter();
  const [userTab, setUserTab] = useState<UserTab>("status");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [userId, setUserId] = useState("");
  const [activeStatus, setActiveStatus] = useState(true);
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (!isAdmin()) router.replace("/search");
  }, [router]);

  const currentUser = getUser();

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleUserAction(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (userTab === "status") {
        await userApi.updateActiveStatus(userId, activeStatus);
        showToast(`Usuario ${activeStatus ? "activado" : "desactivado"} correctamente`);
      } else if (userTab === "enddate") {
        await userApi.updateEndDate(userId, endDate);
        showToast("Fecha de expiración actualizada");
      } else {
        await userApi.delete(userId);
        showToast("Usuario eliminado");
        setUserId("");
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast(msg || "Error al ejecutar la acción", false);
    } finally {
      setLoading(false);
    }
  }

  const userTabs: { key: UserTab; label: string; icon: React.ReactNode; danger?: boolean }[] = [
    { key: "status", label: "Estado", icon: <ToggleRight className="w-3.5 h-3.5" /> },
    { key: "enddate", label: "Expiración", icon: <Calendar className="w-3.5 h-3.5" /> },
    { key: "delete", label: "Eliminar", icon: <Trash2 className="w-3.5 h-3.5" />, danger: true },
  ];

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Navbar />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0 pt-12 lg:pt-0">
          <header className="flex-shrink-0 border-b border-surface-800 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-yellow-500/15 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-white">Administración</h1>
                <p className="text-xs text-surface-500">
                  Sesión como <span className="text-yellow-400 font-medium">{currentUser?.username}</span>
                </p>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-6">
                <Users className="w-4 h-4 text-brand-700 dark:text-brand-400" />
                <h2 className="text-sm font-semibold text-white">Usuarios</h2>
              </div>

              <div className="flex flex-col gap-5">
                <div>
                  <label className="block text-xs font-medium text-surface-400 mb-1.5">ID de usuario (UUID)</label>
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="c47e6af2-1234-5678-9abc-def123456789"
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500 transition-all font-mono"
                  />
                </div>

                {/* Action sub-tabs */}
                <div className="flex gap-2">
                  {userTabs.map(({ key, label, icon, danger }) => (
                    <button
                      key={key}
                      onClick={() => setUserTab(key)}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border transition-all ${
                        userTab === key
                          ? danger
                            ? "bg-red-500/10 border-red-500/30 text-red-400"
                            : "bg-brand-600/10 border-brand-500/30 text-brand-400"
                          : "border-surface-700 text-surface-500 hover:text-surface-300 hover:border-surface-600"
                      }`}
                    >
                      {icon}{label}
                    </button>
                  ))}
                </div>

                {/* Action-specific UI */}
                {userTab === "status" && (
                  <div className="flex items-center gap-3 bg-surface-800 rounded-xl p-4">
                    <p className="flex-1 text-sm text-surface-300">Estado del usuario</p>
                    <button
                      type="button"
                      onClick={() => setActiveStatus(!activeStatus)}
                      className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border transition-all ${
                        activeStatus
                          ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                          : "bg-red-500/10 border-red-500/25 text-red-400"
                      }`}
                    >
                      {activeStatus
                        ? <><ToggleRight className="w-4 h-4" />Activo</>
                        : <><ToggleLeft className="w-4 h-4" />Inactivo</>
                      }
                    </button>
                  </div>
                )}

                {userTab === "enddate" && (
                  <div>
                    <label className="block text-xs font-medium text-surface-400 mb-1.5">Nueva fecha de expiración</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500 transition-all"
                    />
                  </div>
                )}

                {userTab === "delete" && (
                  <div className="flex items-start gap-3 bg-red-500/5 border border-red-500/15 rounded-xl p-4">
                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300 leading-relaxed">
                      Esta acción es permanente e irreversible. El usuario y todos sus datos asociados serán eliminados.
                    </p>
                  </div>
                )}

                <form onSubmit={handleUserAction}>
                  <button
                    type="submit"
                    disabled={loading || !userId.trim()}
                    className={`w-full flex items-center justify-center gap-2 text-sm font-semibold rounded-lg py-2.5 transition-all disabled:opacity-40 ${
                      userTab === "delete"
                        ? "bg-red-600 hover:bg-red-500 text-white"
                        : "bg-brand-600 hover:bg-brand-500 text-white"
                    }`}
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {userTab === "status" && `${activeStatus ? "Activar" : "Desactivar"} usuario`}
                    {userTab === "enddate" && "Actualizar fecha de expiración"}
                    {userTab === "delete" && "Eliminar usuario"}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl ${
          toast.ok
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
            : "bg-red-500/10 border-red-500/20 text-red-300"
        }`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </AuthGuard>
  );
}
