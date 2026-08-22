"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminApi,
  AdminUser,
  ALL_PROVIDERS,
  BrandDisplay,
  ModuleKey,
  ModulePermission,
  UserRole,
} from "@/lib/api";
import { getUser } from "@/lib/auth";
import {
  Building2,
  Boxes,
  ChevronDown,
  KeyRound,
  Loader2,
  Plus,
  Search,
  Shield,
  Trash2,
  Users,
  X,
} from "lucide-react";

type GroupMode = "role" | "brand" | "provider";
type ToastFn = (msg: string, ok?: boolean) => void;

const ROLE_ORDER: UserRole[] = ["ROLE_ADMIN", "ROLE_USER", "ROLE_BRAND"];
const ROLE_LABELS: Record<UserRole, string> = {
  ROLE_ADMIN: "Administradores",
  ROLE_USER: "Usuarios",
  ROLE_BRAND: "Cuentas de marca",
};
const ROLE_SHORT: Record<UserRole, string> = {
  ROLE_ADMIN: "Admin",
  ROLE_USER: "Usuario",
  ROLE_BRAND: "Marca",
};
const MODULE_LABELS: Record<ModuleKey, string> = {
  search: "Búsqueda",
  cart: "Carrito",
  credentials: "Credenciales",
  providers: "Proveedores",
  brands: "Portal de Marcas",
  diagnostics: "Diagnóstico",
  admin: "Administración",
};

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

function providerLabel(provider: string) {
  return provider.replace(/_/g, " ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-AR");
}

