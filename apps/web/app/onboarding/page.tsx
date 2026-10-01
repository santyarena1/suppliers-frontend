"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, AlertCircle } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";
import DataField from "@/components/landing/DataField";
import { onboardingApi, type OnboardingStatus } from "@/lib/api";
import { saveSession, sessionFromToken, getUser, clearSession } from "@/lib/auth";
import { invalidateMyModules } from "@/lib/permissions";
import { archivo, chivoMono } from "@/app/(marketing)/fonts";
import "../(marketing)/landing.css";
import "./onboarding.css";
import { clearTrialPlan, readTrialPlan } from "@/lib/trial-plan";
import SupplierJoinCard from "@/components/onboarding/SupplierJoinCard";

/** Lo que viene después de crear el comercio (la guía corre dentro de la app). */
const NEXT_UP = [
  "Buscar en todos tus distribuidores a la vez",
  "Armar el carrito por distribuidor",
  "Ver tus pedidos",
  "Conectar tus distribuidores reales",
  "Sumar a tu equipo",
];

/**
 * Alta del comercio. Es lo único que se hace fuera de la app: con la
 * organización creada, la guía sigue adentro, sobre las pantallas reales.
 */
function OnboardingInner() {
  const router = useRouter();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  /** Comercio (crea la organización) o distribuidor / marca (deja una solicitud). */
  const [audience, setAudience] = useState<"RETAILER" | "SUPPLIER">("RETAILER");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await onboardingApi.status();
      if (res.data.hasTenant) {
        window.location.assign("/");
        return;
      }
      setStatus(res.data);
      const user = getUser();
      if (user?.email) setContactEmail((prev) => prev || user.email || "");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo cargar el alta.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyToken(token: string) {
    invalidateMyModules();
    saveSession(token, sessionFromToken(token, getUser()?.username ?? ""));
  }

  async function bootstrap(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await onboardingApi.bootstrap({
        name: orgName.trim(),
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
        trialPlan: readTrialPlan(),
      });
      clearTrialPlan();
      applyToken(res.data.token);
      // Entra a la app: la guía arranca sola en el primer paso.
      window.location.assign("/");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo crear la organización.");
      setBusy(false);
    }
  }

  async function exitPreview() {
    setBusy(true);
    try {
      const res = await onboardingApi.exitPreview();
      if (res.data.token) applyToken(res.data.token);
      window.location.assign("/");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo salir del preview.");
      setBusy(false);
    }
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

  return (
    <main className={`lnd ob ${archivo.variable} ${chivoMono.variable}`}>
      <DataField className="ob__field-bg" />
      <div className="lnd-vignette" aria-hidden="true" />
      <div className="lnd-grain" aria-hidden="true" />

      <header className="ob__top">
        <Link href="/" className="ob__brand">
          <NodoLogo className="w-7 h-7" />
          <span>
            <NodoWordmark className="h-3.5" />
            <em className="lnd-mono">Alta</em>
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
              router.replace("/login");
            }}
          >
            Salir
          </button>
        </div>
      </header>

      <div className="ob__layout">
        <aside className="ob__rail">
          <p className="lnd-label">{status?.preview ? "Preview superadmin" : audience === "SUPPLIER" ? "Distribuidores y marcas" : "Prueba gratis"}</p>
          <h1 className="lnd-display lnd-display--md">{audience === "SUPPLIER" ? "Sumate a NODO" : "Creá tu comercio"}</h1>
          <p className="lnd-body ob__lead">
            {status?.preview
              ? "Estás probando el alta desde cero. Al terminar volvés a Administración."
              : audience === "SUPPLIER"
              ? "Tu espacio para vender en NODO lo armamos con vos. Dejanos tus datos y te contactamos en menos de 24 h hábiles."
              : "Es un solo paso. Después te mostramos la app con dos distribuidores de prueba, en 2 minutos."}
          </p>
          {audience === "RETAILER" && (
          <ol className="ob__steps">
            <li>
              <span className="ob__step is-active">
                <span className="ob__step-n lnd-mono">01</span>
                <span className="ob__step-label">Nombre del comercio</span>
              </span>
            </li>
            {NEXT_UP.map((label, i) => (
              <li key={label}>
                <span className="ob__step">
                  <span className="ob__step-n lnd-mono">{String(i + 2).padStart(2, "0")}</span>
                  <span className="ob__step-label">{label}</span>
                </span>
              </li>
            ))}
          </ol>
          )}
        </aside>

        <section className="ob__stage">
          {error && (
            <p className="ob__error" role="alert">
              <AlertCircle className="w-4 h-4" />
              {error}
            </p>
          )}

          {!status?.preview && (
            <div className="lnd-seg ob__audience" role="group" aria-label="Qué tipo de empresa sos">
              <button type="button" aria-pressed={audience === "RETAILER"} onClick={() => setAudience("RETAILER")}>
                Tengo un comercio
              </button>
              <button type="button" aria-pressed={audience === "SUPPLIER"} onClick={() => setAudience("SUPPLIER")}>
                Soy distribuidor / marca
              </button>
            </div>
          )}

          {audience === "SUPPLIER" && !status?.preview ? (
            <SupplierJoinCard defaultEmail={contactEmail || undefined} />
          ) : (
          <form className="lnd-panel lnd-panel--sheer ob__card" onSubmit={bootstrap}>
            <p className="lnd-label">Paso 01 · Organización</p>
            <h2 className="ob__card-title">¿Cómo se llama tu local?</h2>
            <p className="lnd-body">Ese nombre es lo que ven tus distribuidores y tu equipo.</p>

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
              Crear comercio
              <ArrowRight className="w-4 h-4 lnd-btn__arrow" />
            </button>
            <p className="lnd-note">
              Te cargamos dos distribuidores de prueba con productos y pedidos de ejemplo. Nada se le manda a nadie.
            </p>
          </form>
          )}
        </section>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <AuthGuard>
      <OnboardingInner />
    </AuthGuard>
  );
}
