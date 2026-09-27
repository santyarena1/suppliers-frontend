"use client";

import { useEffect, useState } from "react";
import { adminApi, type AdminUser, type UserRole } from "@/lib/api";
import { getUser } from "@/lib/auth";
import EnterAsButton from "./EnterAsButton";
import GeneratedPassword from "./GeneratedPassword";
import { KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { providerLabel as resolveProviderLabel } from "@/components/ProviderBadge";
type ToastFn = (msg: string, ok?: boolean) => void;

const PLATFORM_ROLE_LABELS: Record<UserRole, string> = {
  ROLE_USER: "Usuario",
  ROLE_ADMIN: "Superadmin",
  ROLE_BRAND: "Marca",
};

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

function providerLabel(provider: string) {
  return resolveProviderLabel(provider);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-AR");
}

/**
 * La cuenta del usuario: datos de acceso, estado, clave y “Entrar como”.
 * Qué puede hacer lo define su rol en cada organización, no este bloque.
 */
export default function PlatformAccountPanel({
  user,
  onReload,
  showToast,
  onDeleted,
}: {
  user: AdminUser;
  onReload: () => void;
  showToast: ToastFn;
  onDeleted?: () => void;
}) {
  const me = getUser();
  const isSelf = me?.id === user.id;
  const isSuperadmin = user.role === "ROLE_ADMIN";
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [togglingAdmin, setTogglingAdmin] = useState(false);

  useEffect(() => {
    setUsername(user.username);
    setEmail(user.email);
  }, [user]);

  async function saveProfile() {
    setSaving(true);
    try {
      await adminApi.updateUser(user.id, { username, email });
      showToast("Cuenta actualizada");
      onReload();
    } catch (err) {
      showToast(errMsg(err, "No se pudieron guardar los datos"), false);
    } finally {
      setSaving(false);
    }
  }

  async function toggleSuperadmin() {
    const next = !isSuperadmin;
    const question = next
      ? `¿Hacer superadmin a ${user.username}? Va a poder administrar toda la plataforma.`
      : `¿Quitarle el superadmin a ${user.username}?`;
    if (!window.confirm(question)) return;
    setTogglingAdmin(true);
    try {
      await adminApi.setSuperadmin(user.id, next);
      showToast(next ? "Ahora es superadmin" : "Ya no es superadmin");
      onReload();
    } catch (err) {
      showToast(errMsg(err, "No se pudo cambiar"), false);
    } finally {
      setTogglingAdmin(false);
    }
  }

  async function toggleActive() {
    try {
      await adminApi.updateActiveStatus(user.id, !user.active);
      showToast(user.active ? "Cuenta desactivada" : "Cuenta activada");
      onReload();
    } catch (err) {
      showToast(errMsg(err, "No se pudo cambiar el estado"), false);
    }
  }

  async function changeEndDate(value: string) {
    try {
      await adminApi.updateEndDate(user.id, value || null);
      showToast(value ? "Vencimiento actualizado" : "Vencimiento quitado");
      onReload();
    } catch (err) {
      showToast(errMsg(err, "No se pudo actualizar el vencimiento"), false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password !== password2) {
      showToast("Las contraseñas no coinciden", false);
      return;
    }
    await applyNewPassword(password);
  }

  async function applyNewPassword(value?: string) {
    setResetting(true);
    try {
      const { data } = await adminApi.resetPassword(user.id, value);
      showToast("Contraseña reseteada");
      setGenerated(data.generatedPassword ?? null);
      setPassword("");
      setPassword2("");
    } catch (err) {
      showToast(errMsg(err, "No se pudo resetear la contraseña"), false);
    } finally {
      setResetting(false);
    }
  }

  async function remove() {
    if (isSelf) return;
    if (!window.confirm(`¿Eliminar a ${user.username}? Se borra la cuenta y sale de todas sus organizaciones. No se puede deshacer.`)) return;
    try {
      await adminApi.deleteUser(user.id);
      showToast("Usuario eliminado");
      onDeleted?.();
      onReload();
    } catch (err) {
      showToast(errMsg(err, "No se pudo eliminar"), false);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <section className="border border-surface-800 rounded-xl p-4 flex flex-col gap-3">
        <p className="text-[11px] uppercase tracking-wider text-surface-500 font-semibold">Cuenta</p>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-surface-500">Usuario</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-surface-500">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-surface-500">Vence</span>
            <input
              type="date"
              defaultValue={user.endDate ? user.endDate.slice(0, 10) : ""}
              onBlur={(e) => changeEndDate(e.target.value)}
              className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-surface-500">Estado</span>
            <button
              type="button"
              onClick={toggleActive}
              className={`text-xs font-medium px-2 py-2 rounded-lg border ${
                user.active
                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                  : "bg-red-500/10 border-red-500/25 text-red-400"
              }`}
            >
              {user.active ? "Activo" : "Inactivo"}
            </button>
          </div>
        </div>
        <label
          className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
            isSuperadmin ? "border-brand-500/40 bg-brand-600/10" : "border-surface-700 hover:border-surface-600"
          } ${isSelf || togglingAdmin ? "opacity-50 cursor-not-allowed" : ""}`}
          title={isSelf ? "No podés cambiar tu propio superadmin" : undefined}
        >
          <input
            type="checkbox"
            checked={isSuperadmin}
            disabled={isSelf || togglingAdmin}
            onChange={toggleSuperadmin}
            className="mt-0.5 accent-brand-500"
          />
          <span className="flex flex-col">
            <span className="text-xs font-medium text-white flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-400" /> Superadmin
            </span>
            <span className="text-[11px] text-surface-500 leading-relaxed">
              Administra toda la plataforma. Lo que puede hacer dentro de cada organización lo define su rol ahí.
            </span>
          </span>
        </label>
        <p className="text-[11px] text-surface-600">Creado {formatDate(user.createdAt)}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={saveProfile}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg py-2 transition-all"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Guardar cuenta"}
          </button>
          <EnterAsButton
            userId={user.id}
            role={user.role}
            variant="primary"
            onError={(message) => showToast(message, false)}
            className="px-3 py-2"
          />
          <button
            type="button"
            onClick={remove}
            disabled={isSelf}
            className="px-3 rounded-lg border border-surface-700 text-surface-400 hover:text-red-400 hover:border-red-500/30 disabled:opacity-30"
            title={isSelf ? "No podés eliminarte a vos mismo" : "Eliminar cuenta"}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      <div className="flex flex-col gap-4">
        <form onSubmit={resetPassword} className="border border-surface-800 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-[11px] uppercase tracking-wider text-surface-500 font-semibold flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" /> Contraseña
          </p>
          <input
            type="password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nueva contraseña (mín. 8)"
            className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
          />
          <input
            type="password"
            minLength={8}
            required
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            placeholder="Repetir contraseña"
            className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={resetting}
              className="flex-1 flex items-center justify-center gap-2 bg-surface-800 hover:bg-surface-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg py-2 transition-all"
            >
              {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Resetear"}
            </button>
            <button
              type="button"
              onClick={() => applyNewPassword()}
              disabled={resetting}
              title="Generar una contraseña y mostrarla una sola vez"
              className="px-3 rounded-lg border border-surface-700 text-surface-300 hover:border-brand-500/40 hover:text-white disabled:opacity-40 text-xs font-semibold transition-all"
            >
              Generar
            </button>
          </div>
          {generated && <GeneratedPassword password={generated} onDismiss={() => setGenerated(null)} />}
        </form>

        {(user.providers ?? []).length > 0 && (
          <section className="border border-surface-800 rounded-xl p-4">
            <p className="text-[11px] uppercase tracking-wider text-surface-500 font-semibold mb-2">
              Credenciales de la organización
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(user.providers ?? []).map((p) => (
                <span
                  key={p}
                  className="text-[11px] font-medium px-2 py-1 rounded-md bg-surface-800 text-surface-200 border border-surface-700"
                >
                  {providerLabel(p)}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export { PLATFORM_ROLE_LABELS };
