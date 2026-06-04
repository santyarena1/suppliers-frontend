"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import { userApi, invidApi } from "@/lib/api";
import { isAdmin, getUser } from "@/lib/auth";
import { useEffect } from "react";
import {
  Users, ToggleLeft, ToggleRight, Trash2, Calendar,
  RefreshCw, Loader2, Shield, AlertTriangle
} from "lucide-react";

type Tab = "users" | "invid";

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("users");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Users tab
  const [userId, setUserId] = useState("");
  const [activeStatus, setActiveStatus] = useState(true);
  const [endDate, setEndDate] = useState("");
  const [userAction, setUserAction] = useState<"toggle" | "enddate" | "delete">("toggle");

  // Invid tab
  const [invidUserId, setInvidUserId] = useState("");
  const [invidSearch, setInvidSearch] = useState("");

  useEffect(() => {
    if (!isAdmin()) router.replace("/search");
  }, [router]);

  const currentUser = getUser();

  async function handleUserAction(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      if (userAction === "toggle") {
        await userApi.updateActiveStatus(userId, activeStatus);
        setSuccess(`Usuario ${userId} ${activeStatus ? "activado" : "desactivado"}`);
      } else if (userAction === "enddate") {
        await userApi.updateEndDate(userId, endDate);
        setSuccess(`Fecha de expiración actualizada para ${userId}`);
      } else if (userAction === "delete") {
        await userApi.delete(userId);
        setSuccess(`Usuario ${userId} eliminado`);
        setUserId("");
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "Error al ejecutar la acción");
    } finally {
      setLoading(false);
    }
  }

  async function handleInvidSync(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await invidApi.sync(invidUserId);
      setSuccess(`Sincronización completada: ${res.data}`);
    } catch {
      setError("Error al sincronizar Invid");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Panel de administración</h1>
              <p className="text-gray-400 text-sm">Sesión como <span className="text-yellow-400">{currentUser?.username}</span></p>
            </div>
          </div>

          {(error || success) && (
            <div className={`rounded-xl px-4 py-3 mb-6 text-sm border flex items-start gap-2 ${
              error
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-green-500/10 border-green-500/30 text-green-400"
            }`}>
              {error && <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              <span className="flex-1">{error || success}</span>
              <button onClick={() => { setError(""); setSuccess(""); }} className="opacity-50 hover:opacity-100">✕</button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex bg-gray-800 border border-gray-700 rounded-xl p-1 gap-1 mb-6">
            <button
              onClick={() => setTab("users")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === "users" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              <Users className="w-4 h-4" />
              Usuarios
            </button>
            <button
              onClick={() => setTab("invid")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === "invid" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              Invid Sync
            </button>
          </div>

          {tab === "users" && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-gray-400">ID de usuario (UUID)</label>
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="c47e6af2-1234-5678-9abc-def123456789"
                  className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm text-gray-400">Acción</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["toggle", "enddate", "delete"] as const).map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => setUserAction(action)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-colors ${
                        userAction === action
                          ? action === "delete"
                            ? "bg-red-600/20 border-red-500 text-red-300"
                            : "bg-blue-600/20 border-blue-500 text-blue-300"
                          : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
                      }`}
                    >
                      {action === "toggle" && <ToggleRight className="w-5 h-5" />}
                      {action === "enddate" && <Calendar className="w-5 h-5" />}
                      {action === "delete" && <Trash2 className="w-5 h-5" />}
                      {action === "toggle" && "Activar / Desactivar"}
                      {action === "enddate" && "Fecha expiración"}
                      {action === "delete" && "Eliminar"}
                    </button>
                  ))}
                </div>
              </div>

              {userAction === "toggle" && (
                <div className="flex items-center justify-between bg-gray-800 rounded-xl p-4">
                  <span className="text-sm text-gray-300">Estado del usuario</span>
                  <button
                    type="button"
                    onClick={() => setActiveStatus(!activeStatus)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeStatus
                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                        : "bg-red-500/20 text-red-400 border border-red-500/30"
                    }`}
                  >
                    {activeStatus
                      ? <><ToggleRight className="w-4 h-4" /> Activo</>
                      : <><ToggleLeft className="w-4 h-4" /> Inactivo</>
                    }
                  </button>
                </div>
              )}

              {userAction === "enddate" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-gray-400">Nueva fecha de expiración</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm"
                  />
                </div>
              )}

              {userAction === "delete" && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-300">
                    Esta acción es irreversible. El usuario será eliminado permanentemente.
                  </p>
                </div>
              )}

              <form onSubmit={handleUserAction}>
                <button
                  type="submit"
                  disabled={loading || !userId.trim()}
                  className={`w-full font-semibold rounded-lg py-2.5 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50 ${
                    userAction === "delete"
                      ? "bg-red-600 hover:bg-red-500 text-white"
                      : "bg-blue-600 hover:bg-blue-500 text-white"
                  }`}
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {userAction === "toggle" && `${activeStatus ? "Activar" : "Desactivar"} usuario`}
                  {userAction === "enddate" && "Actualizar fecha"}
                  {userAction === "delete" && "Eliminar usuario"}
                </button>
              </form>
            </div>
          )}

          {tab === "invid" && (
            <div className="flex flex-col gap-4">
              {/* Sync */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-orange-400" />
                  Sincronización manual
                </h2>
                <form onSubmit={handleInvidSync} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm text-gray-400">ID de usuario (UUID)</label>
                    <input
                      type="text"
                      value={invidUserId}
                      onChange={(e) => setInvidUserId(e.target.value)}
                      placeholder="UUID del usuario a sincronizar"
                      required
                      className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !invidUserId.trim()}
                    className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Sincronizar Invid
                  </button>
                </form>
              </div>

              {/* Invid search */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h2 className="text-base font-semibold text-white mb-4">Buscar en cache local de Invid</h2>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={invidSearch}
                    onChange={(e) => setInvidSearch(e.target.value)}
                    placeholder="Nombre del producto"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    disabled={loading || !invidSearch.trim()}
                    onClick={async () => {
                      setLoading(true); setError(""); setSuccess("");
                      try {
                        const res = await invidApi.search(invidSearch);
                        setSuccess(`${res.data.length} producto(s) encontrado(s) en cache local`);
                      } catch {
                        setError("Error al buscar en Invid");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg px-4 py-2.5 text-sm transition-colors"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
