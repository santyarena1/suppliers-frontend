"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authApi, apiFailure } from "@/lib/api";
import TurnstileWidget from "@/components/TurnstileWidget";
import { enterAuthenticated } from "@/lib/enter-session";
import { rememberLastLogin } from "@/lib/auth";
import { ArrowLeft, ArrowRight, AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";
import DataField from "@/components/landing/DataField";
import "../(marketing)/landing.css";
import "../login/login.css";

const MIN_PASSWORD = 8;

/**
 * Olvidé mi contraseña. Paso 1: el mail (siempre responde lo mismo, exista o no
 * la cuenta). Paso 2: el código que llegó + la contraseña nueva, y entra.
 * También sirve para que una cuenta creada con Google tenga contraseña.
 */
export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("email")?.trim();
    if (fromUrl) setEmail(fromUrl);
  }, []);

  function failureText(err: unknown, fallback: string): string {
    const fail = apiFailure(err);
    if (fail.status === 429) return "Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.";
    if (!fail.status) return "No pudimos conectarnos con NODO. Revisá tu conexión y probá de nuevo.";
    return fail.message || fallback;
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setStep("reset");
      setInfo("");
    } catch (err: unknown) {
      setError(failureText(err, "No se pudo mandar el código."));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError("");
    setInfo("");
    setResending(true);
    try {
      await authApi.forgotPassword(email.trim());
      setInfo("Si el mail tiene una cuenta, te mandamos un código nuevo. Puede tardar un minuto.");
    } catch (err: unknown) {
      setError(failureText(err, "No se pudo reenviar el código."));
    } finally {
      setResending(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña tiene que tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.resetPassword(email.trim(), code.trim(), password);
      rememberLastLogin({ method: "password", identifier: email.trim() });
      await enterAuthenticated(res.data.token, "");
    } catch (err: unknown) {
      setError(failureText(err, "No se pudo cambiar la contraseña."));
      setLoading(false);
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
            <h1 className="lnd-display lnd-display--md">Elegí una contraseña nueva</h1>
            <p className="lgn__lead">
              Te mandamos un código a tu mail y con eso elegís la contraseña. Si tu cuenta la creaste con Google, así
              también le agregás una contraseña.
            </p>
            <Link href="/login" className="lgn__back lnd-mono">
              <ArrowLeft className="w-3 h-3" />
              Volver a ingresar
            </Link>
          </section>

          <section className="lnd-panel lnd-panel--sheer lgn__card">
            <p className="lnd-label">{step === "email" ? "Paso 1 de 2" : "Paso 2 de 2"}</p>
            <h2 className="lgn__title">{step === "email" ? "¿A qué mail te mandamos el código?" : "Código y contraseña nueva"}</h2>
            <div className="lgn__steps" aria-hidden="true">
              <span className="is-on" />
              <span className={step === "reset" ? "is-on" : undefined} />
            </div>

            {error && (
              <p className="lgn__msg is-bad" role="alert">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </p>
            )}
            {info && !error && <p className="lgn__msg is-ok">{info}</p>}

            {step === "email" ? (
              <form onSubmit={requestCode} className="lgn__form">
                <label className="lgn__row" data-field-row>
                  <span className="lnd-label">Email de tu cuenta</span>
                  <input
                    type="email"
                    className="lnd-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@mail.com"
                    required
                    autoFocus
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </label>
                {/* Cloudflare: casi siempre invisible; aparece solo si quiere confirmar que hay una persona. */}
                <TurnstileWidget className="flex justify-center" />
                <button type="submit" disabled={loading || !email.trim()} className="lnd-btn lnd-btn--primary lgn__go">
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Mandando
                    </>
                  ) : (
                    <>
                      Mandarme el código
                      <ArrowRight className="w-4 h-4 lnd-btn__arrow" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <>
                <p className="lgn__lead" style={{ marginTop: "0.85rem", fontSize: "0.88rem" }}>
                  Si <strong>{email}</strong> tiene una cuenta en NODO, ya te llegó un código de 6 dígitos. Revisá la bandeja y
                  el spam.{" "}
                  <button
                    type="button"
                    className="lgn__textbtn"
                    onClick={() => {
                      setStep("email");
                      setCode("");
                      setError("");
                    }}
                  >
                    Cambiar mail
                  </button>
                </p>
                <form onSubmit={reset} className="lgn__form">
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

                  <div className="lgn__row" data-field-row>
                    <label htmlFor="fp-password" className="lnd-label">Contraseña nueva</label>
                    <span className="lgn__pass" style={{ marginTop: "0.45rem" }}>
                      <input
                        id="fp-password"
                        type={showPassword ? "text" : "password"}
                        className="lnd-input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={`Mínimo ${MIN_PASSWORD} caracteres`}
                        required
                        minLength={MIN_PASSWORD}
                        maxLength={128}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="lgn__eye"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </span>
                  </div>

                  <label className="lgn__row" data-field-row>
                    <span className="lnd-label">Repetila</span>
                    <input
                      type={showPassword ? "text" : "password"}
                      className="lnd-input"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="La misma contraseña"
                      required
                      autoComplete="new-password"
                    />
                    {confirm && confirm !== password && <span className="lgn__hint">No coincide con la de arriba.</span>}
                  </label>

                  {/* Cloudflare: casi siempre invisible; aparece solo si quiere confirmar que hay una persona. */}
                  <TurnstileWidget className="flex justify-center" />
                  <button
                    type="submit"
                    disabled={loading || code.length !== 6 || password.length < MIN_PASSWORD || password !== confirm}
                    className="lnd-btn lnd-btn--primary lgn__go"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Guardando
                      </>
                    ) : (
                      <>
                        Guardar y entrar
                        <ArrowRight className="w-4 h-4 lnd-btn__arrow" />
                      </>
                    )}
                  </button>
                </form>

                <p className="lgn__foot">
                  ¿No llegó?{" "}
                  <button type="button" className="lgn__textbtn" onClick={() => void resend()} disabled={resending}>
                    {resending ? "Reenviando…" : "Mandar otro código"}
                  </button>
                </p>
              </>
            )}

            <p className="lgn__foot">
              ¿Te acordaste? <Link href="/login">Volver a ingresar</Link>
            </p>
          </section>
        </div>

        <p className="lgn__legal lnd-mono">© 2026 NODO</p>
      </div>
    </main>
  );
}
