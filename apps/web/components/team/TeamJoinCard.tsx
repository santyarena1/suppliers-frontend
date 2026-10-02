"use client";

import { useState } from "react";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import TeamCodeField from "@/components/team/TeamCodeField";
import { clearPendingTeamCode, getPendingTeamCode, isCompleteTeamCode, teamInvitesApi, teamJoinError } from "@/lib/teamInvites";

interface TeamJoinCardProps {
  /** Sesión nueva ya dentro del comercio. */
  onJoined: (token: string) => void;
  initialError?: string;
}

/** Alta con el código que te pasó un comercio: entrás a su equipo con el rol del código. */
export default function TeamJoinCard({ onJoined, initialError }: TeamJoinCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? "");

  async function join(e: React.FormEvent) {
    e.preventDefault();
    // El campo valida el código contra el API y, si sirve, lo deja como pendiente.
    const code = getPendingTeamCode();
    if (!code || !isCompleteTeamCode(code)) {
      setError("Cargá un código válido (XXXX-XXXX).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await teamInvitesApi.join(code);
      clearPendingTeamCode();
      onJoined(res.data.token);
    } catch (err) {
      setError(teamJoinError(err));
      setBusy(false);
    }
  }

  return (
    <form className="lnd-panel lnd-panel--sheer ob__card" onSubmit={join}>
      <p className="lnd-label">Sumarme a un equipo</p>
      <h2 className="ob__card-title">¿Te pasaron un código?</h2>
      <p className="lnd-body">Con el código que te dio el comercio entrás a su equipo con el rol que eligieron para vos.</p>
      {error && (
        <p className="ob__error" role="alert">
          <AlertCircle className="w-4 h-4" />
          {error}
        </p>
      )}
      <TeamCodeField rowClassName="ob__field" labelClassName="lnd-label" inputClassName="lnd-input" />
      <button type="submit" disabled={busy} className="lnd-btn lnd-btn--primary">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {busy ? "Entrando…" : "Entrar al equipo"}
        {!busy && <ArrowRight className="w-4 h-4" />}
      </button>
    </form>
  );
}
