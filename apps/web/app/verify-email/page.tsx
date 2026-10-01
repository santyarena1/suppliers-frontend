"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authApi, apiFailure } from "@/lib/api";
import TurnstileWidget from "@/components/TurnstileWidget";
import { enterAuthenticated } from "@/lib/enter-session";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";
import DataField from "@/components/landing/DataField";
import "../(marketing)/landing.css";
import "../login/login.css";

export default function VerifyEmailPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    setEmail(new URLSearchParams(window.location.search).get("email")?.trim() ?? "");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      setError("Falta el email. Volvé a registrarte.");
      return;
    }
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await authApi.verifyEmail(email, code.trim());
      await enterAuthenticated(res.data.token, "");
    } catch (err: unknown) {
      setError(apiFailure(err).message || "No se pudo confirmar el código.");
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email) return;
    setError("");
    setInfo("");
    setResending(true);
    try {
      await authApi.resendVerification(email);
      setInfo("Te mandamos un código nuevo.");
    } catch (err: unknown) {
      setError(apiFailure(err).message || "No se pudo reenviar el código.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="lnd lgn">
      <DataField className="lgn__field" />
      <div className="lnd-vignette" aria-hidden="true" />
      <div className="lnd-grain" aria-hidden="true" />

      <div className="lgn__wrap">
        <Link href="/" className="lgn__brand">
          <NodoLogo className="w-7 h-7" />
          <span>
            <NodoWordmark className="h-3.5" />
            <em className="lnd-mono">Buscador mayorista</em>
          </span>
        </Link>

        <div className="lgn__grid">
          <section className="lgn__pitch">
            <h1 className="lnd-display lnd-display--md">Confirmá que el mail es tuyo</h1>
            <p className="lgn__lead">
              Ahí te vamos a escribir sobre tu cuenta y sobre NODO. Sin el código no se puede entrar.
            </p>
            <Link href="/register" className="lgn__back lnd-mono">
              <ArrowLeft className="w-3 h-3" />
              Volver al registro
            </Link>
          </section>

          <section className="lnd-panel lnd-panel--sheer lgn__card">
            <p className="lnd-label">Verificación</p>
            <h2 className="lgn__title">Código de 6 dígitos</h2>
            <p className="lgn__lead" style={{ marginTop: "0.85rem", fontSize: "0.88rem" }}>
              {email ? (
                <>
                  Lo mandamos a <strong>{email}</strong>. Revisá la bandeja y el spam.
                </>
              ) : (
                <>Falta el email. Empezá de nuevo desde el registro.</>
              )}
            </p>

            {error && (
              <p className="lgn__msg is-bad">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </p>
            )}
            {info && !error && <p className="lgn__msg is-ok">{info}</p>}

            <form onSubmit={handleSubmit} className="lgn__form">
              <label className="lgn__row" data-field-row>
                <span className="lnd-label">Código</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  className="lnd-input lgn__otp"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  required
                  autoFocus
                />
              </label>

              {/* Cloudflare: casi siempre invisible; aparece solo si quiere confirmar que hay una persona. */}
              <TurnstileWidget className="flex justify-center" />
              <button type="submit" disabled={loading || code.length !== 6} className="lnd-btn lnd-btn--primary lgn__go">
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Confirmando
                  </>
                ) : (
                  "Confirmar email"
                )}
              </button>
            </form>

            <p className="lgn__foot">
              ¿No te llegó?{" "}
              <button type="button" className="lgn__textbtn" onClick={() => void handleResend()} disabled={resending || !email}>
                {resending ? "Reenviando…" : "Reenviar código"}
              </button>
            </p>
          </section>
        </div>

        <p className="lgn__legal lnd-mono">© 2026 NODO</p>
      </div>
    </main>
  );
}
