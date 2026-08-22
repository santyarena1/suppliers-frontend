"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  adminApi, AdminUser, ProviderDisplay, BrandDisplay, Banner,
  ModulePermission, ModuleKey, ALL_PROVIDERS,
} from "@/lib/api";
import { isAdmin, getUser } from "@/lib/auth";
import UsersManagement from "@/components/admin/UsersManagement";
import OrganizationsTree from "@/components/admin/OrganizationsTree";
import {
  Users, ShieldCheck, Boxes, Building2, Image as ImageIcon,
  Loader2, CheckCircle2, XCircle, Zap, Plus, Trash2, X, Palette, Network,
} from "lucide-react";
import {
  BANNER_SLOTS, BRAND_PRESET_LABELS, BRAND_PRESETS, applyBrandPreset, type BrandPreset, type BannerSlot,
} from "@/lib/brand-presets";

type Tab = "organizations" | "users" | "permissions" | "providers" | "brands" | "banners" | "appearance";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "organizations", label: "Organizaciones", icon: <Network className="w-3.5 h-3.5" /> },
  { key: "users", label: "Usuarios", icon: <Users className="w-3.5 h-3.5" /> },
  { key: "permissions", label: "Permisos", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  { key: "providers", label: "Proveedores", icon: <Boxes className="w-3.5 h-3.5" /> },
  { key: "brands", label: "Marcas", icon: <Building2 className="w-3.5 h-3.5" /> },
  { key: "banners", label: "Banners", icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { key: "appearance", label: "Apariencia", icon: <Palette className="w-3.5 h-3.5" /> },
];

const MODULE_LABELS: Record<ModuleKey, string> = {
  search: "Búsqueda",
  cart: "Carrito",
  credentials: "Credenciales (en Proveedores)",
  providers: "Proveedores",
  brands: "Portal de Marcas",
  diagnostics: "Diagnóstico",
  admin: "Administración",
};

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("organizations");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!isAdmin()) router.replace("/search");
  }, [router]);

  const currentUser = getUser();

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <>
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

          <div className="flex-shrink-0 border-b border-surface-800 px-6 flex gap-1">
            {TABS.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3.5 py-2.5 border-b-2 -mb-px transition-all ${
                  tab === key ? "border-brand-500 text-brand-700 dark:text-brand-400" : "border-transparent text-surface-500 hover:text-surface-300"
                }`}
              >
                {icon}{label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {tab === "organizations" && <OrganizationsTree showToast={showToast} />}
            {tab === "users" && <UsersManagement showToast={showToast} />}
            {tab === "permissions" && <PermissionsTab showToast={showToast} />}
            {tab === "providers" && <ProvidersTab showToast={showToast} />}
            {tab === "brands" && <BrandsTab showToast={showToast} />}
            {tab === "banners" && <BannersTab showToast={showToast} />}
            {tab === "appearance" && <AppearanceTab showToast={showToast} />}
          </div>

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
    </>
  );
}

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

// ---------- Permisos ----------

function PermissionsTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [perms, setPerms] = useState<ModulePermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { adminApi.listUsers().then((r) => setUsers(r.data)).catch(() => setUsers([])); }, []);

  useEffect(() => {
    if (!selected) { setPerms([]); return; }
    setLoading(true);
    adminApi.getPermissions(selected).then((r) => setPerms(r.data)).catch(() => setPerms([])).finally(() => setLoading(false));
  }, [selected]);

  function toggle(module: ModuleKey) {
    setPerms((prev) => prev.map((p) => (p.module === module ? { ...p, allowed: !p.allowed } : p)));
  }

  async function save() {
    setSaving(true);
    try {
      await adminApi.updatePermissions(selected, perms);
      showToast("Permisos actualizados");
    } catch (err) {
      showToast(errMsg(err, "Error al guardar permisos"), false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg flex flex-col gap-4">
      <div>
        <label className="block text-xs font-medium text-surface-400 mb-1.5">Usuario</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
        >
          <option value="">Elegí un usuario...</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
        </select>
      </div>

      {loading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>}

      {!loading && selected && perms.length > 0 && (
        <div className="border border-surface-800 rounded-xl divide-y divide-surface-800">
          {perms.map((p) => (
            <div key={p.module} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="text-sm text-surface-200">{MODULE_LABELS[p.module]}</span>
                {p.module === "credentials" && (
                  <p className="text-[11px] text-surface-500 mt-0.5">Ya no tiene ítem propio en el menú: vive en cada proveedor.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => toggle(p.module)}
                className={`w-10 rounded-full relative transition-colors ${p.allowed ? "bg-brand-600" : "bg-surface-600"}`}
                style={{ height: 22 }}
              >
                <span className={`absolute top-0.5 bg-white rounded-full transition-all ${p.allowed ? "left-[22px]" : "left-0.5"}`} style={{ width: 18, height: 18 }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && perms.length > 0 && (
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg py-2.5 transition-all"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar permisos"}
        </button>
      )}
    </div>
  );
}

// ---------- Proveedores ----------

function ProvidersTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const [rows, setRows] = useState<ProviderDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.listProviderDisplay().then((r) => setRows(r.data)).catch(() => setRows(ALL_PROVIDERS.map((p) => ({ provider: p, visible: true, logoUrl: null, textColor: null })))).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function update(provider: ProviderDisplay["provider"], patch: Partial<ProviderDisplay>) {
    setRows((prev) => prev.map((r) => (r.provider === provider ? { ...r, ...patch } : r)));
    try {
      await adminApi.updateProviderDisplay(provider, patch);
    } catch (err) {
      showToast(errMsg(err, "Error al guardar"), false);
      load();
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>;

  return (
    <div className="max-w-3xl flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-white mb-2">Visibilidad y marca de proveedores</h2>
      {rows.map((r) => (
        <div key={r.provider} className="flex items-center gap-3 border border-surface-800 rounded-xl px-4 py-3">
          <div className="w-6 h-6 rounded bg-surface-800 flex-shrink-0 overflow-hidden flex items-center justify-center">
            {r.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.logoUrl} alt="" className="w-full h-full object-contain" />
            ) : null}
          </div>
          <span className="text-sm font-medium text-surface-200 w-40 flex-shrink-0" style={r.textColor ? { color: r.textColor } : undefined}>
            {r.provider.replace(/_/g, " ")}
          </span>
          <input
            type="text"
            placeholder="URL del logo"
            defaultValue={r.logoUrl ?? ""}
            onBlur={(e) => update(r.provider, { logoUrl: e.target.value || undefined })}
            className="flex-1 bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
          />
          <input
            type="color"
            value={r.textColor ?? "#a1a1aa"}
            onChange={(e) => update(r.provider, { textColor: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer bg-transparent border border-surface-700"
          />
          <button
            onClick={() => update(r.provider, { visible: !r.visible })}
            className={`text-xs font-medium px-2.5 py-1.5 rounded-md border flex-shrink-0 ${
              r.visible ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-red-500/10 border-red-500/25 text-red-400"
            }`}
          >
            {r.visible ? "Visible" : "Oculto"}
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------- Marcas ----------

function BrandsTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const [rows, setRows] = useState<BrandDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.listBrandDisplay().then((r) => setRows(r.data)).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function update(id: string, patch: Partial<BrandDisplay>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    try {
      await adminApi.updateBrandDisplay(id, patch);
    } catch (err) {
      showToast(errMsg(err, "Error al guardar"), false);
      load();
    }
  }

  return (
    <div className="max-w-3xl flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-white">Visibilidad y marca</h2>
      <p className="text-xs text-surface-500 -mt-2">
        El Portal de Marcas todavía corre sobre datos de prueba en el frontend (el backend real
        de Marcas no está construido) — estos controles quedan funcionando y guardados para
        cuando ese módulo tenga backend propio.
      </p>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-surface-500 border border-surface-800 rounded-xl px-4 py-6 text-center">Todavía no hay marcas cargadas.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border border-surface-800 rounded-xl px-4 py-3">
              <div className="w-6 h-6 rounded bg-surface-800 flex-shrink-0 overflow-hidden flex items-center justify-center">
                {r.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.logoUrl} alt="" className="w-full h-full object-contain" />
                ) : null}
              </div>
              <span className="text-sm font-medium text-surface-200 w-40 flex-shrink-0 truncate" style={r.textColor ? { color: r.textColor } : undefined}>
                {r.name}
              </span>
              <input
                type="text"
                placeholder="URL del logo"
                defaultValue={r.logoUrl ?? ""}
                onBlur={(e) => update(r.id, { logoUrl: e.target.value || undefined })}
                className="flex-1 bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
              />
              <input
                type="color"
                value={r.textColor ?? "#a1a1aa"}
                onChange={(e) => update(r.id, { textColor: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border border-surface-700"
              />
              <button
                onClick={() => update(r.id, { visible: !r.visible })}
                className={`text-xs font-medium px-2.5 py-1.5 rounded-md border flex-shrink-0 ${
                  r.visible ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-red-500/10 border-red-500/25 text-red-400"
                }`}
              >
                {r.visible ? "Visible" : "Oculta"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Banners ----------

function BannersTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    position: "search" as "home" | "search",
    slot: "hero_main" as BannerSlot,
    imageUrl: "",
    title: "",
    subtitle: "",
    linkUrl: "",
    order: 0,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.listBanners().then((r) => setBanners(r.data)).catch(() => setBanners([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.createBanner(form);
      showToast("Banner creado");
      setShowCreate(false);
      setForm({ position: "search", slot: "hero_main", imageUrl: "", title: "", subtitle: "", linkUrl: "", order: 0 });
      load();
    } catch (err) {
      showToast(errMsg(err, "Error al crear el banner"), false);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(b: Banner) {
    try {
      await adminApi.updateBanner(b.id, { active: !b.active });
      load();
    } catch (err) {
      showToast(errMsg(err, "Error al actualizar"), false);
    }
  }

  async function remove(b: Banner) {
    if (!window.confirm("¿Eliminar este banner?")) return;
    try {
      await adminApi.deleteBanner(b.id);
      showToast("Banner eliminado");
      load();
    } catch (err) {
      showToast(errMsg(err, "Error al eliminar"), false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white">Banners ({banners.length})</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg px-3 py-2 transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> Nuevo banner
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
      ) : banners.length === 0 ? (
        <p className="text-xs text-surface-500 border border-surface-800 rounded-xl px-4 py-6 text-center">Todavía no hay banners cargados.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {banners.map((b) => (
            <div key={b.id} className="flex items-center gap-3 border border-surface-800 rounded-xl px-4 py-3">
              <div className="w-16 h-10 rounded bg-surface-800 flex-shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.imageUrl} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-surface-200 truncate">{b.title || "(sin título)"}</p>
                <p className="text-[11px] text-surface-500">
                  {b.position === "home" ? "Home" : "Buscador"}
                  {b.slot ? ` · ${b.slot}` : ""} · orden {b.order}
                </p>
              </div>
              <button
                onClick={() => toggleActive(b)}
                className={`text-xs font-medium px-2.5 py-1.5 rounded-md border flex-shrink-0 ${
                  b.active ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-red-500/10 border-red-500/25 text-red-400"
                }`}
              >
                {b.active ? "Activo" : "Inactivo"}
              </button>
              <button onClick={() => remove(b)} className="text-surface-500 hover:text-red-400 transition-colors flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-surface-950 border border-surface-800 rounded-2xl p-5 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Nuevo banner</h3>
              <button onClick={() => setShowCreate(false)} className="text-surface-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value as "home" | "search" })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500">
                <option value="home">Home</option>
                <option value="search">Buscador</option>
              </select>
              <select value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value as BannerSlot })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500">
                {BANNER_SLOTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <input required placeholder="URL de la imagen" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500" />
              <input placeholder="Título (opcional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500" />
              <input placeholder="Subtítulo (opcional)" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500" />
              <input placeholder="Link (opcional)" value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500" />
              <input type="number" placeholder="Orden" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500" />
              <button type="submit" disabled={saving} className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg py-2.5 transition-all mt-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear banner"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Apariencia (identidad visual) ----------

function AppearanceTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const [preset, setPreset] = useState<BrandPreset>("violet");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.getPlatformSettings()
      .then((r) => {
        const p = r.data.brandPreset as BrandPreset;
        setPreset(p in BRAND_PRESET_LABELS ? p : "violet");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await adminApi.updatePlatformSettings(preset);
      applyBrandPreset(preset);
      showToast("Identidad visual actualizada");
    } catch (err) {
      showToast(errMsg(err, "Error al guardar"), false);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-sm font-semibold text-white mb-1">Identidad visual</h2>
      <p className="text-xs text-surface-500 mb-5 leading-relaxed">
        Cambia el color principal del sistema para todos los usuarios. El violeta NODO es el predeterminado; otros presets (ej. rojo gamer) quedan disponibles como alternativa.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-5">
        {(Object.keys(BRAND_PRESET_LABELS) as BrandPreset[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setPreset(key);
              applyBrandPreset(key);
            }}
            className={`rounded-xl border p-4 text-left transition-all ${
              preset === key
                ? "border-brand-500 bg-brand-600/10 ring-1 ring-brand-500/30"
                : "border-surface-800 bg-surface-900 hover:border-surface-600"
            }`}
          >
            <div
              className="w-full h-8 rounded-lg mb-3"
              style={{ backgroundColor: `rgb(${BRAND_PRESETS[key][600]})` }}
            />
            <p className="text-sm font-medium text-white">{BRAND_PRESET_LABELS[key]}</p>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-all"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar para todos los usuarios"}
      </button>
    </div>
  );
}
