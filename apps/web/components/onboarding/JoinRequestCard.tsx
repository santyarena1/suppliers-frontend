"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Clock, Loader2, MailCheck } from "lucide-react";
import { joinRequestError, joinRequestsApi, type MyJoinRequest } from "@/lib/joinRequests";

interface JoinRequestCardProps {
  /** Lo aprobaron: sesión nueva ya dentro del comercio. */
  onJoined: (token: string) => void;
}

/** Mientras espera, se revisa cada tanto si ya lo aprobaron. */
const POLL_MS = 20_000;

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long" });
}

/**
 * Sin código: le pide al dueño del comercio (por su mail) sumarse a su equipo.
 * La respuesta es siempre la misma, exista o no ese dueño; cuando aprueba,
 * entra sola a la app.
 */
export default function JoinRequestCard({ onJoined }: JoinRequestCardProps) {
  const [request, setRequest] = useState<MyJoinRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  const check = useCallback(async () => {
    try {
      const res = await joinRequestsApi.mine();
      if (res.data.joined) {
        onJoined(res.data.joined.token);
        return;
      }
      setRequest(res.data.request);
    } catch {
      /* sin estado: se muestra el formulario */
    } finally {
      setLoading(false);
    }
  }, [onJoined]);

  useEffect(() => {
    void check();
  }, [check]);

  const pending = request?.status === "PENDING";

  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [pending, check]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await joinRequestsApi.send(email.trim());
      setSent(res.data.message);
      setRequest(res.data.request);
      setEmail("");
    } catch (err) {
      setError(joinRequestError(err, "No pudimos mandar el pedido. Probá de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await joinRequestsApi.cancel();
      setRequest(null);
      setSent("");
    } catch (err) {
      setError(joinRequestError(err, "No se pudo cancelar el pedido."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="lnd-panel lnd-panel--sheer ob__card" aria-busy="true">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--lilac)" }} />
      </div>
    );
  }

  if (pending && request) {
    return (
      <div className="lnd-panel lnd-panel--sheer ob__card">
        <p className="lnd-label">Pedido enviado</p>
        <h2 className="ob__card-title">Esperando respuesta</h2>
        <p className="lnd-body">
          {sent || "Si el mail corresponde al dueño de un comercio, le llegó tu pedido."} Cuando lo apruebe entrás directo, con lo
          que te deje hacer. También te avisamos por mail.
        </p>
        <p className="lnd-body" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Clock className="w-4 h-4" style={{ color: "var(--lilac)", flexShrink: 0 }} />
          <span>
            Le pediste a <strong>{request.ownerEmail}</strong> el {fecha(request.createdAt)}.
          </span>
        </p>
        {error && (
          <p className="ob__error" role="alert">
            <AlertCircle className="w-4 h-4" />
            {error}
          </p>
        )}
        <button type="button" className="lnd-btn lnd-btn--ghost" onClick={() => void cancel()} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Cancelar pedido
        </button>
        <p className="lnd-note">
          ¿No te responde? Revisá que el mail sea el del dueño, o pedile un código de invitación y cargalo en “Tengo un código”.
        </p>
      </div>
    );
  }

  return (
    <form className="lnd-panel lnd-panel--sheer ob__card" onSubmit={send}>
      <p className="lnd-label">Sumarme a un equipo</p>
      <h2 className="ob__card-title">Pedile al dueño que te sume</h2>
      <p className="lnd-body">
        Escribí el mail del dueño del comercio. Le llega tu pedido y, cuando lo apruebe, entrás a su equipo.
      </p>
      {request?.status === "REJECTED" && (
        <p className="ob__error" role="status">
          <AlertCircle className="w-4 h-4" />
          Tu pedido a {request.ownerEmail} no fue aprobado. Podés pedirle a otro comercio.
        </p>
      )}
      {error && (
        <p className="ob__error" role="alert">
          <AlertCircle className="w-4 h-4" />
          {error}
        </p>
      )}
      <label className="ob__field">
        <span className="lnd-label">Mail del dueño</span>
        <input
          className="lnd-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="dueno@sucomercio.com"
          required
          maxLength={254}
          autoComplete="off"
        />
      </label>
      <button type="submit" className="lnd-btn lnd-btn--primary" disabled={busy || !email.includes("@")}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailCheck className="w-4 h-4" />}
        Mandar pedido
        <ArrowRight className="w-4 h-4 lnd-btn__arrow" />
      </button>
      <p className="lnd-note">Por seguridad no te mostramos si ese mail tiene un comercio en NODO.</p>
    </form>
  );
}
