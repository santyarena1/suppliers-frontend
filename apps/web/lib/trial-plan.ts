/**
 * El plan que eligió en la landing para la prueba gratis. Vive entre el clic en
 * el plan y el alta de la organización en el onboarding.
 */

export type TrialPlan = "BASE" | "PRO";

const KEY = "nodo.trialPlan";

export const TRIAL_DAYS = 14;

export function rememberTrialPlan(plan: TrialPlan): void {
  try {
    localStorage.setItem(KEY, plan);
  } catch {
    /* sin almacenamiento la prueba arranca en Base */
  }
}

export function readTrialPlan(): TrialPlan | undefined {
  try {
    const value = localStorage.getItem(KEY);
    return value === "BASE" || value === "PRO" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function clearTrialPlan(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nada que limpiar */
  }
}
