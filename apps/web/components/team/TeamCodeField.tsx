"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Users, XCircle } from "lucide-react";
import {
  clearPendingTeamCode,
  getPendingTeamCode,
  isCompleteTeamCode,
  normalizeTeamCode,
  rememberPendingTeamCode,
  teamInvitesApi,
  type TeamInvitePreview,
} from "@/lib/teamInvites";

interface TeamCodeFieldProps {
  /** Clases del label/input del formulario donde se usa (registro o landing). */
  rowClassName?: string;
  labelClassName?: string;
  inputClassName?: string;
}

/**
 * "Código de tu equipo" en el registro. Si llega `?equipo=` en la URL se carga
 * solo. Muestra a qué comercio y con qué rol entra, y lo recuerda para canjearlo
 * después de confirmar el mail (o de entrar con Google).
 */
export default function TeamCodeField({ rowClassName, labelClassName, inputClassName }: TeamCodeFieldProps) {
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<TeamInvitePreview | null>(null);
  const [checking, setChecking] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    let initial: string | null = null;
    try {
      initial = new URLSearchParams(window.location.search).get("equipo");
    } catch {
      initial = null;
    }
    const value = initial ? normalizeTeamCode(initial) : getPendingTeamCode();
    if (value) setCode(value);
  }, []);

  useEffect(() => {
    if (!isCompleteTeamCode(code)) {
      setPreview(null);
      if (!code) clearPendingTeamCode();
      return;
    }
    const mine = ++seq.current;
    setChecking(true);
    const t = setTimeout(() => {
      teamInvitesApi
        .preview(code)
        .then((res) => {
          if (mine !== seq.current) return;
          setPreview(res.data);
          if (res.data.valid) rememberPendingTeamCode(code);
          else clearPendingTeamCode();
        })
        .catch(() => {
          if (mine === seq.current) setPreview(null);
        })
        .finally(() => {
          if (mine === seq.current) setChecking(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [code]);

  return (
    <label className={rowClassName}>
      <span className={labelClassName}>
        Código de tu equipo <span className="opacity-60">(opcional)</span>
      </span>
      <input
        type="text"
        className={inputClassName}
        value={code}
        onChange={(e) => setCode(normalizeTeamCode(e.target.value))}
        placeholder="Si te invitó un comercio: XXXX-XXXX"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={9}
      />
      {checking && (
        <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-surface-400">
          <Loader2 className="w-3 h-3 animate-spin" /> Revisando el código…
        </span>
      )}
      {!checking && preview?.valid && (
        <span className="mt-1.5 flex items-center gap-1.5 text-[12px] text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            Vas a entrar a <b>{preview.organizationName}</b> como <b>{preview.roleLabel}</b>.
          </span>
        </span>
      )}
      {!checking && preview && !preview.valid && (
        <span className="mt-1.5 flex items-center gap-1.5 text-[12px] text-red-300">
          <XCircle className="w-3.5 h-3.5 flex-shrink-0" /> El código no es válido, ya se usó o venció.
        </span>
      )}
      {!checking && !preview && !code && (
        <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-surface-500">
          <Users className="w-3 h-3" /> Si no tenés código, después creás tu comercio.
        </span>
      )}
    </label>
  );
}
