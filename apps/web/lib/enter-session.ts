import { saveSession, sessionFromToken } from "./auth";
import { invalidateMyModules } from "./permissions";
import { invalidateTgsEnabled } from "./tgs";

const ONBOARDING_TIMEOUT_MS = 5000;

/** Ruta interna a la que quería ir antes de que el middleware lo mande a login. */
export function safeFrom(): string | null {
  if (typeof window === "undefined") return null;
  const from = new URLSearchParams(window.location.search).get("from");
  if (!from || !from.startsWith("/") || from.startsWith("//") || from.startsWith("/\\")) return null;
  if (["/login", "/register", "/verify-email", "/forgot-password"].some((p) => from.startsWith(p))) return null;
  return from;
}

/**
 * Guarda la sesión y entra a la app (onboarding si falta). Con la contraseña
 * regenerada va primero a completar la cuenta.
 */
export async function enterAuthenticated(token: string, username: string, opts: { mustSetupAccount?: boolean } = {}) {
  invalidateMyModules();
  invalidateTgsEnabled();
  saveSession(token, sessionFromToken(token, username));
  if (opts.mustSetupAccount) {
    window.location.assign("/completar-cuenta");
    return;
  }
  let destination = safeFrom() ?? "/search";
  try {
    const { onboardingApi } = await import("./api");
    const status = await Promise.race([
      onboardingApi.status(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ONBOARDING_TIMEOUT_MS)),
    ]);
    if (status.data.needsOnboarding) destination = "/onboarding";
  } catch {
    // Si falla o tarda el status, caemos al destino habitual.
  }
  window.location.assign(destination);
}
