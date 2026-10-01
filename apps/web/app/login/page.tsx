"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authApi, apiFailure } from "@/lib/api";
import TurnstileWidget from "@/components/TurnstileWidget";
import { enterAuthenticated } from "@/lib/enter-session";
import { ArrowLeft, ArrowRight, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
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

export default function LoginPage() {
  const router = useRouter();
  const [registered, setRegistered] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const showGoogle = googleSignInEnabled();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setRegistered(new URLSearchParams(window.location.search).get("registrado") === "1");
    if (flagFromUrl("expired")) {
      setError("Tu sesión venció, volvé a iniciar sesión.");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.login(username, password);
      await enterAuthenticated(res.data.token, username);
      return;
    } catch (err: unknown) {
      const fail = apiFailure(err);
      if (fail.code === "EMAIL_NOT_VERIFIED") {
        const email = typeof fail.details?.email === "string" ? fail.details.email : "";
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      if (fail.status === 401 || fail.status === 400) {
        setError(fail.message || "Credenciales inválidas. Verificá usuario y contraseña.");
      } else if (fail.status) {
        setError(`Error ${fail.status}: ${fail.message || "respuesta inesperada"}`);
      } else {
        setError(`Error de conexión: ${fail.message || "no se pudo contactar al servidor"}`);
      }
      setLoading(false);
    }
  }

  async function handleGoogle(idToken: string) {
    setError("");
    setLoading(true);
    try {
      const res = await authApi.google(idToken);
      await enterAuthenticated(res.data.token, "");
    } catch (err: unknown) {
      setError(apiFailure(err).message || "No se pudo entrar con Google.");
      setLoading(false);
    }
  }

  return (
    <main className="lnd lgn">
      <DataField className="lgn__field" />
      <div className="lnd-vignette" aria-hidden="true" />
      <div className="lnd-grain" aria-hidden="true" />

      <div className="lgn__wrap">
        <Link href="/landing" className="lgn__brand">
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
            <Link href="/landing" className="lgn__back lnd-mono">
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
                Tu cuenta quedó creada. Entrá con el usuario que elegiste.
              </p>
            )}

            {error && (
              <p className="lgn__msg is-bad">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="lgn__form">
              <label className="lgn__row" data-field-row>
                <span className="lnd-label">Usuario</span>
                <input
                  type="text"
                  className="lnd-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Tu usuario"
                  required
                  autoFocus
                  autoComplete="username"
                />
              </label>

              <label className="lgn__row" data-field-row>
                <span className="lnd-label">Contraseña</span>
                <input
                  type="password"
                  className="lnd-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </label>

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

            {showGoogle && (
              <>
                <p className="lgn__alt" role="separator">
                  <span>o continuá con</span>
                </p>
                <GoogleSignInButton className="lgn__google" onCredential={(token) => void handleGoogle(token)} disabled={loading} />
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
