"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authApi, apiFailure } from "@/lib/api";
import TurnstileWidget from "@/components/TurnstileWidget";
import { enterAuthenticated } from "@/lib/enter-session";
import { getLastLogin, rememberLastLogin } from "@/lib/auth";
import { ArrowLeft, ArrowRight, AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";
import DataField from "@/components/landing/DataField";
import GoogleSignInButton, { googleSignInEnabled } from "@/components/GoogleSignInButton";
import "../(marketing)/landing.css";
import "./login.css";

function flagFromUrl(name: string): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get(name) != null;
}

/** Link a "Olvidé mi contraseña" con el mail ya cargado si lo que escribió es un mail. */
function forgotHref(identifier: string): string {
  const value = identifier.trim();
  return value.includes("@") ? `/forgot-password?email=${encodeURIComponent(value)}` : "/forgot-password";
}

export default function LoginPage() {
  const router = useRouter();
  const [registered, setRegistered] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [googleAccount, setGoogleAccount] = useState(false);
  const [lastWasGoogle, setLastWasGoogle] = useState(false);
  const [loading, setLoading] = useState(false);
  const showGoogle = googleSignInEnabled();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setRegistered(new URLSearchParams(window.location.search).get("registrado") === "1");
    if (flagFromUrl("expired")) {
      setError("Tu sesión venció, volvé a iniciar sesión.");
    }
    const last = getLastLogin();
    if (last?.method === "google") setLastWasGoogle(true);
    else if (last?.identifier) setUsername(last.identifier);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setGoogleAccount(false);
    setLoading(true);
    const identifier = username.trim();
    try {
      const res = await authApi.login(identifier, password);
      rememberLastLogin({ method: "password", identifier });
      await enterAuthenticated(res.data.token, identifier.includes("@") ? "" : identifier);
      return;
    } catch (err: unknown) {
      const fail = apiFailure(err);
      if (fail.code === "EMAIL_NOT_VERIFIED") {
        const email = typeof fail.details?.email === "string" ? fail.details.email : "";
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      if (fail.code === "GOOGLE_ACCOUNT") {
        setGoogleAccount(true);
        setError("Esta cuenta se creó con Google. Entrá con el botón de Google o creá una contraseña.");
      } else if (fail.status === 401 || fail.status === 400) {
        setError(fail.message || "Usuario o contraseña incorrectos.");
      } else if (fail.status === 429) {
        setError("Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.");
      } else if (fail.status) {
        setError(fail.message || `No se pudo entrar (error ${fail.status}). Probá de nuevo.`);
      } else {
        setError("No pudimos conectarnos con NODO. Revisá tu conexión y probá de nuevo.");
      }
      setLoading(false);
    }
  }

  async function handleGoogle(idToken: string) {
    setError("");
    setGoogleAccount(false);
    setLoading(true);
    try {
      const res = await authApi.google(idToken);
      rememberLastLogin({ method: "google", identifier: "" });
      await enterAuthenticated(res.data.token, "");
    } catch (err: unknown) {
      setError(apiFailure(err).message || "No se pudo entrar con Google.");
      setLoading(false);
    }
  }

  const googleBlock = showGoogle ? (
    <div className={lastWasGoogle || googleAccount ? "lgn__google-first" : undefined}>
      {lastWasGoogle && !googleAccount && <p className="lgn__last lnd-mono">La última vez entraste con Google</p>}
      <GoogleSignInButton className="lgn__google" onCredential={(token) => void handleGoogle(token)} disabled={loading} />
    </div>
  ) : null;
  const googleOnTop = Boolean(googleBlock) && (lastWasGoogle || googleAccount);

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
            <h1 className="lnd-display lnd-display--md">
              Todos tus distribuidores en una sola búsqueda
            </h1>
            <p className="lgn__lead">
              Conectás tus proveedores una vez. NODO te muestra quién tiene cada producto, a qué
              precio real puesto y con cuánto stock, y comprás sin salir del sistema.
            </p>
            <Link href="/" className="lgn__back lnd-mono">
              <ArrowLeft className="w-3 h-3" />
              Ver cómo funciona
            </Link>
          </section>

          <section className="lnd-panel lnd-panel--sheer lgn__card">
            <p className="lnd-label">Ingresar</p>
            <h2 className="lgn__title">Entrá a tu cuenta</h2>

            {registered && !error && (
              <p className="lgn__msg is-ok">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                Tu cuenta quedó creada. Entrá con tu usuario o tu email.
              </p>
            )}

            {error && (
              <p className="lgn__msg is-bad" role="alert">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>
                  {error}
                  {googleAccount && (
                    <>
                      {" "}
                      <Link href={forgotHref(username)} className="lgn__inline">
                        Crear una contraseña
                      </Link>
                    </>
                  )}
                </span>
              </p>
            )}

            {googleOnTop && (
              <>
                <div style={{ marginTop: "1.2rem" }}>{googleBlock}</div>
                <p className="lgn__alt" role="separator">
                  <span>o con tu usuario</span>
                </p>
              </>
            )}

            <form onSubmit={handleSubmit} className={googleOnTop ? "lgn__form lgn__form--tight" : "lgn__form"}>
              <label className="lgn__row" data-field-row>
                <span className="lnd-label">Usuario o email</span>
                <input
                  type="text"
                  className="lnd-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="tu usuario o tu@mail.com"
                  required
                  autoFocus={!googleOnTop}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </label>

              <div className="lgn__row" data-field-row>
                <span className="lgn__label-row">
                  <label htmlFor="lgn-password" className="lnd-label">Contraseña</label>
                  <Link href={forgotHref(username)} className="lgn__forgot">
                    ¿Olvidaste tu contraseña?
                  </Link>
                </span>
                <span className="lgn__pass">
                  <input
                    id="lgn-password"
                    type={showPassword ? "text" : "password"}
                    className="lnd-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
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

              {/* Cloudflare: casi siempre invisible; aparece solo si quiere confirmar que hay una persona. */}
              <TurnstileWidget className="flex justify-center" />
              <button type="submit" disabled={loading} className="lnd-btn lnd-btn--primary lgn__go">
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Ingresando
                  </>
                ) : (
                  <>
                    Ingresar
                    <ArrowRight className="w-4 h-4 lnd-btn__arrow" />
                  </>
                )}
              </button>
            </form>

            {googleBlock && !googleOnTop && (
              <>
                <p className="lgn__alt" role="separator">
                  <span>o continuá con</span>
                </p>
                {googleBlock}
              </>
            )}

            <p className="lgn__foot">
              ¿No tenés cuenta? <Link href="/register">Creá la tuya</Link>
            </p>
          </section>
        </div>

        <p className="lgn__legal lnd-mono">© 2026 NODO</p>
      </div>
    </main>
  );
}
