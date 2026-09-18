"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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

const PAD = 10;
const CARD_W = 300;
const CARD_H_EST = 190;
const GAP = 12;
const MARGIN = 12;

function inflate(r: Rect, pad = PAD): Rect {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let top = Math.max(8, r.top - pad);
  let left = Math.max(8, r.left - pad);
  let width = Math.min(vw - left - 8, r.width + pad * 2);
  let height = Math.min(vh - top - 8, r.height + pad * 2);
  // Si el target es enorme (grilla), limitamos el hueco para no “tragar” toda la UI.
  const maxH = Math.floor(vh * 0.62);
  if (height > maxH) {
    height = maxH;
  }
  const maxW = Math.floor(vw * 0.92);
  if (width > maxW) {
    width = maxW;
    left = Math.max(8, Math.min(left, vw - width - 8));
  }
  return { top, left, width, height };
}

/** Coloca la tarjeta sin tapar el hueco resaltado. */
function placeCard(hole: Rect, vw: number, vh: number): { top: number; left: number } {
  const cardW = Math.min(CARD_W, vw - MARGIN * 2);
  const cardH = CARD_H_EST;

  const overlaps = (top: number, left: number) =>
    !(left + cardW < hole.left || left > hole.left + hole.width || top + cardH < hole.top || top > hole.top + hole.height);

  const clampLeft = (left: number) => Math.min(vw - cardW - MARGIN, Math.max(MARGIN, left));
  const clampTop = (top: number) => Math.min(vh - cardH - MARGIN, Math.max(MARGIN, top));

  const preferLeft = clampLeft(hole.left);
  const below = hole.top + hole.height + GAP;
  const above = hole.top - cardH - GAP;

  if (below + cardH <= vh - MARGIN) {
    const top = clampTop(below);
    const left = preferLeft;
    if (!overlaps(top, left)) return { top, left };
  }
  if (above >= MARGIN) {
    const top = clampTop(above);
    const left = preferLeft;
    if (!overlaps(top, left)) return { top, left };
  }

  // Al costado del hueco
  const right = hole.left + hole.width + GAP;
  const leftSide = hole.left - cardW - GAP;
  if (right + cardW <= vw - MARGIN) {
    return { top: clampTop(hole.top), left: clampLeft(right) };
  }
  if (leftSide >= MARGIN) {
    return { top: clampTop(hole.top), left: clampLeft(leftSide) };
  }

  // Esquina opuesta al centro del target
  const cx = hole.left + hole.width / 2;
  const cy = hole.top + hole.height / 2;
  return {
    top: clampTop(cy < vh / 2 ? vh - cardH - MARGIN : MARGIN),
    left: clampLeft(cx < vw / 2 ? vw - cardW - MARGIN : MARGIN),
  };
}

/**
 * Spotlight del recorrido: una sola capa de sombra con hueco limpio.
 * Vive en el AppShell para acompañar al usuario entre pantallas.
 */
export default function OnboardingSpotlight() {
  const router = useRouter();
  const pathname = usePathname();
  const [tour, setTour] = useState<TourState | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewport, setViewport] = useState({ w: 1200, h: 800 });

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
  const onHub = pathname.startsWith("/onboarding");

  useLayoutEffect(() => {
    if (!step?.spotlight || onHub || typeof document === "undefined") {
      setRect(null);
      return;
    }

    let cancelled = false;
    let tries = 0;
    let raf = 0;

    const measure = () => {
      if (cancelled) return;
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      const el = document.querySelector(step.spotlight!) as HTMLElement | null;
      if (!el) {
        tries += 1;
        if (tries < 40) window.setTimeout(measure, 120);
        else setRect(null);
        return;
      }
      document.querySelectorAll("[data-tour-active]").forEach((n) => n.removeAttribute("data-tour-active"));
      el.setAttribute("data-tour-active", "1");
      el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      raf = window.requestAnimationFrame(() => {
        if (cancelled) return;
        const r = el.getBoundingClientRect();
        if (r.width < 2 && r.height < 2) {
          tries += 1;
          if (tries < 40) window.setTimeout(measure, 120);
          return;
        }
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      });
    };

    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      document.querySelectorAll("[data-tour-active]").forEach((n) => n.removeAttribute("data-tour-active"));
    };
  }, [step?.id, step?.spotlight, tour?.stepIndex, onHub, pathname]);

  if (!tour?.active || !step || step.kind === "setup" || onHub) return null;

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

  const hole = rect ? inflate(rect) : null;
  const cardPos = hole ? placeCard(hole, viewport.w, viewport.h) : { top: viewport.h - CARD_H_EST - MARGIN, left: viewport.w - Math.min(CARD_W, viewport.w - MARGIN * 2) - MARGIN };

  return (
    <div className="ob-spot" aria-live="polite">
      {hole ? (
        <>
          {/* Una sola capa: 4 paneles alrededor del hueco (sin dim + box-shadow apilados). */}
          <div className="ob-spot__shade" style={{ top: 0, left: 0, width: "100%", height: Math.max(0, hole.top) }} />
          <div
            className="ob-spot__shade"
            style={{ top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height }}
          />
          <div
            className="ob-spot__shade"
            style={{
              top: hole.top,
              left: hole.left + hole.width,
              width: Math.max(0, viewport.w - hole.left - hole.width),
              height: hole.height,
            }}
          />
          <div
            className="ob-spot__shade"
            style={{
              top: hole.top + hole.height,
              left: 0,
              width: "100%",
              height: Math.max(0, viewport.h - hole.top - hole.height),
            }}
          />
          <div
            className="ob-spot__ring"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
          />
        </>
      ) : (
        <div className="ob-spot__shade ob-spot__shade--full" />
      )}

      <div
        className="ob-spot__card"
        style={{
          top: cardPos.top,
          left: cardPos.left,
          width: Math.min(CARD_W, viewport.w - MARGIN * 2),
        }}
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
