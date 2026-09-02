"use client";

import { useEffect, useState } from "react";
import {
  adminApi,
  BrandDisplay,
  ModuleKey,
  ModulePermission,
  PROVIDER_LABELS,
  Provider,
  type AdminUser,
  type UserRole,
} from "@/lib/api";
import { getUser } from "@/lib/auth";
import EnterAsButton from "./EnterAsButton";
import GeneratedPassword from "./GeneratedPassword";
import { KeyRound, Loader2, Shield, Trash2 } from "lucide-react";

type ToastFn = (msg: string, ok?: boolean) => void;

const MODULE_LABELS: Record<ModuleKey, string> = {
  search: "Búsqueda",
  cart: "Carrito",
  credentials: "Credenciales (en Proveedores)",
  providers: "Proveedores",
  brands: "Portal de Marcas",
  news: "Noticias",
  diagnostics: "Diagnóstico",
  admin: "Administración",
};

const PLATFORM_ROLE_LABELS: Record<UserRole, string> = {
  ROLE_USER: "Usuario",
  ROLE_ADMIN: "Superadmin",
  ROLE_BRAND: "Marca",
};

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

function providerLabel(provider: string) {
  return PROVIDER_LABELS[provider as Provider] ?? provider.replace(/_/g, " ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-AR");
}

/**
 * Cuenta de plataforma: usuario, clave, rol de Nodo, módulos y “Entrar como”.
 * El alcance comercial lo da la membresía, no este bloque.
 */
export default function PlatformAccountPanel({
  user,
  brands,
  onReload,
  showToast,
  onDeleted,
}: {
  user: AdminUser;
  brands: BrandDisplay[];
  onReload: () => void;
  showToast: ToastFn;
  onDeleted?: () => void;
}) {
  const me = getUser();
  const isSelf = me?.id === user.id;
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [brandId, setBrandId] = useState(user.brandId ?? "");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [perms, setPerms] = useState<ModulePermission[]>([]);
  const [loadingPerms, setLoadingPerms] = useState(true);
  const [savingPerms, setSavingPerms] = useState(false);

  useEffect(() => {
    setUsername(user.username);
    setEmail(user.email);
    setBrandId(user.brandId ?? "");
  }, [user]);

  useEffect(() => {
    setLoadingPerms(true);
    adminApi
      .getPermissions(user.id)
      .then((r) => setPerms(r.data))
      .catch(() => setPerms([]))
      .finally(() => setLoadingPerms(false));
  }, [user.id]);

  async function saveProfile() {
    setSaving(true);
    try {
      await adminApi.updateUser(user.id, { username, email, brandId: brandId || null });
      showToast("Cuenta de Nodo actualizada");
      onReload();
    } catch (err) {
      showToast(errMsg(err, "No se pudieron guardar los datos"), false);
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(role: UserRole) {
    try {
      await adminApi.updateRole(user.id, role);
      showToast("Nivel de plataforma actualizado");
      onReload();
    } catch (err) {
      showToast(errMsg(err, "No se pudo cambiar el nivel"), false);
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
      showToast("Contraseña de Nodo reseteada");
      setGenerated(data.generatedPassword ?? null);
      setPassword("");
      setPassword2("");
    } catch (err) {
      showToast(errMsg(err, "No se pudo resetear la contraseña"), false);
    } finally {
      setResetting(false);
    }
  }

  async function savePerms() {
    setSavingPerms(true);
    try {
      await adminApi.updatePermissions(user.id, perms);
      showToast("Permisos de módulos actualizados");
    } catch (err) {
      showToast(errMsg(err, "No se pudieron guardar los permisos"), false);
    } finally {
      setSavingPerms(false);
    }
  }

  async function remove() {
    if (isSelf) return;
    if (!window.confirm(`¿Eliminar a ${user.username}? Se borra la cuenta de Nodo. Esta acción no se puede deshacer.`)) return;
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
        <p className="text-[11px] uppercase tracking-wider text-surface-500 font-semibold">Cuenta Nodo</p>
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
            <span className="text-[11px] text-surface-500">Nivel de plataforma</span>
            <select
              value={user.role}
              onChange={(e) => changeRole(e.target.value as UserRole)}
              className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
            >
              {(Object.keys(PLATFORM_ROLE_LABELS) as UserRole[]).map((role) => (
                <option key={role} value={role}>
                  {PLATFORM_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-surface-500">Marca del portal</span>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
            >
              <option value="">Sin marca</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>
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
        <p className="text-[11px] text-surface-600">
          Creado {formatDate(user.createdAt)}
          {user.tenantName ? ` · ${user.tenantName}` : ""}
        </p>
        <p className="text-[11px] text-surface-500 leading-relaxed">
          El nivel de plataforma no define qué puede hacer en el comercio, el distro o la marca: eso lo da el rol
          interno de la organización.
        </p>
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

        <section className="border border-surface-800 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-[11px] uppercase tracking-wider text-surface-500 font-semibold flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Módulos de Nodo
          </p>
          {loadingPerms ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
            </div>
          ) : (
            <div className="divide-y divide-surface-800 border border-surface-800 rounded-lg overflow-hidden">
              {perms.map((p) => (
                <div key={p.module} className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs text-surface-200">{MODULE_LABELS[p.module]}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setPerms((prev) => prev.map((x) => (x.module === p.module ? { ...x, allowed: !x.allowed } : x)))
                    }
                    className={`w-10 rounded-full relative transition-colors ${p.allowed ? "bg-brand-600" : "bg-surface-600"}`}
                    style={{ height: 22 }}
                  >
                    <span
                      className={`absolute top-0.5 bg-white rounded-full transition-all ${p.allowed ? "left-[22px]" : "left-0.5"}`}
                      style={{ width: 18, height: 18 }}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={savePerms}
            disabled={savingPerms || loadingPerms}
            className="flex items-center justify-center gap-2 bg-surface-800 hover:bg-surface-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg py-2 transition-all"
          >
            {savingPerms ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Guardar módulos"}
          </button>
        </section>

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
