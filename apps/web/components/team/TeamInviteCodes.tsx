"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, Loader2, MessageCircle, Plus, Ticket, XCircle } from "lucide-react";
import { TENANT_ROLE_LABELS, type TenantRole } from "@/lib/api";
import {
  TEAM_INVITE_STATUS_LABELS,
  teamInviteLink,
  teamInvitesApi,
  type TeamInvite,
} from "@/lib/teamInvites";

/** Roles que se pueden dar con un código en un comercio. Nunca dueño. */
const INVITE_ROLES: TenantRole[] = ["BUYER", "SELLER", "VIEWER", "ADMIN"];

interface TeamInviteCodesProps {
  orgName: string;
  /** Solo el dueño puede invitar administradores. */
  isOwner: boolean;
  onMessage: (ok: boolean, text: string) => void;
}

function apiMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/**
 * Códigos para sumarse al equipo: el dueño crea uno con un rol, lo comparte, y
 * quien se registra con él entra al comercio con ese rol.
 */
export default function TeamInviteCodes({ orgName, isOwner, onMessage }: TeamInviteCodesProps) {
  const [codes, setCodes] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [role, setRole] = useState<TenantRole>("SELLER");
  const [maxUses, setMaxUses] = useState("1");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await teamInvitesApi.list();
      setCodes(res.data);
    } catch (err) {
      onMessage(false, apiMessage(err, "No se pudieron cargar los códigos"));
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const uses = maxUses.trim() ? Number(maxUses) : null;
      const days = expiresInDays.trim() ? Number(expiresInDays) : null;
      const res = await teamInvitesApi.create({
        role,
        maxUses: uses,
        expiresAt: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
      });
      setCodes((prev) => [res.data, ...prev]);
      setShowForm(false);
      onMessage(true, `Código ${res.data.code} creado: compartilo con quien quieras sumar`);
    } catch (err) {
      onMessage(false, apiMessage(err, "No se pudo crear el código"));
    } finally {
      setCreating(false);
    }
  }

  async function revoke(invite: TeamInvite) {
    if (!window.confirm(`¿Revocar el código ${invite.code}? Ya no va a servir para sumarse.`)) return;
    try {
      await teamInvitesApi.revoke(invite.id);
      setCodes((prev) => prev.map((c) => (c.id === invite.id ? { ...c, revoked: true, status: "REVOKED" } : c)));
    } catch (err) {
      onMessage(false, apiMessage(err, "No se pudo revocar el código"));
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((v) => (v === key ? null : v)), 2000);
    } catch {
      onMessage(false, "No se pudo copiar");
    }
  }

  function shareText(invite: TeamInvite): string {
    return `Te invito a sumarte a ${orgName} en NODO como ${invite.roleLabel}. Registrate acá: ${teamInviteLink(invite.code)} (código ${invite.code})`;
  }

  const roles = INVITE_ROLES.filter((r) => isOwner || r !== "ADMIN");

  return (
    <section className="border border-surface-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Ticket className="w-3.5 h-3.5 text-surface-400" /> Códigos de invitación
          </h2>
          <p className="text-[11px] text-surface-500 mt-0.5">
            Quien se registra con el código entra a {orgName || "tu comercio"} con el rol que elijas. No hace falta que le crees el usuario.
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300 flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Nuevo código
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-surface-900 border border-surface-800 rounded-lg p-3">
          <label className="flex flex-col gap-1 text-[11px] text-surface-400">
            Rol
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as TenantRole)}
              className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
            >
              {roles.map((r) => (
                <option key={r} value={r}>{TENANT_ROLE_LABELS[r]}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-surface-400">
            Cuántas personas pueden usarlo
            <input
              type="number"
              min={1}
              max={500}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Sin límite"
              className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-surface-400">
            Vence en (días)
            <input
              type="number"
              min={1}
              max={365}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              placeholder="No vence"
              className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
            />
          </label>
          <div className="sm:col-span-3 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="h-9 px-3 text-xs text-surface-400 hover:text-white">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={creating}
              className="h-9 px-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-semibold active:scale-[0.98]"
            >
              {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Crear código
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-surface-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…</p>
      ) : codes.length === 0 ? (
        <p className="text-xs text-surface-500">Todavía no creaste ningún código.</p>
      ) : (
        <ul className="border border-surface-800 rounded-lg divide-y divide-surface-800">
          {codes.map((invite) => {
            const active = invite.status === "ACTIVE";
            return (
              <li key={invite.id} className={`p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${active ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-base font-semibold tracking-[0.12em] text-white">{invite.code}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-surface-800 text-surface-300">
                      {invite.roleLabel}
                    </span>
                    <span className={`text-[10px] font-semibold ${active ? "text-emerald-400" : "text-surface-500"}`}>
                      {TEAM_INVITE_STATUS_LABELS[invite.status]}
                    </span>
                  </div>
                  <p className="text-[11px] text-surface-500 mt-0.5 tabular-nums">
                    {invite.maxUses == null ? `${invite.usedCount} usos · sin límite` : `${invite.usedCount} de ${invite.maxUses} usos`}
                    {" · "}
                    {invite.expiresAt ? `vence ${new Date(invite.expiresAt).toLocaleDateString("es-AR")}` : "no vence"}
                  </p>
                </div>
                {active && (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => void copy(invite.code, `c-${invite.id}`)}
                      className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-surface-700 text-[11px] text-surface-200 hover:text-white hover:border-surface-500"
                    >
                      {copied === `c-${invite.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} Código
                    </button>
                    <button
                      type="button"
                      onClick={() => void copy(teamInviteLink(invite.code), `l-${invite.id}`)}
                      className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-surface-700 text-[11px] text-surface-200 hover:text-white hover:border-surface-500"
                    >
                      {copied === `l-${invite.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link2 className="w-3.5 h-3.5" />} Link
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(shareText(invite))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg bg-[#25D366]/15 text-[11px] font-medium text-[#4ade80] hover:bg-[#25D366]/25"
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                    </a>
                    <button
                      type="button"
                      onClick={() => void revoke(invite)}
                      title="Revocar"
                      aria-label={`Revocar ${invite.code}`}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-surface-500 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
