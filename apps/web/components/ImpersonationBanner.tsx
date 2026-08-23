"use client";

import { useEffect, useState } from "react";
import { Eye, LogOut } from "lucide-react";
import { getImpersonator, getUser, stopImpersonation, type SessionUser } from "@/lib/auth";

const ROLE_LABELS: Record<string, string> = {
  ROLE_USER: "Usuario",
  ROLE_ADMIN: "Administrador",
  ROLE_BRAND: "Marca",
};

/**
 * Aviso permanente mientras el superadmin navega como otra persona.
 *
 * Es deliberadamente imposible de ignorar: sin él es fácil olvidarse de que la
 * sesión no es propia y atribuirle a un cliente acciones que en realidad hizo
 * el administrador.
 */
export default function ImpersonationBanner() {
  const [admin, setAdmin] = useState<SessionUser | null>(null);
  const [target, setTarget] = useState<SessionUser | null>(null);

  useEffect(() => {
    setAdmin(getImpersonator());
    setTarget(getUser());
  }, []);

  if (!admin || !target) return null;

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
      <span className="flex items-center gap-1.5">
        <Eye className="h-3.5 w-3.5 shrink-0" />
        Estás viendo NODO como <strong className="font-semibold">{target.username}</strong>
        <span className="opacity-75">({ROLE_LABELS[target.role] ?? target.role})</span>
      </span>
      <button
        type="button"
        onClick={() => {
          stopImpersonation();
          window.location.href = "/admin";
        }}
        className="inline-flex items-center gap-1 rounded bg-amber-950/15 px-2 py-0.5 font-semibold transition hover:bg-amber-950/25"
      >
        <LogOut className="h-3 w-3" />
        Volver a {admin.username}
      </button>
    </div>
  );
}
