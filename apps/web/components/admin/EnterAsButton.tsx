"use client";

import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { adminApi } from "@/lib/api";
import { sessionFromToken, startImpersonation, type UserRole } from "@/lib/auth";

interface Props {
  userId: string;
  role: UserRole;
  onError: (message: string) => void;
  className?: string;
  /** Con `false` queda solo el ícono, para las filas más compactas del árbol. */
  showLabel?: boolean;
  /** Destaca el botón en la ficha de la persona seleccionada. */
  variant?: "default" | "primary";
}

/**
 * Abre la plataforma con la sesión de otro usuario, para ver exactamente lo que
 * ve él. La sesión del administrador queda guardada y vuelve desde el aviso
 * amarillo que aparece arriba de todo.
 */
export default function EnterAsButton({
  userId,
  role,
  onError,
  className = "",
  showLabel = true,
  variant = "default",
}: Props) {
  const [entering, setEntering] = useState(false);

  // Un administrador que puede volverse otro administrador vuelve inútil la
  // auditoría, así que el backend lo rechaza y acá ni se ofrece.
  const blocked = role === "ROLE_ADMIN";

  async function enter() {
    setEntering(true);
    try {
      const { data } = await adminApi.impersonate(userId);
      startImpersonation(data.token, sessionFromToken(data.token, data.user.username));
      window.location.href = "/";
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "No se pudo entrar como este usuario";
      onError(message);
      setEntering(false);
    }
  }

  const look =
    variant === "primary"
      ? "bg-brand-600 hover:bg-brand-500 border-brand-500 text-white disabled:hover:bg-brand-600 disabled:hover:text-white"
      : "border-surface-700 text-surface-300 hover:border-brand-500/40 hover:text-white disabled:hover:border-surface-700 disabled:hover:text-surface-300";

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void enter();
      }}
      disabled={entering || blocked}
      title={blocked ? "No se puede entrar como otro administrador" : "Ver la plataforma como este usuario"}
      className={`flex items-center justify-center gap-1.5 rounded-lg border transition-all disabled:opacity-30 ${look} ${className}`}
    >
      {entering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
      {showLabel && <span className="text-xs font-semibold">Entrar como</span>}
    </button>
  );
}
