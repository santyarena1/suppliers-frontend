"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import GeneratedPassword from "@/components/admin/GeneratedPassword";
import {
  TENANT_ROLE_LABELS,
  TENANT_ROLES_BY_TYPE,
  myApi,
  type OwnOrg,
  type TenantMember,
  type TenantRole,
} from "@/lib/api";
import { getTenant } from "@/lib/auth";
import { KeyRound, Loader2, Plus, Trash2, Users, Building2, Megaphone } from "lucide-react";

const inputClass =
  "w-full bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/**
 * Personas de la organización. El dueño y el administrador las cargan acá,
 * sin pasar por el árbol de superadmin.
 */
export default function EquipoPage() {
  const session = getTenant();
  const [org, setOrg] = useState<OwnOrg | null>(null);
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [orgRes, teamRes] = await Promise.all([myApi.org(), myApi.team()]);
    setOrg(orgRes.data);
    setMembers(teamRes.data.members);
    setCanManage(teamRes.data.canManage);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      setAviso({ ok: false, text: errMsg(err, "No se pudo cargar el equipo") });
      setLoading(false);
    });
  }, [load]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const roles = TENANT_ROLES_BY_TYPE[org?.type ?? session?.type ?? "RETAILER"];

  async function run(action: () => Promise<unknown>, ok: string, fallback: string) {
    try {
      await action();
      setAviso({ ok: true, text: ok });
      await load();
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, fallback) });
    }
  }

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Equipo</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            {org ? `${org.name} · ${members.length} ${members.length === 1 ? "persona" : "personas"}` : "Tu organización"}
          </p>
        </div>
        <PrefsPanel />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4">
          {aviso && (
            <p className={`text-xs rounded-md px-3 py-2 ${aviso.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
              {aviso.text}
            </p>
          )}
          {generated && <GeneratedPassword password={generated} onDismiss={() => setGenerated(null)} />}

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : (
            <>
              {canManage && org && (
                <OrgProfile
                  org={org}
                  onSaved={(next) => {
                    setOrg(next);
                    setAviso({ ok: true, text: "Datos de la organización guardados" });
                  }}
                  onError={(text) => setAviso({ ok: false, text })}
                />
              )}
              <section className="border border-surface-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-surface-400" /> Personas
                </h2>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setShowAdd(true)}
                    className="flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar
                  </button>
                )}
              </div>

              {members.length === 0 ? (
                <p className="text-xs text-surface-500">Todavía no hay personas.</p>
              ) : (
                <div className="border border-surface-800 rounded-lg divide-y divide-surface-800">
                  {members.map((member) => (
                    <MemberRow
                      key={member.membershipId}
                      member={member}
                      roles={roles}
                      canManage={canManage}
                      orgName={org?.name ?? ""}
                      onRun={run}
                      onGenerated={setGenerated}
                    />
                  ))}
                </div>
              )}
            </section>
            </>
          )}
        </div>
      </div>

      {showAdd && org && (
        <AddMemberModal
          type={org.type}
          roles={roles}
          onClose={() => setShowAdd(false)}
          onCreated={async (password) => {
            setShowAdd(false);
            if (password) setGenerated(password);
            setAviso({ ok: true, text: "Persona agregada" });
            await load();
          }}
          onError={(text) => setAviso({ ok: false, text })}
        />
      )}
    </>
  );
}

function MemberRow({
  member,
  roles,
  canManage,
  orgName,
  onRun,
  onGenerated,
}: {
  member: TenantMember;
  roles: TenantRole[];
  canManage: boolean;
  orgName: string;
  onRun: (action: () => Promise<unknown>, ok: string, fallback: string) => Promise<void>;
  onGenerated: (password: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
      <div className="flex-1 min-w-[160px]">
        <p className="text-sm text-surface-200">{member.username}</p>
        <p className="text-[11px] text-surface-500">{member.email}</p>
      </div>
      {canManage ? (
        <>
          <input
            defaultValue={member.title ?? ""}
            placeholder="Cargo"
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value === (member.title ?? "")) return;
              onRun(
                () => myApi.updateMember(member.membershipId, { title: value || null }),
                "Cargo actualizado",
                "No se pudo guardar el cargo"
              );
            }}
            className="w-28 bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
          />
          <select
            value={member.tenantRole}
            onChange={(e) =>
              onRun(
                () => myApi.updateMember(member.membershipId, { role: e.target.value as TenantRole }),
                "Rol actualizado",
                "No se pudo cambiar el rol"
              )
            }
            className="bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {TENANT_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              onRun(
                () => myApi.updateMember(member.membershipId, { active: !member.membershipActive }),
                member.membershipActive ? "Membresía suspendida" : "Membresía reactivada",
                "No se pudo cambiar el estado"
              )
            }
            className={`text-[11px] font-medium px-2 py-1.5 rounded-md border ${
              member.membershipActive
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                : "bg-red-500/10 border-red-500/25 text-red-400"
            }`}
          >
            {member.membershipActive ? "Activa" : "Suspendida"}
          </button>
          <button
            type="button"
            title="Nueva contraseña"
            onClick={async () => {
              if (!window.confirm(`¿Generar una contraseña nueva para ${member.username}?`)) return;
              try {
                const res = await myApi.resetMemberPassword(member.membershipId);
                onGenerated(res.data.generatedPassword);
              } catch (err) {
                onRun(async () => {
                  throw err;
                }, "", "No se pudo resetear la contraseña");
              }
            }}
            className="text-surface-500 hover:text-surface-200"
          >
            <KeyRound className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`¿Quitar a ${member.username} de ${orgName}?`)) return;
              onRun(() => myApi.removeMember(member.membershipId), "Persona quitada", "No se pudo quitar");
            }}
            className="text-surface-500 hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <p className="text-xs text-surface-400">
          {TENANT_ROLE_LABELS[member.tenantRole]}
          {member.title ? ` · ${member.title}` : ""}
        </p>
      )}
      {canManage && member.tenantRole === "PRODUCT_MANAGER" && (
        <div className="w-full">
          <input
            defaultValue={(member.managedBrands ?? []).join(", ")}
            placeholder="Marcas que administra, separadas por coma"
            onBlur={(e) => {
              const brandNames = e.target.value.split(",").map((name) => name.trim()).filter(Boolean);
              onRun(
                () => myApi.setManagedBrands(member.membershipId, brandNames),
                "Marcas actualizadas",
                "No se pudieron guardar las marcas"
              );
            }}
            className={inputClass}
          />
        </div>
      )}
    </div>
  );
}

function AddMemberModal({
  type,
  roles,
  onClose,
  onCreated,
  onError,
}: {
  type: OwnOrg["type"];
  roles: TenantRole[];
  onClose: () => void;
  onCreated: (generatedPassword?: string) => Promise<void>;
  onError: (text: string) => void;
}) {
  const defaultRole = useMemo(
    () => (type === "DISTRIBUTOR" ? "SELLER" : "BUYER") as TenantRole,
    [type]
  );
  const [role, setRole] = useState<TenantRole>(roles.includes(defaultRole) ? defaultRole : roles[0]);
  const [title, setTitle] = useState("");
  const [form, setForm] = useState({ username: "", email: "" });
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await myApi.addMember({
        username: form.username.trim(),
        email: form.email.trim(),
        role,
        title: title.trim() || undefined,
      });
      await onCreated(res.data.generatedPassword);
    } catch (err) {
      onError(errMsg(err, "No se pudo agregar la persona"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface-950 border border-surface-800 rounded-2xl p-5 w-full max-w-sm">
        <h3 className="text-sm font-semibold text-white mb-1">Agregar persona</h3>
        <p className="text-[11px] text-surface-500 mb-4">
          Se genera una contraseña. Copiala: después no se puede volver a ver.
        </p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="text-[11px] text-surface-500 mb-1 block">Usuario</label>
            <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="text-[11px] text-surface-500 mb-1 block">Email</label>
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="text-[11px] text-surface-500 mb-1 block">Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value as TenantRole)} className={inputClass}>
              {roles.map((item) => (
                <option key={item} value={item}>
                  {TENANT_ROLE_LABELS[item]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-surface-500 mb-1 block">Cargo</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Opcional" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="text-xs text-surface-400 px-3 py-2">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg px-3.5 py-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Crear
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OrgProfile({
  org,
  onSaved,
  onError,
}: {
  org: OwnOrg;
  onSaved: (org: OwnOrg) => void;
  onError: (text: string) => void;
}) {
  const [email, setEmail] = useState(org.contactEmail ?? "");
  const [phone, setPhone] = useState(org.contactPhone ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await myApi.updateOrg({
        contactEmail: email.trim() || null,
        contactPhone: phone.trim() || null,
      });
      onSaved(res.data);
    } catch (err) {
      onError(errMsg(err, "No se pudieron guardar los datos"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border border-surface-800 rounded-xl p-4 flex flex-col gap-3">
      <h2 className="text-xs font-semibold text-white flex items-center gap-1.5">
        <Building2 className="w-3.5 h-3.5 text-surface-400" /> {org.name}
      </h2>
      <p className="text-[11px] text-surface-500">
        El contacto lo ven los otros de tu organización y, si sos un comercio, el vendedor del distribuidor.
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email de contacto"
          className={inputClass}
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Teléfono"
          className={inputClass}
        />
      </div>
      {org.type === "DISTRIBUTOR" && org.canManagePortfolio && (
        <Link
          href="/publicidad"
          className="flex items-center gap-2 text-xs text-brand-300 hover:text-brand-200 border border-surface-800 rounded-lg px-3 py-2"
        >
          <Megaphone className="w-3.5 h-3.5" />
          {org.advertisingEnabled
            ? "Publicidad: elegir espacios y ver el resumen a pagar"
            : "Publicidad: todavía no está habilitada. El admin de NODO la prende cuando pagan."}
        </Link>
      )}
      <div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 bg-surface-800 hover:bg-surface-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg px-3.5 py-2"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Guardar contacto
        </button>
      </div>
    </section>
  );
}
