"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrefs, DollarType } from "@/lib/prefs";
import { useTheme, THEME_OPTIONS, type Theme } from "@/lib/theme";
import { getTenant, getUser } from "@/lib/auth";
import { canManageCommerce } from "@/lib/commerce";
import {
  myApi,
  invalidateMyProviders,
  loadMyProviders,
  TENANT_ROLE_LABELS,
  tenantRoleLabel,
  TENANT_ROLES_BY_TYPE,
  type CommerceProfile,
  type TenantMember,
  type TenantRole,
  type VisibleProvider,
} from "@/lib/api";
import RedeemAccessCode from "@/components/RedeemAccessCode";
import GeneratedPassword from "@/components/admin/GeneratedPassword";
import {
  Settings, Palette, DollarSign, Receipt, Check, RefreshCw, Sun, Moon, Sparkles,
  Building2, Users, ClipboardList, Link2, Loader2,
} from "lucide-react";

const THEME_ICONS: Record<Theme, React.ElementType> = {
  soft: Sparkles,
  dark: Moon,
  light: Sun,
};

type Tab = "local" | "equipo" | "pedidos" | "vinculados" | "preferencias";

export default function ConfiguracionPage() {
  const user = getUser();
  const tenant = getTenant();
  const isRetailer = tenant?.type === "RETAILER";
  const manage = canManageCommerce();
  const [tab, setTab] = useState<Tab>(isRetailer ? "local" : "preferencias");

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "local", label: "Local", show: !!tenant },
    { key: "equipo", label: "Equipo", show: isRetailer && manage },
    { key: "pedidos", label: "Pedidos", show: isRetailer && manage },
    { key: "vinculados", label: "Proveedores vinculados", show: isRetailer },
    { key: "preferencias", label: "Preferencias", show: true },
  ];

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-600/15 border border-brand-500/25 flex items-center justify-center">
            <Settings className="w-4 h-4 text-brand-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Configuración</h1>
            <p className="text-xs text-surface-500">
              {tenant?.name ?? user?.username ?? "Tu cuenta"}
            </p>
          </div>
        </div>
        <div className="flex gap-1 mt-4 -mb-4 overflow-x-auto">
          {tabs.filter((t) => t.show).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`text-xs font-medium px-3 py-2 border-b-2 -mb-px whitespace-nowrap transition-all ${
                tab === t.key
                  ? "border-brand-500 text-brand-400"
                  : "border-transparent text-surface-500 hover:text-surface-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
          {tab === "local" && tenant && <LocalTab manage={manage} />}
          {tab === "equipo" && <EquipoTab />}
          {tab === "pedidos" && <PedidosTab />}
          {tab === "vinculados" && <VinculadosTab manage={manage} />}
          {tab === "preferencias" && <PreferenciasTab />}
        </div>
      </div>
    </>
  );
}

function LocalTab({ manage }: { manage: boolean }) {
  const [profile, setProfile] = useState<CommerceProfile | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void myApi.commerce().then((res) => {
      setProfile(res.data);
      setName(res.data.name);
      setEmail(res.data.contactEmail ?? "");
      setPhone(res.data.contactPhone ?? "");
    }).catch(() => setMsg({ ok: false, text: "No se pudo cargar el local" }));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await myApi.updateCommerce({
        name: name.trim(),
        contactEmail: email.trim() || null,
        contactPhone: phone.trim() || null,
      });
      setProfile(res.data);
      setMsg({ ok: true, text: "Datos del local guardados" });
    } catch (err: unknown) {
      const text = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMsg({ ok: false, text: text || "No se pudo guardar" });
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>;
  }

  return (
    <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-4 h-4 text-brand-400" />
        <h2 className="text-sm font-semibold text-white">Local</h2>
      </div>
      <p className="text-xs text-surface-500 mb-4">Nombre y contacto de {profile.name}.</p>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div>
          <label className="block text-xs font-medium text-surface-400 mb-1.5">Nombre</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!manage}
            required
            minLength={2}
            className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white disabled:opacity-60 focus:outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-400 mb-1.5">Email de contacto</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!manage}
            className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white disabled:opacity-60 focus:outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-400 mb-1.5">Teléfono</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={!manage}
            className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white disabled:opacity-60 focus:outline-none focus:border-brand-500"
          />
        </div>
        {manage && (
          <button
            type="submit"
            disabled={saving}
            className="self-start flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Guardar
          </button>
        )}
        {msg && (
          <p className={`text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
        )}
      </form>
    </section>
  );
}

