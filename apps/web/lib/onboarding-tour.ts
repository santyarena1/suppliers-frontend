/** Persistencia del tour guiado entre pantallas del AppShell. */

export type TourStep = {
  id: string;
  kind: "setup" | "tour" | "finish";
  title: string;
  body: string;
  href: string | null;
  spotlight: string | null;
  ctaLabel: string;
};

export type TourState = {
  active: boolean;
  stepIndex: number;
  steps: TourStep[];
  mode: "fresh" | "existing" | "preview";
  preview: boolean;
};

const KEY = "nodo.onboarding.tour";

export function loadTour(): TourState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TourState;
    if (!parsed?.active || !Array.isArray(parsed.steps)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveTour(state: TourState | null) {
  if (typeof window === "undefined") return;
  if (!state) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("nodo:tour", { detail: state }));
}

export function clearTour() {
  saveTour(null);
}

export function currentTourStep(state: TourState | null): TourStep | null {
  if (!state?.active) return null;
  return state.steps[state.stepIndex] ?? null;
}
