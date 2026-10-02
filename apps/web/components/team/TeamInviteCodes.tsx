"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, MessageCircle, UserPlus, X, XCircle } from "lucide-react";
import { TENANT_ROLE_LABELS, type TenantRole } from "@/lib/api";
import { TEAM_INVITE_STATUS_LABELS, teamInviteLink, teamInvitesApi, type TeamInvite } from "@/lib/teamInvites";

/** Roles que se pueden dar al invitar, con qué puede hacer cada uno. Nunca dueño. */
const INVITE_ROLES: { role: TenantRole; hint: string }[] = [
  { role: "BUYER", hint: "Busca precios, arma el carrito y confirma pedidos." },
  { role: "SELLER", hint: "Busca precios y arma pedidos; los aprueba el dueño o un administrador." },
  { role: "VIEWER", hint: "Solo mira precios y stock. No hace pedidos." },
  { role: "ADMIN", hint: "Hace todo lo anterior, aprueba pedidos y maneja el equipo." },
];

type UsesChoice = "one" | "many";

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
 * Invitar a alguien al equipo: se elige qué va a poder hacer, se comparte el
 * link y, cuando se registra, entra directo al comercio con ese rol.
 */
export default function TeamInviteCodes({ orgName, isOwner, onMessage }: TeamInviteCodesProps) {
  const [codes, setCodes] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"idle" | "choose" | "share">("idle");
  const [role, setRole] = useState<TenantRole>("BUYER");
  const [uses, setUses] = useState<UsesChoice>("one");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<TeamInvite | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const org = orgName || "tu comercio";

  const load = useCallback(async () => {
    try {
      const res = await teamInvitesApi.list();
      setCodes(res.data);
    } catch (err) {
      onMessage(false, apiMessage(err, "No se pudieron cargar las invitaciones"));
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setCreating(true);
    try {
      const res = await teamInvitesApi.create({ role, maxUses: uses === "one" ? 1 : null });
      setCodes((prev) => [res.data, ...prev]);
      setCreated(res.data);
      setStep("share");
    } catch (err) {
      onMessage(false, apiMessage(err, "No se pudo crear la invitación"));
    } finally {
      setCreating(false);
    }
  }

  async function revoke(invite: TeamInvite) {
    if (!window.confirm(`¿Anular la invitación ${invite.code}? Ya no va a servir para sumarse.`)) return;
    try {
      await teamInvitesApi.revoke(invite.id);
      setCodes((prev) => prev.map((c) => (c.id === invite.id ? { ...c, revoked: true, status: "REVOKED" } : c)));
    } catch (err) {
      onMessage(false, apiMessage(err, "No se pudo anular la invitación"));
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

  const whatsapp = (invite: TeamInvite) =>
    `https://wa.me/?text=${encodeURIComponent(`Te invito a ${org} en NODO: entrá a ${teamInviteLink(invite.code)} y registrate.`)}`;

  const roles = INVITE_ROLES.filter((r) => isOwner || r.role !== "ADMIN");

  function close() {
    setStep("idle");
    setCreated(null);
    setRole("BUYER");
    setUses("one");
  }

  return (
    <section className="border border-surface-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
            <UserPlus className="w-4 h-4 text-brand-400" /> Sumá a alguien a tu equipo
          </h2>
          <p className="text-xs text-surface-400 mt-1 leading-relaxed">
            Elegí qué va a poder hacer, compartile el link y, cuando se registre, entra directo a {org}. No hace falta que le crees el usuario.
          </p>
        </div>
        {step === "idle" && (
          <button
            type="button"
            onClick={() => setStep("choose")}
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold flex-shrink-0 active:scale-[0.98]"
          >
            <UserPlus className="w-3.5 h-3.5" /> Invitar
          </button>
        )}
      </div>

      {step === "choose" && (
        <div className="bg-surface-900 border border-surface-800 rounded-lg p-3 flex flex-col gap-3">
          <p className="text-xs font-semibold text-white">1. ¿Qué va a poder hacer?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {roles.map(({ role: r, hint }) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                aria-pressed={role === r}
                className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  role === r ? "border-brand-500 bg-brand-500/10" : "border-surface-700 hover:border-surface-500"
                }`}
              >
                <span className="block text-sm font-semibold text-white">{TENANT_ROLE_LABELS[r]}</span>
                <span className="block text-[11px] text-surface-400 mt-0.5">{hint}</span>
              </button>
            ))}
          </div>
          <p className="text-xs font-semibold text-white">2. ¿Para cuántas personas?</p>
          <div className="flex flex-wrap gap-2">
            {([
              ["one", "Para una persona"],
              ["many", "Para varias personas"],
            ] as [UsesChoice, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setUses(value)}
                aria-pressed={uses === value}
                className={`h-9 px-3 rounded-lg border text-xs font-medium ${
                  uses === value ? "border-brand-500 bg-brand-500/10 text-white" : "border-surface-700 text-surface-300 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-surface-500">
            {uses === "one" ? "El link sirve una sola vez." : "El link sirve para todos los que lo usen, hasta que lo anules."} No vence.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="h-9 px-3 text-xs text-surface-400 hover:text-white">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void create()}
              disabled={creating}
              className="h-9 px-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-semibold active:scale-[0.98]"
            >
              {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Crear invitación
            </button>
          </div>
        </div>
      )}

      {step === "share" && created && (
        <div className="bg-surface-900 border border-brand-500/40 rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-white">
              Listo. Mandale este link: entra a {org} como {created.roleLabel}.
            </p>
            <button type="button" onClick={close} aria-label="Cerrar" className="text-surface-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="font-mono text-xs sm:text-sm text-brand-200 break-all bg-surface-950 border border-surface-800 rounded-lg px-3 py-2.5">
            {teamInviteLink(created.code)}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copy(teamInviteLink(created.code), "new-link")}
              className="h-10 px-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold active:scale-[0.98]"
            >
              {copied === "new-link" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied === "new-link" ? "Copiado" : "Copiar link"}
            </button>
            <a
              href={whatsapp(created)}
              target="_blank"
              rel="noopener noreferrer"
              className="h-10 px-4 inline-flex items-center gap-1.5 rounded-lg bg-[#25D366]/15 text-sm font-semibold text-[#4ade80] hover:bg-[#25D366]/25"
            >
              <MessageCircle className="w-4 h-4" /> Mandar por WhatsApp
            </a>
          </div>
          <p className="text-[11px] text-surface-500">
            Si prefiere tipearlo, el código es <span className="font-mono text-surface-300">{created.code}</span>: lo pega al registrarse en nodohub.app.
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-surface-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…</p>
      ) : codes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] uppercase tracking-wider text-surface-500 font-semibold">Invitaciones</p>
          <ul className="border border-surface-800 rounded-lg divide-y divide-surface-800">
            {codes.map((invite) => {
              const active = invite.status === "ACTIVE";
              const status = invite.status === "EXHAUSTED" ? "Usada" : TEAM_INVITE_STATUS_LABELS[invite.status];
              const who = invite.usedBy?.map((u) => u.username).join(", ");
              return (
                <li key={invite.id} className={`p-3 flex flex-col sm:flex-row sm:items-center gap-2 ${active ? "" : "opacity-70"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{invite.roleLabel}</span>
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${
                          active ? "bg-emerald-500/15 text-emerald-300" : "bg-surface-800 text-surface-400"
                        }`}
                      >
                        {status}
                      </span>
                      <span className="font-mono text-[11px] text-surface-500">{invite.code}</span>
                    </div>
                    <p className="text-[11px] text-surface-500 mt-0.5">
                      {invite.maxUses === 1 ? "Para una persona" : "Para varias personas"}
                      {who ? ` · Entró: ${who}` : invite.usedCount > 0 ? ` · Usada ${invite.usedCount} ${invite.usedCount === 1 ? "vez" : "veces"}` : " · Todavía nadie la usó"}
                      {invite.expiresAt && invite.status === "EXPIRED" ? ` · venció el ${new Date(invite.expiresAt).toLocaleDateString("es-AR")}` : ""}
                    </p>
                  </div>
                  {active && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => void copy(teamInviteLink(invite.code), `l-${invite.id}`)}
                        className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-surface-700 text-[11px] text-surface-200 hover:text-white hover:border-surface-500"
                      >
                        {copied === `l-${invite.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} Copiar link
                      </button>
                      <a
                        href={whatsapp(invite)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg bg-[#25D366]/15 text-[11px] font-medium text-[#4ade80] hover:bg-[#25D366]/25"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                      </a>
                      <button
                        type="button"
                        onClick={() => void revoke(invite)}
                        className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg text-[11px] text-surface-400 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Anular
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
