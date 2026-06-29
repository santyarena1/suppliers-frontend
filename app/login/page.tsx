"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { saveSession } from "@/lib/auth";
import { BarChart2, ArrowRight, AlertCircle, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.login(username, password);
      const token = res.data.data.token;
      const payload = JSON.parse(atob(token.split(".")[1]));
      saveSession(token, {
        username: payload.sub ?? username,
        role: payload.role ?? payload.roles?.[0] ?? "ROLE_USER",
        id: payload.userId ?? payload.id ?? "",
        email: payload.email ?? undefined,
        brandId: payload.brandId ?? undefined,
      });
      router.push("/search");
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
      if (e?.response?.status === 401 || e?.response?.status === 400) {
        setError("Credenciales inválidas. Verificá usuario y contraseña.");
      } else if (e?.response) {
        setError(`Error ${e.response.status}: ${e.response.data?.message || "respuesta inesperada"}`);
      } else {
        setError(`Error de conexión: ${e?.message || "no se pudo contactar al servidor"}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-surface-950">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-80 bg-surface-900 border-r border-surface-800 p-10 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-brand-600 rounded-md flex items-center justify-center">
            <BarChart2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">TGS</p>
            <p className="text-xs text-surface-400">Suppliers</p>
          </div>
        </div>
        <div>
          <p className="text-2xl font-semibold text-white leading-tight mb-3">
            Precios de 14 proveedores en una sola búsqueda.
          </p>
          <p className="text-sm text-surface-400 leading-relaxed">
            Consultá en tiempo real a NEW BYTES, ELIT, INVID, DISTECNA y más sin salir de la plataforma.
          </p>
        </div>
        <p className="text-xs text-surface-600">© 2026 TGS Suppliers</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-xl font-semibold text-white mb-1.5">Iniciar sesión</h1>
            <p className="text-sm text-surface-400">Ingresá a tu cuenta para continuar</p>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 bg-red-500/8 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3 mb-6">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">Usuario</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tu usuario"
                required
                autoFocus
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg py-2.5 transition-all"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Ingresando...</>
                : <><ArrowRight className="w-4 h-4" />Ingresar</>
              }
            </button>
          </form>

          <p className="text-center text-xs text-surface-500 mt-6">
            ¿No tenés cuenta?{" "}
            <Link href="/register" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
              Registrate acá
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
