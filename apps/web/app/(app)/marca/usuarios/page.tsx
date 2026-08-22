"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { BRAND_PANEL_NAV } from "@/lib/brands/nav";
import { brandPanelApi, type BrandAccess } from "@/lib/brands";
import { ACCESS_STATUS_LABELS } from "@/lib/brands/constants";
import { Loader2, UserPlus, RefreshCw, Ban } from "lucide-react";

export default function MarcaUsuariosPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<BrandAccess[]>([]);
  const [email, setEmail] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [inviting, setInviting] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setUsers(await brandPanelApi.authorizedUsers());
    } catch {
      showToast("Error al cargar usuarios", false);
    } finally {
      setLoading(false);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    try {
      await brandPanelApi.inviteUser({ email: email.trim(), requireAcceptance: true });
      showToast(`Invitación enviada a ${email}`);
      setEmail("");
      await load();
    } catch {
      showToast("Error al invitar (verificá email o invitación duplicada)", false);
    } finally {
      setInviting(false);
    }
  }

  async function inviteBulk() {
    const emails = bulkEmails.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean);
    if (emails.length === 0) return;
    setInviting(true);
    try {
      await brandPanelApi.inviteBulk(emails, true);
      showToast(`${emails.length} invitaciones enviadas`);
      setBulkEmails("");
      setShowBulk(false);
      await load();
    } catch {
      showToast("Error en carga masiva", false);
    } finally {
      setInviting(false);
    }
  }

  async function resend(id: string) {
    try {
      await brandPanelApi.resendInvitation(id);
      showToast("Invitación reenviada");
    } catch {
      showToast("Error al reenviar", false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("¿Revocar acceso de este usuario?")) return;
    try {
      await brandPanelApi.revokeAccess(id);
      showToast("Acceso revocado");
      await load();
    } catch {
      showToast("Error al revocar", false);
    }
  }

  const active = users.filter((u) => u.status === "ACTIVE" || u.status === "ACCEPTED");
  const pending = users.filter((u) => !["ACTIVE", "ACCEPTED", "REVOKED_BY_BRAND", "BLOCKED_BY_ADMIN", "REJECTED"].includes(u.status));

  return (
    <RoleGuard allowed={["ROLE_BRAND"]} redirectTo="/marcas">
      <BrandModuleShell title="Usuarios autorizados" subtitle="Invitaciones y accesos" nav={BRAND_PANEL_NAV}>
        <form onSubmit={invite} className="flex gap-2 mb-4">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="email@casadecomputacion.com"
            className="flex-1 px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-white focus:border-brand-500 focus:outline-none" />
          <button type="submit" disabled={inviting}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50">
            <UserPlus className="w-4 h-4" /> Invitar
          </button>
          <button type="button" onClick={() => setShowBulk(!showBulk)}
            className="text-sm text-surface-400 hover:text-white px-3">Masivo</button>
        </form>

        {showBulk && (
          <div className="mb-6 bg-surface-800 border border-surface-700 rounded-xl p-4">
            <textarea value={bulkEmails} onChange={(e) => setBulkEmails(e.target.value)}
              placeholder="Un email por línea..."
              rows={4}
              className="w-full px-3 py-2 bg-surface-900 border border-surface-700 rounded-lg text-sm text-white mb-2 focus:outline-none" />
            <button onClick={inviteBulk} disabled={inviting}
              className="text-sm bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg disabled:opacity-50">
              Enviar invitaciones
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
        ) : (
          <>
            <section className="mb-8">
              <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wide mb-3">
                Activos ({active.length})
              </h3>
              <div className="space-y-2">
                {active.map((u) => (
                  <UserRow key={u.id} user={u} onRevoke={revoke} />
                ))}
                {active.length === 0 && <p className="text-sm text-surface-500">Sin usuarios activos.</p>}
              </div>
            </section>
            <section>
              <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wide mb-3">
                Pendientes ({pending.length})
              </h3>
              <div className="space-y-2">
                {pending.map((u) => (
                  <UserRow key={u.id} user={u} onResend={resend} onRevoke={revoke} />
                ))}
                {pending.length === 0 && <p className="text-sm text-surface-500">Sin invitaciones pendientes.</p>}
              </div>
            </section>
          </>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}

function UserRow({ user, onResend, onRevoke }: {
  user: BrandAccess;
  onResend?: (id: string) => void;
  onRevoke: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 bg-surface-800 border border-surface-700 rounded-lg px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{user.userEmail}</p>
        <p className="text-xs text-surface-500">{ACCESS_STATUS_LABELS[user.status]}</p>
        <p className="text-[10px] text-surface-600">
          Invitado: {new Date(user.invitedAt).toLocaleDateString("es-AR")}
          {user.acceptedAt && ` · Aceptado: ${new Date(user.acceptedAt).toLocaleDateString("es-AR")}`}
        </p>
      </div>
      {onResend && ["PENDING", "INVITATION_SENT", "EXPIRED"].includes(user.status) && (
        <button onClick={() => onResend(user.id)} className="text-surface-400 hover:text-brand-400 p-1.5" title="Reenviar">
          <RefreshCw className="w-4 h-4" />
        </button>
      )}
      <button onClick={() => onRevoke(user.id)} className="text-surface-400 hover:text-red-400 p-1.5" title="Revocar">
        <Ban className="w-4 h-4" />
      </button>
    </div>
  );
}
