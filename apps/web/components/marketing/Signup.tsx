"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { authApi, apiFailure, onboardingApi } from "@/lib/api";
import TurnstileWidget from "@/components/TurnstileWidget";
import { saveSession, sessionFromToken } from "@/lib/auth";
import { enterAuthenticated } from "@/lib/enter-session";
import { invalidateMyModules } from "@/lib/permissions";
import { invalidateTgsEnabled } from "@/lib/tgs";
import { Reveal } from "./Reveal";
import { readTrialPlan, rememberTrialPlan, TRIAL_DAYS, type TrialPlan } from "@/lib/trial-plan";
import GoogleSignInButton, { googleSignInEnabled } from "@/components/GoogleSignInButton";

/** Con la clave de superadmin, el formulario abre el onboarding en modo preview. */
const PREVIEW_USER = "superadmin";

const PERKS = [
  `${TRIAL_DAYS} días gratis con el plan que elijas`,
  "Recorrido guiado con catálogo y pedidos de prueba",
  "Conectás tus distribuidores cuando quieras",
  "Tu equipo entra con sus propios usuarios",
];

export function Signup() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isPreviewLogin = username.trim().toLowerCase() === PREVIEW_USER;
  const [trialPlan, setTrialPlan] = useState<TrialPlan>("PRO");
  const showGoogle = googleSignInEnabled();

  // El plan elegido en las tarjetas de planes llega acá.
  useEffect(() => {
    const sync = () => setTrialPlan(readTrialPlan() ?? "PRO");
    sync();
    window.addEventListener("nodo:trial-plan", sync);
    return () => window.removeEventListener("nodo:trial-plan", sync);
  }, []);

  function pickPlan(plan: TrialPlan) {
    setTrialPlan(plan);
    rememberTrialPlan(plan);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("La contraseña necesita al menos 8 caracteres.");
      return;
    }
    if (!isPreviewLogin && password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      if (isPreviewLogin) {
        const login = await authApi.login(username.trim(), password);
        invalidateMyModules();
        invalidateTgsEnabled();
        saveSession(login.data.token, sessionFromToken(login.data.token, username.trim()));
        const preview = await onboardingApi.preview();
        saveSession(preview.data.token, sessionFromToken(preview.data.token, username.trim()));
        router.push("/onboarding");
        return;
      }
      rememberTrialPlan(trialPlan);
      await authApi.register(username.trim(), email.trim(), password);
      router.push(`/verify-email?email=${encodeURIComponent(email.trim())}`);
    } catch (err: unknown) {
      setError(apiFailure(err).message || "No se pudo crear la cuenta. Probá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle(idToken: string) {
    setError("");
    setLoading(true);
    rememberTrialPlan(trialPlan);
    try {
      const res = await authApi.google(idToken);
      await enterAuthenticated(res.data.token, "");
    } catch (err: unknown) {
      setError(apiFailure(err).message || "No se pudo entrar con Google.");
      setLoading(false);
    }
  }

  return (
    <section id="probar" className="nl-section nl-divider relative scroll-mt-16 overflow-hidden">
      <div className="nl-glow" style={{ width: 700, height: 500, left: -260, bottom: -260 }} aria-hidden />
      <div className="nl-shell relative grid items-start gap-12 lg:grid-cols-[1fr_0.95fr] lg:gap-20">
        <Reveal>
          <h2 className="nl-h2">Probalo {TRIAL_DAYS} días gratis</h2>
          <p className="nl-lead mt-5">
            Creás tu cuenta y usás NODO con el plan que elijas durante {TRIAL_DAYS} días. Empezás con un recorrido
            guiado, conectás tus distribuidores y buscás de verdad. Al terminar la prueba elegís el plan para seguir.
          </p>
          <ul className="mt-8 flex flex-col gap-3">
            {PERKS.map((p) => (
              <li key={p} className="flex items-center gap-3 text-[0.975rem] text-[var(--fg)]">
                <Check className="h-4 w-4 text-[var(--accent-2)]" aria-hidden /> {p}
              </li>
            ))}
          </ul>
          <p className="mt-10 text-sm text-[var(--fg-3)]">
            ¿Ya tenés cuenta?{" "}
            <Link href="/login" className="text-[var(--fg-2)] underline underline-offset-4 hover:text-white">
              Entrar
            </Link>
          </p>
        </Reveal>

        <Reveal delay={100}>
          <form onSubmit={onSubmit} className="nl-surface p-6 sm:p-8" noValidate={false}>
            {error && (
              <div role="alert" className="mb-6 flex items-start gap-2.5 rounded-[10px] bg-[rgb(240_106_106/0.1)] px-3.5 py-3 text-sm text-[#f7a7a7] ring-1 ring-[rgb(240_106_106/0.35)]">
                <AlertCircle className="mt-px h-4 w-4 flex-shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}
            {isPreviewLogin && (
              <p className="mb-5 rounded-[10px] bg-[var(--accent-soft)] px-3.5 py-2.5 text-sm text-[var(--fg-2)]">
                Modo preview: con la clave de superadmin hacés el onboarding desde cero y después volvés a Administración.
              </p>
            )}
            <div className="flex flex-col gap-5">
              {!isPreviewLogin && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-[var(--fg)]">Plan para probar</span>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Plan para probar">
                    {(["BASE", "PRO"] as const).map((plan) => (
                      <button
                        key={plan}
                        type="button"
                        role="radio"
                        aria-checked={trialPlan === plan}
                        onClick={() => pickPlan(plan)}
                        className={`rounded-[10px] border px-3 py-2.5 text-sm font-medium transition-colors ${
                          trialPlan === plan
                            ? "border-[rgb(139_127_255/0.6)] bg-[var(--accent-soft)] text-white"
                            : "border-[var(--line)] text-[var(--fg-2)] hover:text-white"
                        }`}
                      >
                        NODO {plan === "PRO" ? "Pro" : "Base"}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--fg-3)]">{TRIAL_DAYS} días gratis. Después elegís el plan para seguir.</p>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label htmlFor="nl-user" className="text-sm font-medium text-[var(--fg)]">
                  Usuario
                </label>
                <input
                  id="nl-user"
                  className="nl-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
                <p className="text-xs text-[var(--fg-3)]">Con el que vas a entrar a NODO.</p>
              </div>
              {!isPreviewLogin && (
                <div className="flex flex-col gap-2">
                  <label htmlFor="nl-email" className="text-sm font-medium text-[var(--fg)]">
                    Email
                  </label>
                  <input
                    id="nl-email"
                    type="email"
                    className="nl-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                  <p className="text-xs text-[var(--fg-3)]">
                    Ahí te llega el código de confirmación y, después, la información de tu cuenta.
                  </p>
                </div>
              )}
              <div className={`grid gap-5 ${isPreviewLogin ? "" : "sm:grid-cols-2"}`}>
                <div className="flex flex-col gap-2">
                  <label htmlFor="nl-pass" className="text-sm font-medium text-[var(--fg)]">
                    Contraseña
                  </label>
                  <input
                    id="nl-pass"
                    type="password"
                    className="nl-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isPreviewLogin ? "current-password" : "new-password"}
                    minLength={8}
                    required
                  />
                </div>
                {!isPreviewLogin && (
                  <div className="flex flex-col gap-2">
                    <label htmlFor="nl-pass2" className="text-sm font-medium text-[var(--fg)]">
                      Repetila
                    </label>
                    <input
                      id="nl-pass2"
                      type="password"
                      className="nl-input"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                )}
              </div>
              <p className="-mt-2 text-xs text-[var(--fg-3)]">Mínimo 8 caracteres.</p>
              {/* Cloudflare: casi siempre invisible; aparece solo si quiere confirmar que hay una persona. */}
              <TurnstileWidget className="flex justify-center" />
              <button type="submit" disabled={loading} className="nl-btn nl-btn--primary mt-1 w-full disabled:opacity-60">
                {loading && <Loader2 className="nl-spin h-4 w-4" aria-hidden />}
                {loading ? "Creando la cuenta" : `Empezar mis ${TRIAL_DAYS} días gratis`}
              </button>
              {showGoogle && !isPreviewLogin && (
                <>
                  <p className="nl-alt" role="separator">
                    <span>o continuá con</span>
                  </p>
                  <GoogleSignInButton
                    className="nl-google"
                    onCredential={(token) => void handleGoogle(token)}
                    disabled={loading}
                  />
                </>
              )}
            </div>
          </form>
        </Reveal>
      </div>
    </section>
  );
}
