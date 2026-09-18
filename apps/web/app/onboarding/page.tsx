"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Compass,
  Loader2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";
import DataField from "@/components/landing/DataField";
import {
  onboardingApi,
  type OnboardingStatus,
  type OnboardingStep,
} from "@/lib/api";
import { getToken, saveSession, sessionFromToken, getUser, clearSession } from "@/lib/auth";
import { invalidateMyModules } from "@/lib/permissions";
import { clearTour, saveTour, type TourStep } from "@/lib/onboarding-tour";
import { archivo, chivoMono } from "@/app/(marketing)/fonts";
import "../(marketing)/landing.css";
import "./onboarding.css";

function OnboardingInner() {
  const router = useRouter();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [activeStep, setActiveStep] = useState(0);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await onboardingApi.status();
      setStatus(res.data);
      // Si ya completó y no está en preview, igual puede reabrir desde Ayuda;
      // acá solo redirigimos si llegó sin necesidad y sin steps.
      if (!res.data.needsOnboarding && res.data.hasTenant && res.data.steps.length === 0) {
        router.replace("/");
        return;
      }
      const user = getUser();
      if (user?.email) setContactEmail((prev) => prev || user.email || "");
      if (res.data.mode === "existing" && res.data.hasTenant && !res.data.needsOnboarding) {
        // Página abierta a propósito: ofrecer start-tour.
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo cargar el onboarding.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const steps = status?.steps ?? [];
  const step: OnboardingStep | undefined = steps[activeStep] ?? steps[0];

  useEffect(() => {
    setActiveStep(0);
  }, [status?.hasTenant, status?.mode, status?.steps?.length]);

  const progress = useMemo(() => {
    if (!steps.length) return 0;
    return Math.round(((activeStep + 1) / steps.length) * 100);
  }, [activeStep, steps.length]);

  function applyToken(token: string) {
    invalidateMyModules();
    saveSession(token, sessionFromToken(token, getUser()?.username ?? ""));
  }

  async function bootstrap(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await onboardingApi.bootstrap({
        name: orgName.trim(),
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
      });
      applyToken(res.data.token);
      setStatus(res.data.onboarding);
      setActiveStep(0);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo crear la organización.");
    } finally {
      setBusy(false);
    }
  }

  async function startExistingTour() {
    setBusy(true);
    setError("");
    try {
      const res = await onboardingApi.startTour();
      setStatus(res.data);
      setActiveStep(0);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo iniciar el recorrido.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError("");
    try {
      const res = await onboardingApi.complete();
      const payload = res.data as { token?: string; onboarding?: OnboardingStatus };
      if (payload.token) applyToken(payload.token);
      clearTour();
      router.replace(status?.preview ? "/" : "/search?q=monitor");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo cerrar el recorrido.");
    } finally {
      setBusy(false);
    }
  }

  async function exitPreview() {
    setBusy(true);
    try {
      const res = await onboardingApi.exitPreview();
      if (res.data.token) applyToken(res.data.token);
      clearTour();
      router.replace("/");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo salir del preview.");
    } finally {
      setBusy(false);
    }
  }

  function launchTourFrom(index: number) {
    if (!status) return;
    const tourSteps: TourStep[] = status.steps.map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title,
      body: s.body,
      href: s.href,
      spotlight: s.spotlight,
      ctaLabel: s.ctaLabel,
    }));
    saveTour({
      active: true,
      stepIndex: index,
      steps: tourSteps,
      mode: status.mode,
      preview: status.preview,
    });
    const target = tourSteps[index];
    if (target?.href) router.push(target.href);
    else setActiveStep(index);
  }

  function next() {
    if (!step) return;
    if (activeStep >= steps.length - 1) {
      void finish();
      return;
    }
    const nextIdx = activeStep + 1;
    const nextStep = steps[nextIdx];
    if (nextStep?.kind === "tour" && nextStep.href) {
      launchTourFrom(nextIdx);
      return;
    }
    setActiveStep(nextIdx);
  }

  function prev() {
    setActiveStep((n) => Math.max(0, n - 1));
  }

  if (loading) {
    return (
      <main className="lnd ob">
        <div className="ob__boot">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--lilac)" }} />
        </div>
      </main>
    );
  }

  const showExistingCta =
    status &&
    status.hasTenant &&
    !status.needsOnboarding &&
    status.canStartTour &&
    !status.preview;

  return (
    <main className={`lnd ob ${archivo.variable} ${chivoMono.variable}`}>
      <DataField className="ob__field-bg" />
      <div className="lnd-vignette" aria-hidden="true" />
      <div className="lnd-grain" aria-hidden="true" />

      <header className="ob__top">
        <Link href="/landing" className="ob__brand">
          <NodoLogo className="w-7 h-7" />
          <span>
            <NodoWordmark className="h-3.5" />
            <em className="lnd-mono">Recorrido</em>
          </span>
        </Link>
        <div className="ob__top-actions">
          {status?.preview && (
            <button type="button" className="lnd-btn lnd-btn--ghost" onClick={() => void exitPreview()} disabled={busy}>
              Salir del preview
            </button>
          )}
          <button
            type="button"
            className="lnd-btn lnd-btn--ghost"
            onClick={() => {
              clearSession();
              clearTour();
              router.replace("/login");
            }}
          >
            Salir
          </button>
        </div>
      </header>

      <div className="ob__layout">
        <aside className="ob__rail">
          <p className="lnd-label">
            {status?.preview ? "Preview superadmin" : status?.mode === "existing" ? "Repaso" : "Alta · PRO"}
          </p>
          <h1 className="lnd-display lnd-display--md">
            {status?.hasTenant
              ? status.tenant?.name ?? "Tu comercio"
              : "Creá tu comercio"}
          </h1>
          <p className="lnd-body ob__lead">
            {status?.preview
              ? "Estás probando el onboarding desde cero. Al terminar volvés a Administración."
              : status?.hasTenant
                ? "Te guiamos por la app con clics resaltados: proveedores, búsqueda, filtros, carrito y pedidos."
                : "Plan PRO. Nombrás la organización y explorás con catálogo y pedidos de prueba."}
          </p>

          {showExistingCta ? (
            <button type="button" className="lnd-btn lnd-btn--primary ob__rail-cta" onClick={() => void startExistingTour()} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Empezar recorrido
              <ArrowRight className="w-4 h-4 lnd-btn__arrow" />
            </button>
          ) : (
            <>
              <ol className="ob__steps">
                {steps.map((s, i) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`ob__step${i === activeStep ? " is-active" : ""}${i < activeStep ? " is-done" : ""}`}
                      onClick={() => setActiveStep(i)}
                      disabled={!status?.hasTenant && s.id !== "org"}
                    >
                      <span className="ob__step-n lnd-mono">{String(i + 1).padStart(2, "0")}</span>
                      <span className="ob__step-label">
                        {s.title}
                        {s.kind === "tour" && <em className="ob__step-tag">guía</em>}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="ob__meter" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="ob__meter-fill" style={{ width: `${progress}%` }} />
              </div>
            </>
          )}
        </aside>

        <section className="ob__stage">
          {error && (
            <p className="ob__error" role="alert">
              <AlertCircle className="w-4 h-4" />
              {error}
            </p>
          )}

          {showExistingCta ? (
            <div className="lnd-panel lnd-panel--sheer ob__card">
              <p className="lnd-label">Ya tenés tu local</p>
              <h2 className="ob__card-title">Repasá NODO sin reconfigurar</h2>
              <p className="lnd-body">
                Saltamos el alta de organización y el plan. El recorrido resalta los clics en proveedores,
                búsqueda, filtros, carrito, pedidos y equipo, con datos demo si hace falta.
              </p>
              <button type="button" className="lnd-btn lnd-btn--primary" onClick={() => void startExistingTour()} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Empezar guía interactiva
                <ArrowRight className="w-4 h-4 lnd-btn__arrow" />
              </button>
            </div>
          ) : step?.id === "org" && !status?.hasTenant ? (
            <form className="lnd-panel lnd-panel--sheer ob__card" onSubmit={bootstrap}>
              <p className="lnd-label">Paso 01 · Organización</p>
              <h2 className="ob__card-title">¿Cómo se llama tu local?</h2>
              <p className="lnd-body">
                Ese nombre es lo que ven distribuidores y equipo. Entrá al plan{" "}
                <span style={{ color: "var(--mist)" }}>PRO</span>.
              </p>

              <label className="ob__field">
                <span className="lnd-label">Nombre del comercio</span>
                <input
                  className="lnd-input"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Ej. Tecno Sur Belgrano"
                  required
                  minLength={2}
                  maxLength={120}
                  autoFocus
                  data-tour="onboarding-org-name"
                />
              </label>
              <label className="ob__field">
                <span className="lnd-label">Email de contacto</span>
                <input
                  className="lnd-input"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="compras@tulocal.com"
                />
              </label>
              <label className="ob__field">
                <span className="lnd-label">Teléfono (opcional)</span>
                <input
                  className="lnd-input"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+54 11 …"
                />
              </label>

              <button type="submit" className="lnd-btn lnd-btn--primary" disabled={busy || orgName.trim().length < 2}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {step.ctaLabel}
                <ArrowRight className="w-4 h-4 lnd-btn__arrow" />
              </button>
              <p className="lnd-note">
                Al crear cargamos 2 distribuidores demo, 4 productos y 2 pedidos para probar filtros y el flujo completo.
              </p>
            </form>
          ) : step ? (
            <div className="lnd-panel lnd-panel--sheer ob__card">
              <p className="lnd-label">
                Paso {String(activeStep + 1).padStart(2, "0")}
                {status?.tenant?.planLabel ? ` · ${status.tenant.planLabel}` : ""}
                {status?.roleLabel ? ` · ${status.roleLabel}` : ""}
                {step.kind === "tour" ? " · Guía" : ""}
              </p>
              <h2 className="ob__card-title">{step.title}</h2>
              <p className="lnd-body">{step.body}</p>

              {step.id === "plan" && status?.demo && (
                <ul className="ob__bullets">
                  <li>Plan PRO activo</li>
                  <li>
                    {status.demo.productCount} productos demo ·{" "}
                    {status.demo.distributors.map((d) => d.name).join(" · ")}
                  </li>
                  <li>Buscá: {status.demo.searchHints.map((h) => `«${h}»`).join(", ")}</li>
                </ul>
              )}

              <div className="ob__actions">
                {activeStep > 0 && (
                  <button type="button" className="lnd-btn lnd-btn--ghost" onClick={prev} disabled={busy}>
                    Atrás
                  </button>
                )}
                {step.kind === "tour" && step.href ? (
                  <button
                    type="button"
                    className="lnd-btn lnd-btn--primary"
                    onClick={() => launchTourFrom(activeStep)}
                    disabled={busy}
                  >
                    {step.ctaLabel}
                    <Compass className="w-4 h-4 lnd-btn__arrow" />
                  </button>
                ) : (
                  <button type="button" className="lnd-btn lnd-btn--primary" onClick={next} disabled={busy}>
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : activeStep >= steps.length - 1 ? (
                      <>
                        {step.ctaLabel}
                        <CheckCircle2 className="w-4 h-4 lnd-btn__arrow" />
                      </>
                    ) : (
                      <>
                        {step.ctaLabel}
                        <ArrowRight className="w-4 h-4 lnd-btn__arrow" />
                      </>
                    )}
                  </button>
                )}
              </div>
              <p className="lnd-note">
                En la app, el control a tocar queda resaltado. Podés pausar y volver a este hub cuando quieras.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  if (typeof window !== "undefined" && !getToken()) {
    // AuthGuard redirige
  }
  return (
    <AuthGuard>
      <OnboardingInner />
    </AuthGuard>
  );
}