export default function UsersManagement({ showToast }: { showToast: ToastFn }) {
  const me = getUser();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [brands, setBrands] = useState<BrandDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [groupMode, setGroupMode] = useState<GroupMode>("role");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      adminApi.listUsers().then((r) => setUsers(r.data)).catch(() => setUsers([])),
      adminApi.listBrandDisplay().then((r) => setBrands(r.data)).catch(() => setBrands([])),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.username, u.email, u.role, u.brand?.name, ...(u.providers ?? [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [users, query]);

  const groups = useMemo(() => buildGroups(filtered, groupMode, brands), [filtered, groupMode, brands]);

  const stats = useMemo(() => ({
    admin: users.filter((u) => u.role === "ROLE_ADMIN").length,
    user: users.filter((u) => u.role === "ROLE_USER").length,
    brand: users.filter((u) => u.role === "ROLE_BRAND").length,
    withProviders: users.filter((u) => (u.providers ?? []).length > 0).length,
  }), [users]);

  return (
    <div className="max-w-6xl flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Gestión de usuarios</h2>
          <p className="text-xs text-surface-500 mt-0.5">
            {stats.admin} admin · {stats.user} usuarios · {stats.brand} marca · {stats.withProviders} con proveedores
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg px-3 py-2 transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> Nuevo usuario
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-surface-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por usuario, email, marca o proveedor"
            className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
          />
        </div>
        <div className="flex rounded-lg border border-surface-800 overflow-hidden">
          {([
            { key: "role" as const, label: "Por tipo", icon: <Users className="w-3.5 h-3.5" /> },
            { key: "brand" as const, label: "Por marca", icon: <Building2 className="w-3.5 h-3.5" /> },
            { key: "provider" as const, label: "Por proveedor", icon: <Boxes className="w-3.5 h-3.5" /> },
          ]).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setGroupMode(opt.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                groupMode === opt.key ? "bg-brand-600 text-white" : "text-surface-400 hover:text-white hover:bg-surface-800"
              }`}
            >
              {opt.icon}{opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section key={group.key} className="border border-surface-800 rounded-xl overflow-hidden">
              <header className="flex items-center justify-between px-4 py-2.5 bg-surface-900 border-b border-surface-800">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{group.title}</span>
                  <span className="text-[11px] text-surface-500">{group.hint}</span>
                </div>
                <span className="text-[11px] font-medium text-surface-400 bg-surface-800 rounded-md px-2 py-0.5">
                  {group.users.length}
                </span>
              </header>
              {group.users.length === 0 ? (
                <p className="text-xs text-surface-500 px-4 py-5">No hay usuarios en este grupo.</p>
              ) : (
                <div className="divide-y divide-surface-800">
                  {group.users.map((u) => (
                    <UserRow
                      key={`${group.key}-${u.id}`}
                      user={u}
                      brands={brands}
                      expanded={expandedId === u.id}
                      isSelf={me?.id === u.id}
                      onToggle={() => setExpandedId((id) => (id === u.id ? null : u.id))}
                      onReload={load}
                      showToast={showToast}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          brands={brands}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

type Group = { key: string; title: string; hint: string; users: AdminUser[] };

function buildGroups(users: AdminUser[], mode: GroupMode, brands: BrandDisplay[]): Group[] {
  if (mode === "role") {
    return ROLE_ORDER.map((role) => ({
      key: role,
      title: ROLE_LABELS[role],
      hint: role,
      users: users.filter((u) => u.role === role),
    }));
  }

  if (mode === "brand") {
    const byBrand = new Map<string, AdminUser[]>();
    const unassigned: AdminUser[] = [];
    for (const user of users) {
      const ids = new Set<string>();
      if (user.brandId) ids.add(user.brandId);
      for (const access of user.brandAccesses ?? []) ids.add(access.brandId);
      if (ids.size === 0) {
        unassigned.push(user);
        continue;
      }
      for (const id of ids) {
        const list = byBrand.get(id) ?? [];
        list.push(user);
        byBrand.set(id, list);
      }
    }
    const named = brands
      .filter((b) => (byBrand.get(b.id) ?? []).length > 0)
      .map((b) => ({
        key: b.id,
        title: b.name,
        hint: b.slug,
        users: byBrand.get(b.id) ?? [],
      }));
    const unknown = [...byBrand.entries()]
      .filter(([id]) => !brands.some((b) => b.id === id))
      .map(([id, list]) => ({
        key: id,
        title: list[0]?.brand?.name || list[0]?.brandAccesses?.find((a) => a.brandId === id)?.brandName || "Marca",
        hint: id.slice(0, 8),
        users: list,
      }));
    return [
      ...named,
      ...unknown,
      { key: "none", title: "Sin marca", hint: "Ni dueño ni acceso", users: unassigned },
    ];
  }

  const withNone: AdminUser[] = [];
  const byProvider = new Map<string, AdminUser[]>();
  for (const user of users) {
    const providers = user.providers ?? [];
    if (providers.length === 0) {
      withNone.push(user);
      continue;
    }
    for (const provider of providers) {
      const list = byProvider.get(provider) ?? [];
      list.push(user);
      byProvider.set(provider, list);
    }
  }
  const namedProviders = ALL_PROVIDERS
    .filter((provider) => (byProvider.get(provider) ?? []).length > 0)
    .map((provider) => ({
      key: provider,
      title: providerLabel(provider),
      hint: "credenciales cargadas",
      users: byProvider.get(provider) ?? [],
    }));
  return [
    ...namedProviders,
    { key: "none", title: "Sin proveedores", hint: "sin credenciales", users: withNone },
  ];
}

function UserRow({
  user,
  brands,
  expanded,
  isSelf,
  onToggle,
  onReload,
  showToast,
}: {
  user: AdminUser;
  brands: BrandDisplay[];
  expanded: boolean;
  isSelf: boolean;
  onToggle: () => void;
  onReload: () => void;
  showToast: ToastFn;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-900/60 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-surface-100 truncate">{user.username}</span>
            {isSelf && <span className="text-[10px] uppercase tracking-wide text-yellow-400">vos</span>}
            <RoleBadge role={user.role} />
            <StatusBadge active={user.active} />
          </div>
          <p className="text-xs text-surface-500 truncate mt-0.5">
            {user.email}
            {user.brand?.name ? ` · marca ${user.brand.name}` : ""}
            {(user.providers ?? []).length > 0 ? ` · ${(user.providers ?? []).length} proveedores` : " · sin proveedores"}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-surface-500 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <UserDetail
          user={user}
          brands={brands}
          isSelf={isSelf}
          onReload={onReload}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  const tone =
    role === "ROLE_ADMIN"
      ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/25"
      : role === "ROLE_BRAND"
        ? "bg-sky-500/10 text-sky-400 border-sky-500/25"
        : "bg-surface-800 text-surface-300 border-surface-700";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${tone}`}>{ROLE_SHORT[role]}</span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
      active ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" : "bg-red-500/10 text-red-400 border-red-500/25"
    }`}>
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

function UserDetail({
  user,
  brands,
  isSelf,
  onReload,
  showToast,
}: {
  user: AdminUser;
  brands: BrandDisplay[];
  isSelf: boolean;
  onReload: () => void;
  showToast: ToastFn;
}) {
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [brandId, setBrandId] = useState(user.brandId ?? "");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
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
    adminApi.getPermissions(user.id)
      .then((r) => setPerms(r.data))
      .catch(() => setPerms([]))
      .finally(() => setLoadingPerms(false));
  }, [user.id]);

  async function saveProfile() {
    setSaving(true);
    try {
      await adminApi.updateUser(user.id, {
        username,
        email,
        brandId: brandId || null,
      });
      showToast("Datos actualizados");
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
      showToast("Rol actualizado");
      onReload();
    } catch (err) {
      showToast(errMsg(err, "No se pudo cambiar el rol"), false);
    }
  }

  async function toggleActive() {
    try {
      await adminApi.updateActiveStatus(user.id, !user.active);
      showToast(user.active ? "Usuario desactivado" : "Usuario activado");
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
    setResetting(true);
    try {
      await adminApi.resetPassword(user.id, password);
      showToast("Contraseña de Nodo reseteada");
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
      showToast("Permisos actualizados");
    } catch (err) {
      showToast(errMsg(err, "No se pudieron guardar los permisos"), false);
    } finally {
      setSavingPerms(false);
    }
  }

  async function remove() {
    if (isSelf) return;
    if (!window.confirm(`¿Eliminar a ${user.username}? Esta acción no se puede deshacer.`)) return;
    try {
      await adminApi.deleteUser(user.id);
      showToast("Usuario eliminado");
      onReload();
    } catch (err) {
      showToast(errMsg(err, "No se pudo eliminar"), false);
    }
  }

  return (
    <div className="px-4 pb-4 pt-1 bg-surface-950/40 grid lg:grid-cols-2 gap-4">
      <div className="border border-surface-800 rounded-xl p-3 flex flex-col gap-3">
        <p className="text-[11px] uppercase tracking-wider text-surface-500 font-semibold">Cuenta Nodo</p>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-surface-500">Usuario</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-surface-500">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-surface-500">Rol</span>
            <select
              value={user.role}
              onChange={(e) => changeRole(e.target.value as UserRole)}
              className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
            >
              <option value="ROLE_USER">Usuario</option>
              <option value="ROLE_ADMIN">Administrador</option>
              <option value="ROLE_BRAND">Marca</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-surface-500">Marca asignada</span>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
            >
              <option value="">Sin marca</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
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
                user.active ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-red-500/10 border-red-500/25 text-red-400"
              }`}
            >
              {user.active ? "Activo" : "Inactivo"}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-surface-600">Creado {formatDate(user.createdAt)}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={saveProfile}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg py-2 transition-all"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Guardar datos"}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={isSelf}
            className="px-3 rounded-lg border border-surface-700 text-surface-400 hover:text-red-400 hover:border-red-500/30 disabled:opacity-30"
            title={isSelf ? "No podés eliminarte a vos mismo" : "Eliminar"}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <form onSubmit={resetPassword} className="border border-surface-800 rounded-xl p-3 flex flex-col gap-3">
          <p className="text-[11px] uppercase tracking-wider text-surface-500 font-semibold flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" /> Contraseña de Nodo
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
          <button
            type="submit"
            disabled={resetting}
            className="flex items-center justify-center gap-2 bg-surface-800 hover:bg-surface-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg py-2 transition-all"
          >
            {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Resetear contraseña"}
          </button>
        </form>

        <div className="border border-surface-800 rounded-xl p-3 flex flex-col gap-3">
          <p className="text-[11px] uppercase tracking-wider text-surface-500 font-semibold flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Módulos
          </p>
          {loadingPerms ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-brand-500" /></div>
          ) : (
            <div className="divide-y divide-surface-800 border border-surface-800 rounded-lg overflow-hidden">
              {perms.map((p) => (
                <div key={p.module} className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs text-surface-200">{MODULE_LABELS[p.module]}</span>
                  <button
                    type="button"
                    onClick={() => setPerms((prev) => prev.map((x) => (x.module === p.module ? { ...x, allowed: !x.allowed } : x)))}
                    className={`w-10 rounded-full relative transition-colors ${p.allowed ? "bg-brand-600" : "bg-surface-600"}`}
                    style={{ height: 22 }}
                  >
                    <span className={`absolute top-0.5 bg-white rounded-full transition-all ${p.allowed ? "left-[22px]" : "left-0.5"}`} style={{ width: 18, height: 18 }} />
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
            {savingPerms ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Guardar permisos"}
          </button>
        </div>

        <div className="border border-surface-800 rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wider text-surface-500 font-semibold mb-2">Proveedores conectados</p>
          {(user.providers ?? []).length === 0 ? (
            <p className="text-xs text-surface-500">Este usuario no cargó credenciales de distribuidores.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(user.providers ?? []).map((p) => (
                <span key={p} className="text-[11px] font-medium px-2 py-1 rounded-md bg-surface-800 text-surface-200 border border-surface-700">
                  {providerLabel(p)}
                </span>
              ))}
            </div>
          )}
          {(user.brandAccesses ?? []).length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wider text-surface-500 font-semibold mb-2">Accesos a marcas</p>
              <div className="flex flex-col gap-1">
                {(user.brandAccesses ?? []).map((a) => (
                  <p key={`${a.brandId}-${a.status}`} className="text-xs text-surface-300">
                    {a.brandName} <span className="text-surface-500">· {a.status}</span>
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateUserModal({
  brands,
  onClose,
  onCreated,
  showToast,
}: {
  brands: BrandDisplay[];
  onClose: () => void;
  onCreated: () => void;
  showToast: ToastFn;
}) {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    role: "ROLE_USER" as UserRole,
    brandId: "",
    active: true,
    endDate: "",
  });
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.createUser({
        username: form.username,
        email: form.email,
        password: form.password,
        role: form.role,
        brandId: form.brandId || undefined,
        active: form.active,
        endDate: form.endDate || undefined,
      });
      showToast("Usuario creado");
      onCreated();
    } catch (err) {
      showToast(errMsg(err, "Error al crear el usuario"), false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface-950 border border-surface-800 rounded-2xl p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Nuevo usuario</h3>
          <button onClick={onClose} className="text-surface-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <input required placeholder="Usuario" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500" />
          <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500" />
          <input required type="password" minLength={8} placeholder="Contraseña Nodo (mín. 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500" />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500">
            <option value="ROLE_USER">Usuario</option>
            <option value="ROLE_ADMIN">Administrador</option>
            <option value="ROLE_BRAND">Marca</option>
          </select>
          <select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500">
            <option value="">Sin marca asignada</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500" />
          <label className="flex items-center gap-2 text-xs text-surface-300">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Cuenta activa
          </label>
          <button type="submit" disabled={saving} className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg py-2.5 transition-all mt-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear usuario"}
          </button>
        </form>
      </div>
    </div>
  );
}
