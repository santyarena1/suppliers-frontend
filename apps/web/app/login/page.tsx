"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { saveSession, sessionFromToken } from "@/lib/auth";
import { invalidateMyModules } from "@/lib/permissions";
import { invalidateTgsEnabled } from "@/lib/tgs";
import { ArrowLeft, ArrowRight, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";
import DataField from "@/components/landing/DataField";
import "../(marketing)/landing.css";
import "./login.css";

/**
 * Login.
 *
 * Mismo mundo que la landing: fondo profundo, campo de partículas detrás, grano
 * y viñeta encima. El campo aterriza sobre los dos campos del formulario
 * (marcados con `data-field-row`), así que el único momento autoral de la
 * pantalla es el dato convergiendo justo donde vas a escribir.
 */

function flagFromUrl(name: string): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get(name) != null;
}

const ONBOARDING_TIMEOUT_MS = 5000;

/** Ruta interna a la que quería ir antes de que el middleware lo mande a login. */
function safeFrom(): string | null {
  if (typeof window === "undefined") return null;
  const from = new URLSearchParams(window.location.search).get("from");
  if (!from || !from.startsWith("/") || from.startsWith("//") || from.startsWith("/\\") || from.startsWith("/login")) return null;
  return from;
}

export default function LoginPage() {
  const [registered, setRegistered] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      const token = res.data.token;
      invalidateMyModules();
      invalidateTgsEnabled();
      saveSession(token, sessionFromToken(token, username));
      let destination = safeFrom() ?? "/search";
      try {
        const { onboardingApi } = await import("@/lib/api");
        const status = await Promise.race([
          onboardingApi.status(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ONBOARDING_TIMEOUT_MS)),
        ]);
        if (status.data.needsOnboarding) destination = "/onboarding";
      } catch {
        // Si falla o tarda el status, caemos al destino habitual.
      }
      // Navegación completa, no router.push: el caché del router de Next puede
      // tener guardada la redirección a /login de cuando no había cookie, y los
      // cachés en memoria (módulos, proveedores) son de la sesión anterior.
      window.location.assign(destination);
      return;
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
      if (e?.response?.status === 401 || e?.response?.status === 400) {
        setError("Credenciales inválidas. Verificá usuario y contraseña.");
      } else if (e?.response) {
        setError(`Error ${e.response.status}: ${e.response.data?.message || "respuesta inesperada"}`);
      } else {
        setError(`Error de conexión: ${e?.message || "no se pudo contactar al servidor"}`);
      }
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
          {/* Lo que hay del otro lado de la puerta */}
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

          {/* La puerta */}
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