function EquipoTab() {
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState({ username: "", email: "", role: "SELLER" as TenantRole, title: "" });
  const [sending, setSending] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const roles = TENANT_ROLES_BY_TYPE.RETAILER;

  const load = useCallback(async () => {
    try {
      const res = await myApi.team();
      setMembers(res.data ?? []);
    } catch {
      setMsg({ ok: false, text: "No se pudo cargar el equipo" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setMsg(null);
    setGenerated(null);
    try {
      const res = await myApi.inviteMember({
        username: invite.username.trim(),
        email: invite.email.trim(),
        role: invite.role,
        title: invite.title.trim() || undefined,
      });
      setGenerated(res.data.generatedPassword ?? null);
      setInvite({ username: "", email: "", role: "SELLER", title: "" });
      await load();
    } catch (err: unknown) {
      const text = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMsg({ ok: false, text: text || "No se pudo invitar" });
    } finally {
      setSending(false);
    }
  }

  async function changeRole(member: TenantMember, role: TenantRole) {
    try {
      await myApi.updateMember(member.membershipId, { role });
      await load();
    } catch (err: unknown) {
      const text = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMsg({ ok: false, text: text || "No se pudo cambiar el rol" });
    }
  }

  async function toggleActive(member: TenantMember) {
    try {
      await myApi.updateMember(member.membershipId, { active: !member.membershipActive });
      await load();
    } catch (err: unknown) {
      const text = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMsg({ ok: false, text: text || "No se pudo actualizar" });
    }
  }

  return (
    <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-brand-400" />
        <h2 className="text-sm font-semibold text-white">Equipo</h2>
      </div>
      <p className="text-xs text-surface-500 mb-4">Quién trabaja en el local. Al invitar se genera una contraseña de una sola vez.</p>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
      ) : (
        <div className="border border-surface-800 rounded-lg divide-y divide-surface-800 mb-5">
          {members.length === 0 && (
            <p className="text-xs text-surface-500 px-3 py-3">Todavía no hay nadie más en el equipo.</p>
          )}
          {members.map((member) => (
            <div key={member.membershipId} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <div className="flex-1 min-w-[140px]">
                <p className="text-sm text-surface-200">{member.username}</p>
                <p className="text-[11px] text-surface-500">{member.email}</p>
              </div>
              <select
                value={member.tenantRole === "OWNER" ? "ADMIN" : member.tenantRole}
                onChange={(e) => changeRole(member, e.target.value as TenantRole)}
                className="bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white"
              >
                {roles.map((role) => (
                  <option key={role} value={role}>{tenantRoleLabel(role, "RETAILER")}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => toggleActive(member)}
                className={`text-xs rounded-md px-2 py-1.5 border ${
                  member.membershipActive
                    ? "border-surface-700 text-surface-400 hover:text-red-300"
                    : "border-emerald-500/30 text-emerald-400"
                }`}
              >
                {member.membershipActive ? "Desactivar" : "Activar"}
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={inviteMember} className="flex flex-col gap-3 border-t border-surface-800 pt-4">
        <p className="text-xs font-semibold text-white">Invitar</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            value={invite.username}
            onChange={(e) => setInvite({ ...invite, username: e.target.value })}
            placeholder="Usuario"
            required
            minLength={3}
            className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
          />
          <input
            type="email"
            value={invite.email}
            onChange={(e) => setInvite({ ...invite, email: e.target.value })}
            placeholder="Email"
            required
            className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <select
            value={invite.role}
            onChange={(e) => setInvite({ ...invite, role: e.target.value as TenantRole })}
            className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {roles.map((role) => (
              <option key={role} value={role}>{TENANT_ROLE_LABELS[role]}</option>
            ))}
          </select>
          <input
            value={invite.title}
            onChange={(e) => setInvite({ ...invite, title: e.target.value })}
            placeholder="Cargo (opcional)"
            className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
          />
        </div>
        <button
          type="submit"
          disabled={sending}
          className="self-start flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2.5"
        >
          {sending && <Loader2 className="w-4 h-4 animate-spin" />}
          Invitar
        </button>
      </form>

      {generated && (
        <div className="mt-4">
          <GeneratedPassword password={generated} onDismiss={() => setGenerated(null)} />
        </div>
      )}
      {msg && (
        <p className={`text-xs mt-3 ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
      )}
    </section>
  );
}

function PedidosTab() {
  const [value, setValue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void myApi.commerce().then((res) => {
      setValue(res.data.buyerCanConfirm);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function toggle() {
    const next = !value;
    setValue(next);
    setSaving(true);
    setMsg(null);
    try {
      await myApi.setBuyerCanConfirm(next);
    } catch {
      setValue(!next);
      setMsg("No se pudo guardar el tilde");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <ClipboardList className="w-4 h-4 text-brand-400" />
        <h2 className="text-sm font-semibold text-white">Pedidos</h2>
      </div>
      <p className="text-xs text-surface-500 mb-4 leading-relaxed">
        El vendedor nunca manda un pedido al mayorista: siempre espera tu firma.
        El comprador, si le das vía libre, confirma solo.
      </p>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
      ) : (
        <button
          type="button"
          onClick={toggle}
          disabled={saving}
          className="w-full flex items-center justify-between bg-surface-800 hover:bg-surface-700 border border-surface-700 rounded-xl px-4 py-3 transition-all"
        >
          <span className="text-sm text-surface-200 text-left">El comprador puede confirmar pedidos</span>
          <div className={`w-9 h-5 rounded-full relative transition-colors ${value ? "bg-brand-600" : "bg-surface-600"}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${value ? "left-4" : "left-0.5"}`} />
          </div>
        </button>
      )}
      {msg && <p className="text-xs text-red-400 mt-2">{msg}</p>}
    </section>
  );
}

function VinculadosTab({ manage }: { manage: boolean }) {
  const [list, setList] = useState<VisibleProvider[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    invalidateMyProviders();
    const mine = await loadMyProviders(true);
    setList(mine);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const linked = list.filter((p) => p.linked);

  return (
    <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Link2 className="w-4 h-4 text-brand-400" />
        <h2 className="text-sm font-semibold text-white">Proveedores vinculados</h2>
      </div>
      <p className="text-xs text-surface-500 mb-4">Con quién trabaja este local. El descuento de cuenta lo define el mayorista.</p>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
      ) : linked.length === 0 ? (
        <p className="text-sm text-surface-400 mb-4">Todavía no estás conectado con ningún proveedor.</p>
      ) : (
        <div className="flex flex-col gap-2 mb-5">
          {linked.map((p) => (
            <div key={p.provider} className="border border-surface-800 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-white font-medium">{p.name}</p>
                <span className={`text-[10px] font-semibold ${p.hasCredentials ? "text-emerald-400" : "text-surface-500"}`}>
                  {p.hasCredentials ? "Cuenta cargada" : "Sin cuenta"}
                </span>
              </div>
              {p.accountManager && (
                <p className="text-[11px] text-surface-500 mt-1">
                  Vendedor de contacto: {p.accountManager.name} · {p.accountManager.email}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {manage ? (
        <RedeemAccessCode onRedeemed={() => { void load(); }} />
      ) : (
        <p className="text-xs text-surface-500">Solo el administrador canjea códigos de vinculación.</p>
      )}
    </section>
  );
}

function PreferenciasTab() {
  const { theme, setTheme } = useTheme();
  const {
    currency, setCurrency, withIva, setWithIva,
    dollarType, setDollarType, rates, currentRate, refreshRates, loadingRates, dollarLabel,
  } = usePrefs();

  return (
    <>
      <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Palette className="w-4 h-4 text-brand-400" />
          <h2 className="text-sm font-semibold text-white">Apariencia</h2>
        </div>
        <p className="text-xs text-surface-500 mb-4 leading-relaxed">
          El modo Suave combina un fondo oscuro moderado con tarjetas de producto blancas.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map((opt) => {
            const Icon = THEME_ICONS[opt.value];
            const active = theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  active
                    ? "border-brand-500 bg-brand-600/10 ring-1 ring-brand-500/30"
                    : "border-surface-700 bg-surface-800/50 hover:border-surface-600"
                }`}
              >
                <Icon className={`w-5 h-5 mb-2 ${active ? "text-brand-400" : "text-surface-400"}`} />
                <p className="text-sm font-semibold text-white mb-1">{opt.label}</p>
                <p className="text-[11px] text-surface-500 leading-snug">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Moneda y cotizaciones</h2>
          </div>
          <button
            type="button"
            onClick={refreshRates}
            disabled={loadingRates}
            className="text-surface-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-surface-800"
            title="Actualizar cotizaciones"
          >
            <RefreshCw className={`w-4 h-4 ${loadingRates ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          <div>
            <label className="block text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-2">
              Moneda de visualización
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["ARS", "USD"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-lg border transition-all ${
                    currency === c
                      ? "bg-brand-600/15 border-brand-500 text-brand-400"
                      : "border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-600"
                  }`}
                >
                  {currency === c && <Check className="w-3.5 h-3.5" />}
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-2">
              Tipo de dólar
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(["oficial", "blue", "mep", "tarjeta", "cripto", "mayorista"] as DollarType[]).map((t) => {
                const r = rates.find((rt) => rt.type === t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDollarType(t)}
                    className={`flex flex-col items-start text-left text-xs font-medium px-3 py-2 rounded-lg border transition-all ${
                      dollarType === t
                        ? "bg-brand-600/15 border-brand-500 text-brand-400"
                        : "border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-600"
                    }`}
                  >
                    <span className="font-semibold">{dollarLabel(t)}</span>
                    {r && (
                      <span className="text-[10px] text-surface-500 tabular-nums mt-0.5">
                        ${r.venta.toLocaleString("es-AR")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-2">
              Impuestos en precios
            </label>
            <button
              type="button"
              onClick={() => setWithIva(!withIva)}
              className="w-full flex items-center justify-between bg-surface-800 hover:bg-surface-700 border border-surface-700 rounded-xl px-4 py-3 transition-all"
            >
              <div className="flex items-center gap-2.5">
                <Receipt className="w-4 h-4 text-surface-400" />
                <span className="text-sm text-surface-200">Mostrar precios con impuestos</span>
              </div>
              <div className={`w-9 h-5 rounded-full relative transition-colors ${withIva ? "bg-brand-600" : "bg-surface-600"}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${withIva ? "left-4" : "left-0.5"}`} />
              </div>
            </button>
          </div>

          {currentRate && (
            <p className="text-[11px] text-surface-500 border-t border-surface-800 pt-3">
              Cotización actualizada:{" "}
              {new Date(currentRate.fechaActualizacion).toLocaleString("es-AR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
