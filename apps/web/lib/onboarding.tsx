"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onboardingApi, type OnboardingStatus, type OnboardingStep, type OnboardingStepId } from "./api";
import { getUser, saveSession, sessionFromToken } from "./auth";
import { invalidateMyModules } from "./permissions";

/**
 * Estado del recorrido guiado. El paso en el que va cada persona vive en el
 * servidor (`currentStep`): la app lo lee de ahí y lo guarda ahí, así no hay dos
 * versiones que se desincronicen. Lo único local es si la guía está pausada,
 * que es una preferencia de esta pantalla.
 */
interface OnboardingContextValue {
  status: OnboardingStatus | null;
  /** Pasos de la guía dentro de la app (sin el alta de la organización). */
  steps: OnboardingStep[];
  step: OnboardingStep | null;
  index: number;
  /** La guía corre (hay recorrido pendiente y no está pausada). */
  active: boolean;
  /** Hay recorrido pendiente (pausado o no). */
  pending: boolean;
  paused: boolean;
  busy: boolean;
  go: (id: OnboardingStepId) => void;
  next: () => void;
  back: () => void;
  pause: () => void;
  resume: () => void;
  finish: () => Promise<void>;
  refresh: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function pauseKey(): string {
  return `nodo.onboarding.paused.${getUser()?.id ?? "anon"}`;
}

function readPaused(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(pauseKey()) === "1";
  } catch {
    return false;
  }
}

function writePaused(value: boolean) {
  try {
    if (value) localStorage.setItem(pauseKey(), "1");
    else localStorage.removeItem(pauseKey());
  } catch {
    /* sin almacenamiento: la guía igual funciona, solo no recuerda la pausa */
  }
}

/** ¿La pantalla actual es la del paso? Compara solo la ruta, no los filtros. */
export function isOnStepPage(step: OnboardingStep | null, pathname: string): boolean {
  if (!step?.href) return true;
  const target = step.href.split("?")[0];
  return target === "/" ? pathname === "/" : pathname === target || pathname.startsWith(`${target}/`);
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [current, setCurrent] = useState<OnboardingStepId | null>(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await onboardingApi.status();
      setStatus(res.data);
      setCurrent(res.data.currentStep);
      setPaused(readPaused());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const steps = useMemo(() => (status?.steps ?? []).filter((s) => s.kind !== "setup"), [status]);
  const index = Math.max(0, steps.findIndex((s) => s.id === current));
  const step = steps[index] ?? null;
  const pending = Boolean(status?.hasTenant && status.needsOnboarding && steps.length > 0);
  const active = pending && !paused;

  const go = useCallback(
    (id: OnboardingStepId) => {
      const target = steps.find((s) => s.id === id);
      if (!target) return;
      setCurrent(id);
      setPaused(false);
      writePaused(false);
      // Se guarda sin esperar: si falla, al recargar retoma el último paso guardado.
      void onboardingApi.setStep(id).catch(() => undefined);
      // Solo navega si la URL cambia: dos pasos seguidos en la misma búsqueda no
      // suman entradas al historial ni recargan la pantalla.
      const here = typeof window === "undefined" ? pathname : `${window.location.pathname}${window.location.search}`;
      if (target.href && here !== target.href) {
        if (!isOnStepPage(target, pathname) || target.href.includes("?")) router.push(target.href);
      }
    },
    [steps, pathname, router]
  );

  const next = useCallback(() => {
    const following = steps[index + 1];
    if (following) go(following.id);
  }, [steps, index, go]);

  const back = useCallback(() => {
    const previous = steps[index - 1];
    if (previous) go(previous.id);
  }, [steps, index, go]);

  const pause = useCallback(() => {
    setPaused(true);
    writePaused(true);
  }, []);

  const resume = useCallback(() => {
    if (step) go(step.id);
  }, [step, go]);

  const finish = useCallback(async () => {
    setBusy(true);
    try {
      const res = await onboardingApi.complete();
      const token = (res.data as { token?: string }).token;
      if (token) {
        invalidateMyModules();
        saveSession(token, sessionFromToken(token, getUser()?.username ?? ""));
      }
      writePaused(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const value = useMemo<OnboardingContextValue>(
    () => ({ status, steps, step, index, active, pending, paused, busy, go, next, back, pause, resume, finish, refresh }),
    [status, steps, step, index, active, pending, paused, busy, go, next, back, pause, resume, finish, refresh]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding va dentro de OnboardingProvider");
  return ctx;
}
