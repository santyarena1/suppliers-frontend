"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, UserRoundPlus, X } from "lucide-react";
import { TENANT_ROLE_LABELS, type TenantRole } from "@/lib/api";
import { joinRequestError, joinRequestsApi, type TeamJoinRequest } from "@/lib/joinRequests";
import { INVITE_ROLES } from "./TeamInviteCodes";

interface TeamJoinRequestsProps {
  orgName: string;
  /** Solo el dueño puede sumar administradores. */
  isOwner: boolean;
  onMessage: (ok: boolean, text: string) => void;
  /** Alguien entró: hay que recargar la lista de usuarios. */
  onApproved: () => void;
}

function since(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

/**
 * Personas que pidieron sumarse con el mail del dueño. Se aprueban eligiendo
 * qué van a poder hacer, o se rechazan. Sin pedidos, no se muestra nada.
 */
export default function TeamJoinRequests({ orgName, isOwner, onMessage, onApproved }: TeamJoinRequestsProps) {
  const [requests, setRequests] = useState<TeamJoinRequest[]>([]);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [role, setRole] = useState<TenantRole>("BUYER");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await joinRequestsApi.list();
      setRequests(res.data);
    } catch {
      /* sin la lista, la sección no aparece; el resto de Equipo sigue */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(request: TeamJoinRequest) {
    setBusy(request.id);
    try {
      const res = await joinRequestsApi.approve(request.id, role);
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
      setChoosing(null);
      onMessage(true, `${res.data.username} entró a ${orgName || "tu comercio"} como ${res.data.roleLabel}`);
      onApproved();
    } catch (err) {
      onMessage(false, joinRequestError(err, "No se pudo aprobar el pedido"));
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function reject(request: TeamJoinRequest) {
    if (!window.confirm(`¿Rechazar el pedido de ${request.user.username}? Le avisamos por mail.`)) return;
    setBusy(request.id);
    try {
      await joinRequestsApi.reject(request.id);
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
      onMessage(true, `Rechazaste el pedido de ${request.user.username}`);
    } catch (err) {
      onMessage(false, joinRequestError(err, "No se pudo rechazar el pedido"));
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (requests.length === 0) return null;
  const roles = INVITE_ROLES.filter((r) => isOwner || r.role !== "ADMIN");

  return (
    <section className="border border-brand-500/40 bg-brand-500/[0.04] rounded-xl p-4 flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
          <UserRoundPlus className="w-4 h-4 text-brand-400" /> Pedidos para sumarse
          <span className="ml-1 rounded-full bg-brand-600 px-1.5 text-[10px] font-bold leading-4 text-white tabular-nums">
            {requests.length}
          </span>
        </h2>
        <p className="text-xs text-surface-400 mt-1 leading-relaxed">
          Escribieron tu mail para sumarse a {orgName || "tu comercio"}. No entran a nada hasta que los apruebes.
        </p>
      </div>

      <ul className="border border-surface-800 rounded-lg divide-y divide-surface-800 bg-surface-950/40">
        {requests.map((request) => {
          const open = choosing === request.id;
          const working = busy === request.id;
          return (
            <li key={request.id} className="p-3 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-surface-800 text-white text-xs font-bold flex items-center justify-center uppercase flex-shrink-0">
                  {request.user.username.slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{request.user.username}</p>
                  <p className="text-[11px] text-surface-400 truncate">
                    {request.user.email} · {since(request.createdAt)}
                  </p>
                </div>
                {!open && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void reject(request)}
                      disabled={working}
                      className="h-8 px-3 inline-flex items-center gap-1 rounded-lg border border-surface-700 text-xs text-surface-300 hover:text-white hover:border-surface-500 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" /> Rechazar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRole("BUYER");
                        setChoosing(request.id);
                      }}
                      disabled={working}
                      className="h-8 px-3 inline-flex items-center gap-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-xs font-semibold text-white disabled:opacity-50 active:scale-[0.98]"
                    >
                      <Check className="w-3.5 h-3.5" /> Aprobar
                    </button>
                  </div>
                )}
              </div>

              {open && (
                <div className="bg-surface-900 border border-surface-800 rounded-lg p-3 flex flex-col gap-3">
                  <p className="text-xs font-semibold text-white">¿Qué va a poder hacer {request.user.username}?</p>
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
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setChoosing(null)} className="h-9 px-3 text-xs text-surface-400 hover:text-white">
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void approve(request)}
                      disabled={working}
                      className="h-9 px-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-semibold active:scale-[0.98]"
                    >
                      {working && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Sumar como {TENANT_ROLE_LABELS[role]}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
