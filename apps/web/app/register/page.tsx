"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { saveSession, sessionFromToken } from "@/lib/auth";
import { ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";
import GeneratedPassword from "@/components/admin/GeneratedPassword";

export default function RegisterPage() {
  const router = useRouter();
  const [commerceName, setCommerceName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [generate, setGenerate] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  async function enter(token: string) {
    saveSession(token, sessionFromToken(token, username));
    router.push("/");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!generate && password !== confirm) { setError("Las contraseñas no coinciden"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await authApi.register(
        commerceName.trim(),
        username.trim(),
        email.trim(),
        generate ? undefined : password
      );
      const token = res.data.token;
      if (res.data.generatedPassword) {
        setGeneratedPassword(res.data.generatedPassword);
        setPendingToken(token);
        return;
      }
      await enter(token);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "Error al registrarse. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-950 px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8">
          <NodoLogo className="w-7 h-7" />
          <NodoWordmark className="h-3.5" />
        </div>

        <div className="mb-7">
          <h1 className="text-xl font-semibold text-white mb-1.5">Dar de alta tu comercio</h1>
          <p className="text-sm text-surface-400">Creás el local y entras como administrador</p>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 bg-red-500/8 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3 mb-6">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {generatedPassword && pendingToken ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-surface-300">
              El local quedó creado. Copiá esta contraseña: no se vuelve a mostrar.
            </p>
            <GeneratedPassword
              password={generatedPassword}
              onDismiss={() => { /* hay que copiarla, no se cierra el alta */ }}
            />
            <button
              type="button"
              onClick={() => enter(pendingToken)}
              className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-lg py-2.5 transition-all"
            >
              <ArrowRight className="w-4 h-4" />
              Entrar a NODO
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">Nombre del local</label>
              <input
                type="text"
                value={commerceName}
                onChange={(e) => setCommerceName(e.target.value)}
                placeholder="Cómo se llama tu comercio"
                required
                minLength={2}
                autoFocus
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">Usuario</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Elegí un usuario"
                required
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-all"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-surface-300 cursor-pointer">
              <input
                type="checkbox"
                checked={generate}
                onChange={(e) => setGenerate(e.target.checked)}
                className="accent-brand-500"
              />
              Generar una contraseña por mí
            </label>

            {!generate && (
              <>
                <div>
                  <label className="block text-xs font-medium text-surface-400 mb-1.5">Contraseña</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required={!generate}
                    minLength={8}
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-400 mb-1.5">Confirmar contraseña</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repetí la contraseña"
                    required={!generate}
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-all"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg py-2.5 transition-all"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Creando el local...</>
                : <><ArrowRight className="w-4 h-4" />Crear comercio y entrar</>
              }
            </button>
          </form>
        )}

        <p className="text-center text-xs text-surface-500 mt-6">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
            Iniciá sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
