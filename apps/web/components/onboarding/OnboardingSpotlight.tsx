"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, X } from "lucide-react";
import {
  clearTour,
  currentTourStep,
  loadTour,
  saveTour,
  type TourState,
} from "@/lib/onboarding-tour";
import { onboardingApi } from "@/lib/api";
import { saveSession, sessionFromToken, getUser } from "@/lib/auth";
import { invalidateMyModules } from "@/lib/permissions";
import "@/app/onboarding/onboarding.css";

type Rect = { top: number; left: number; width: number; height: number };

/**
 * Spotlight del recorrido: oscurece la app y encuadra el control a tocar.
 * Vive en el AppShell para acompañar al usuario entre pantallas.
 */
export default function OnboardingSpotlight() {
  const router = useRouter();
  const [tour, setTour] = useState<TourState | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setTour(loadTour());
  }, []);

  useEffect(() => {
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "nodo.onboarding.tour") refresh();
    };
    const onCustom = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("nodo:tour", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("nodo:tour", onCustom as EventListener);
    };
  }, [refresh]);

  const step = currentTourStep(tour);

  useEffect(() => {
    if (!step?.spotlight || typeof document === "undefined") {
      setRect(null);
      return;
    }
    let cancelled = false;
    let tries = 0;

    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(step.spotlight!) as HTMLElement | null;
      if (!el) {
        tries += 1;
        if (tries < 40) window.setTimeout(measure, 120);
        else setRect(null);
        return;
      }
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top + window.scrollY,
        left: r.left + window.scrollX,
        width: r.width,
        height: r.height,
      });
      el.setAttribute("data-tour-active", "1");
    };

    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      document.querySelectorAll("[data-tour-active]").forEach((n) => n.removeAttribute("data-tour-active"));
    };
  }, [step?.id, step?.spotlight, tour?.stepIndex]);

  if (!tour?.active || !step || step.kind === "setup") return null;
  // En el hub (/onboarding) no tapamos la pantalla: el hub maneja setup/finish.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/onboarding")) {
    return null;
  }

  async function advance() {
    if (!tour) return;
    const nextIndex = tour.stepIndex + 1;
    if (nextIndex >= tour.steps.length) {
      setBusy(true);
      try {
        const res = await onboardingApi.complete();
        const data = res.data as unknown as { token?: string };
        if (data.token) {
          invalidateMyModules();
          saveSession(data.token, sessionFromToken(data.token, getUser()?.username ?? ""));
        }
        clearTour();
        router.push("/search");
      } finally {
        setBusy(false);
      }
      return;
    }
    const next = tour.steps[nextIndex];
    const nextState: TourState = { ...tour, stepIndex: nextIndex };
    saveTour(nextState);
    setTour(nextState);
    if (next.href) router.push(next.href);
    else router.push("/onboarding");
  }

  function dismiss() {
    clearTour();
    setTour(null);
    router.push("/onboarding");
  }

  const pad = 10;
  const hole = rect
    ? {
        top: Math.max(8, rect.top - pad - (typeof window !== "undefined" ? window.scrollY : 0)),
        left: Math.max(8, rect.left - pad - (typeof window !== "undefined" ? window.scrollX : 0)),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // Convert stored absolute coords to viewport for fixed overlay
  const viewHole = rect
    ? {
        top: rect.top - (typeof window !== "undefined" ? window.scrollY : 0) - pad,
        left: rect.left - (typeof window !== "undefined" ? window.scrollX : 0) - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  return (
    <div className="ob-spot" aria-live="polite">
      <div className="ob-spot__dim" />
      {viewHole && (
        <div
          className="ob-spot__hole"
          style={{
            top: viewHole.top,
            left: viewHole.left,
            width: viewHole.width,
            height: viewHole.height,
          }}
        />
      )}
      <div
        className={`ob-spot__card${viewHole ? " ob-spot__card--anchored" : ""}`}
        style={
          viewHole
            ? {
                top: Math.min(
                  (typeof window !== "undefined" ? window.innerHeight : 800) - 220,
                  Math.max(16, viewHole.top + viewHole.height + 14)
                ),
                left: Math.min(
                  (typeof window !== "undefined" ? window.innerWidth : 1200) - 360,
                  Math.max(16, viewHole.left)
                ),
              }
            : undefined
        }
      >
        <div className="ob-spot__head">
          <p className="ob-spot__eyebrow">
            Paso {String(tour.stepIndex + 1).padStart(2, "0")} · {tour.steps.length}
          </p>
          <button type="button" className="ob-spot__x" onClick={dismiss} aria-label="Pausar guía">
            <X className="w-4 h-4" />
          </button>
        </div>
        <h3 className="ob-spot__title">{step.title}</h3>
        <p className="ob-spot__body">{step.body}</p>
        <div className="ob-spot__actions">
          <button type="button" className="ob-spot__btn ob-spot__btn--ghost" onClick={dismiss}>
            Pausar
          </button>
          <button type="button" className="ob-spot__btn ob-spot__btn--primary" onClick={() => void advance()} disabled={busy}>
            {tour.stepIndex >= tour.steps.length - 1 ? (
              <>
                Terminar
                <CheckCircle2 className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Siguiente
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
