"use client";

import { useEffect, useState } from "react";
import { accountSetupApi, apiFailure } from "@/lib/api";
import { enterAuthenticated } from "@/lib/enter-session";
import { clearSession, getUser, rememberLastLogin } from "@/lib/auth";
import GoogleSignInButton, { googleSignInEnabled } from "@/components/GoogleSignInButton";
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";
import DataField from "@/components/landing/DataField";
import "../(marketing)/landing.css";
import "../login/login.css";

const MIN_PASSWORD = 8;

type Step = "choose" | "email" | "code";

/**
 * Completar la cuenta después de que le regeneraron la contraseña: confirma su
 * mail y elige una contraseña nueva, o conecta Google. Hasta terminar, el resto
 * de la app responde ACCOUNT_SETUP_REQUIRED y lo trae acá.
 */
export default function CompleteAccountPage() {
  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    setUsername(getUser()?.username ?? "");
    accountSetupApi
      .status()
      .then((res) => {
        if (!res.data.mustSetupAccount) {
          window.location.assign("/");
          return;
        }
        setUsername(res.data.username);
        // El mail que tenía cargado como sugerencia, si parece real.
        if (res.data.email && !res.data.email.endsWith(".local")) setEmail(res.data.email);
      })
      .catch(() => {
        /* sin sesión, el interceptor lo manda a ingresar */
      });
  }, []);

  function failureText(err: unknown, fallback: string): string {
    const fail = apiFailure(err);
    if (fail.status === 429) return "Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.";
    if (!fail.status) return "No pudimos conectarnos con NODO. Revisá tu conexión y probá de nuevo.";
    return fail.message || fallback;
  }

  async function onGoogle(idToken: string) {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await accountSetupApi.google(idToken);
      rememberLastLogin({ method: "google", identifier: "" });
      await enterAuthenticated(res.data.token, username);
    } catch (err: unknown) {
      setError(failureText(err, "No se pudo conectar tu cuenta de Google."));
      setLoading(false);
    }
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      await accountSetupApi.sendEmailCode(email.trim().toLowerCase());
      setVerified(false);
      setCode("");
      setStep("code");
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
      await accountSetupApi.sendEmailCode(email.trim().toLowerCase());
      setInfo("Te mandamos un código nuevo. Puede tardar un minuto.");
    } catch (err: unknown) {
      setError(failureText(err, "No se pudo reenviar el código."));
    } finally {
      setResending(false);
    }
  }

  async function finish(e: React.FormEvent) {
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
      // Si ya confirmó el mail (y falló la contraseña), no se vuelve a pedir el código.
      if (!verified) {
        await accountSetupApi.verifyEmail(email.trim().toLowerCase(), code.trim());
        setVerified(true);
      }
      const res = await accountSetupApi.setPassword(password);
      rememberLastLogin({ method: "password", identifier: username || email.trim() });
      await enterAuthenticated(res.data.token, username);
    } catch (err: unknown) {
      setError(failureText(err, "No se pudo completar la cuenta."));
      setLoading(false);
    }
  }

  function signOut() {
    clearSession();
    window.location.assign("/login");
  }

  const stepNumber = step === "code" ? 2 : 1;

  return (
    <main className="lnd lgn">
      <DataField className="lgn__field" />
      <div className="lnd-vignette" aria-hidden="true" />
      <div className="lnd-grain" aria-hidden="true" />

      <div className="lgn__wrap">
        <span className="lgn__brand">
          <NodoLogo className="w-7 h-7" />
          <span>
            <NodoWordmark className="h-3.5" />
            <em className="lnd-mono">Buscador mayorista</em>
          </span>
        </span>

        <div className="lgn__grid">
          <section className="lgn__pitch">
            <h1 className="lnd-display lnd-display--md">Completá tu cuenta</h1>
            <p className="lgn__lead">
              Te dieron una contraseña temporal. Para seguir, confirmá tu mail: conectá tu cuenta de Google, o recibí un
              código y elegí una contraseña nueva. Es una sola vez.
            </p>
            <button type="button" className="lgn__back lnd-mono" onClick={signOut}>
              <ArrowLeft className="w-3 h-3" />
              {username ? `No soy ${username}: salir` : "Salir"}
            </button>
          </section>

          <section className="lnd-panel lnd-panel--sheer lgn__card">
            <p className="lnd-label">{step === "choose" ? "Elegí cómo" : `Paso ${stepNumber} de 2`}</p>
            <h2 className="lgn__title">
              {step === "choose" ? "¿Cómo querés entrar de ahora en más?" : step === "email" ? "¿Cuál es tu mail?" : "Código y contraseña nueva"}
            </h2>
            {step !== "choose" && (
              <div className="lgn__steps" aria-hidden="true">
                <span className="is-on" />
                <span className={step === "code" ? "is-on" : undefined} />
              </div>
            )}

            {error && (
              <p className="lgn__msg is-bad" role="alert">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </p>
            )}
            {info && !error && <p className="lgn__msg is-ok">{info}</p>}

            {step === "choose" && (
              <div className="lgn__form">
                {googleSignInEnabled() && (
                  <>
                    <GoogleSignInButton onCredential={(t) => void onGoogle(t)} disabled={loading} />
                    <p className="lgn__hint" style={{ textAlign: "center" }}>
                      Con Google entrás siempre con ese botón, sin contraseña.
                    </p>
                    <p className="lnd-label" style={{ textAlign: "center", margin: "0.4rem 0" }}>o</p>
                  </>
                )}
                <button
                  type="button"
                  className="lnd-btn lnd-btn--primary lgn__go"
                  onClick={() => {
                    setError("");
                    setStep("email");
                  }}
                  disabled={loading}
                >
                  <Mail className="w-4 h-4" />
                  Usar mi mail y una contraseña
                </button>
              </div>
            )}

            {step === "email" && (
              <form onSubmit={sendCode} className="lgn__form">
                <label className="lgn__row" data-field-row>
                  <span className="lnd-label">Tu mail</span>
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
                  <span className="lgn__hint">Ahí te llega el código, y es el mail de tu cuenta de ahora en más.</span>
                </label>
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
                <button type="button" className="lgn__textbtn" onClick={() => setStep("choose")}>
                  Volver
                </button>
              </form>
            )}

            {step === "code" && (
              <>
                <p className="lgn__lead" style={{ marginTop: "0.85rem", fontSize: "0.88rem" }}>
                  {verified ? (
                    <>
                      Tu mail <strong>{email}</strong> ya quedó confirmado. Elegí la contraseña.
                    </>
                  ) : (
                    <>
                      Te mandamos un código de 6 dígitos a <strong>{email}</strong>. Revisá la bandeja y el spam.{" "}
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
                    </>
                  )}
                </p>
                <form onSubmit={finish} className="lgn__form">
                  {!verified && (
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
                  )}

                  <div className="lgn__row" data-field-row>
                    <label htmlFor="cc-password" className="lnd-label">Contraseña nueva</label>
                    <span className="lgn__pass" style={{ marginTop: "0.45rem" }}>
                      <input
                        id="cc-password"
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

                  <button
                    type="submit"
                    disabled={
                      loading || (!verified && code.length !== 6) || password.length < MIN_PASSWORD || password !== confirm
                    }
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
                  {!verified && (
                    <button type="button" className="lgn__textbtn" onClick={() => void resend()} disabled={resending}>
                      {resending ? "Mandando…" : "Mandar otro código"}
                    </button>
                  )}
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
