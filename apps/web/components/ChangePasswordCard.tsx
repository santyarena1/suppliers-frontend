"use client";

import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, XCircle } from "lucide-react";
import { authApi } from "@/lib/api";
import { getUser, saveSession, sessionFromToken } from "@/lib/auth";

const inputCls =
  "w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500";

/**
 * Cambiar la propia contraseña. Si la cuenta entra con Google y nunca tuvo
 * contraseña, la actual se deja vacía y se crea una.
 */
export default function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    if (next.length < 8) return setResult({ ok: false, msg: "La contraseña nueva tiene que tener al menos 8 caracteres." });
    if (next !== repeat) return setResult({ ok: false, msg: "Las contraseñas nuevas no coinciden." });
    setSaving(true);
    try {
      const res = await authApi.changePassword(current || undefined, next);
      saveSession(res.data.token, sessionFromToken(res.data.token, getUser()?.username ?? ""));
      setCurrent("");
      setNext("");
      setRepeat("");
      setResult({ ok: true, msg: "Listo, cambiaste tu contraseña. Las otras sesiones abiertas se cerraron." });
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setResult({ ok: false, msg: msg || "No se pudo cambiar la contraseña." });
    } finally {
      setSaving(false);
    }
  }

  const type = show ? "text" : "password";
  return (
    <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="w-4 h-4 text-brand-400" />
        <h2 className="text-sm font-semibold text-white">Cambiar contraseña</h2>
      </div>
      <p className="text-xs text-surface-500 mb-4">
        Si te dieron una contraseña temporal, cambiala acá por una tuya. Si siempre entraste con Google, dejá vacía la actual.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type={type}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Contraseña actual"
          autoComplete="current-password"
          className={inputCls}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type={type}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="Contraseña nueva (mín. 8)"
            autoComplete="new-password"
            minLength={8}
            required
            className={inputCls}
          />
          <input
            type={type}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            placeholder="Repetir la nueva"
            autoComplete="new-password"
            minLength={8}
            required
            className={inputCls}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-surface-400 hover:text-white"
          >
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {show ? "Ocultar" : "Mostrar"}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg px-4 py-2 transition-all active:scale-[0.98]"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Cambiar contraseña
          </button>
        </div>
        {result && (
          <p
            role="status"
            className={`flex items-center gap-2 text-xs rounded-lg px-3.5 py-2.5 border ${
              result.ok
                ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-400"
                : "bg-red-500/8 border-red-500/20 text-red-400"
            }`}
          >
            {result.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
            {result.msg}
          </p>
        )}
      </form>
    </section>
  );
}
