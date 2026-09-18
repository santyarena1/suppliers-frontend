"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Compass,
  Loader2,
  Package,
  Search,
  ShoppingCart,
  Store,
  Users,
  ClipboardList,
  Filter,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";
import {
  onboardingApi,
  type OnboardingStatus,
  type OnboardingStep,
  type OnboardingStepId,
} from "@/lib/api";
import { getToken, saveSession, sessionFromToken, getUser, clearSession } from "@/lib/auth";
import { invalidateMyModules } from "@/lib/permissions";
import "./onboarding.css";

const STEP_ICON: Partial<Record<OnboardingStepId, typeof Store>> = {
  org: Store,
  plan: Sparkles,
  providers: Package,
  search: Search,
  filters: Filter,
  product: Package,
  cart: ShoppingCart,
  orders: ClipboardList,
  team: Users,
  done: CheckCircle2,
};

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
      if (!res.data.needsOnboarding && res.data.hasTenant) {
        router.replace("/");
        return;
      }
      const user = getUser();
      if (user?.email) setContactEmail((prev) => prev || user.email || "");
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
  }, [status?.hasTenant, status?.steps?.length]);

  const progress = useMemo(() => {
    if (!steps.length) return 0;
    return Math.round(((activeStep + 1) / steps.length) * 100);
  }, [activeStep, steps.length]);

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
      invalidateMyModules();
      const token = res.data.token;
      const user = getUser();
      saveSession(token, sessionFromToken(token, user?.username ?? ""));
      setStatus(res.data.onboarding);
      setActiveStep(0);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo crear la organización.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError("");
    try {
      const res = await onboardingApi.complete();
      setStatus(res.data);
      router.replace("/search?q=monitor");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo cerrar el recorrido.");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (activeStep >= steps.length - 1) {
      void finish();
      return;
    }
    setActiveStep((n) => Math.min(n + 1, steps.length - 1));
  }

  function prev() {
    setActiveStep((n) => Math.max(0, n - 1));
  }

  if (loading) {
    return (
      <div className="ob__boot">
        <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
      </div>
    );
  }

  const Icon = step ? STEP_ICON[step.id] ?? Compass : Compass;

  return (
    <main className="ob">
      <div className="ob__aurora" aria-hidden="true" />
      <div className="ob__grain" aria-hidden="true" />

      <header className="ob__top">
        <Link href="/landing" className="ob__brand">
          <NodoLogo className="w-7 h-7" />
          <NodoWordmark className="h-3.5" />
        </Link>
        <button
          type="button"
          className="ob__logout"
          onClick={() => {
            clearSession();
            router.replace("/login");
          }}
        >
          Salir
        </button>
      </header>

      <div className="ob__layout">
        <aside className="ob__rail" aria-label="Pasos del recorrido">
          <p className="ob__eyebrow">Recorrido</p>
          <h1 className="ob__title">
            {status?.hasTenant
              ? `Bienvenido a ${status.tenant?.name}`
              : "Creá tu comercio en NODO"}
          </h1>
          <p className="ob__lead">
            {status?.hasTenant
              ? "Te mostramos proveedores, búsqueda, filtros, carrito y pedidos con datos de ejemplo. Podés probar todo antes de conectar tus distros reales."
              : "El plan Mostrador es gratuito. Primero nombrás tu organización; después explorás el sistema con catálogo y pedidos de prueba."}
          </p>

          <ol className="ob__steps">
            {steps.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`ob__step${i === activeStep ? " is-active" : ""}${i < activeStep ? " is-done" : ""}`}
                  onClick={() => setActiveStep(i)}
                  disabled={!status?.hasTenant && s.id !== "org"}
                >
                  <span className="ob__step-n">{String(i + 1).padStart(2, "0")}</span>
                  <span className="ob__step-label">{s.title}</span>
                </button>
              </li>
            ))}
          </ol>

          <div className="ob__meter" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="ob__meter-fill" style={{ width: `${progress}%` }} />
          </div>
        </aside>

        <section className="ob__stage">
          {error && (
            <p className="ob__error">
              <AlertCircle className="w-4 h-4" />
              {error}
            </p>
          )}

          {step?.id === "org" && !status?.hasTenant ? (
            <form className="ob__card" onSubmit={bootstrap}>
              <div className="ob__card-head">
                <Icon className="ob__card-icon" />
                <div>
                  <p className="ob__eyebrow">Paso 01 · Organización</p>
                  <h2>¿Cómo se llama tu local?</h2>
                </div>
              </div>
              <p className="ob__card-body">
                Ese nombre es lo único que se muestra en pantalla. Tus distribuidores y tu equipo lo van a ver así.
                Entrá al plan <strong>Mostrador</strong> (gratuito); Local y Cadena se habilitan cuando definamos precios.
              </p>

              <label className="ob__field">
                <span>Nombre del comercio</span>
                <input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Ej. Tecno Sur Belgrano"
                  required
                  minLength={2}
                  maxLength={120}
                  autoFocus
                />
              </label>
              <label className="ob__field">
                <span>Email de contacto</span>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="compras@tulocal.com"
                />
              </label>
              <label className="ob__field">
                <span>Teléfono (opcional)</span>
                <input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+54 11 …"
                />
              </label>

              <button type="submit" className="ob__cta" disabled={busy || orgName.trim().length < 2}>
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creando comercio…
                  </>
                ) : (
                  <>
                    Crear organización y cargar demo
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              <p className="ob__hint">
                Al crear el comercio cargamos 2 distribuidores demo, 4 productos y 2 pedidos de ejemplo para que pruebes filtros y el flujo completo.
              </p>
            </form>
          ) : step ? (
            <div className="ob__card">
              <div className="ob__card-head">
                <Icon className="ob__card-icon" />
                <div>
                  <p className="ob__eyebrow">
                    Paso {String(activeStep + 1).padStart(2, "0")}
                    {status?.tenant?.planLabel ? ` · Plan ${status.tenant.planLabel}` : ""}
                    {status?.roleLabel ? ` · ${status.roleLabel}` : ""}
                  </p>
                  <h2>{step.title}</h2>
                </div>
              </div>
              <p className="ob__card-body">{step.body}</p>

              {step.id === "plan" && status?.demo && (
                <ul className="ob__bullets">
                  <li>Plan Mostrador gratuito activo</li>
                  <li>
                    {status.demo.productCount} productos demo en{" "}
                    {status.demo.distributors.map((d) => d.name).join(" y ")}
                  </li>
                  <li>
                    Probá buscar: {status.demo.searchHints.map((h) => `«${h}»`).join(", ")}
                  </li>
                </ul>
              )}

              {step.id === "providers" && status?.demo && (
                <ul className="ob__bullets">
                  {status.demo.distributors.map((d) => (
                    <li key={d.providerKey}>{d.name}</li>
                  ))}
                </ul>
              )}

              <div className="ob__actions">
                {activeStep > 0 && (
                  <button type="button" className="ob__ghost" onClick={prev} disabled={busy}>
                    Atrás
                  </button>
                )}
                {step.href && (
                  <Link href={step.href} className="ob__ghost ob__ghost--link" target="_self">
                    Abrir pantalla
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
                <button type="button" className="ob__cta" onClick={next} disabled={busy}>
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : activeStep >= steps.length - 1 ? (
                    <>
                      Terminar y entrar
                      <CheckCircle2 className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      Siguiente
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {status?.hasTenant && (
                <p className="ob__hint">
                  Mientras explorás, la barra de ayuda te recuerda el recorrido. Podés cerrarlo cuando quieras y reabrirlo desde Configuración → Ayuda.
                </p>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  // Evitar warning de token no usado en SSR de getToken
  if (typeof window !== "undefined" && !getToken()) {
    // AuthGuard redirige
  }
  return (
    <AuthGuard>
      <OnboardingInner />
    </AuthGuard>
  );
}
