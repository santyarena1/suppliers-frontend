/**
 * Cloudflare Turnstile: el token que prueba que quien entra es una persona en
 * un navegador. El widget (components/TurnstileWidget) lo deja acá y el
 * cliente del API lo adjunta en login, registro y código de verificación.
 * Cada token sirve una sola vez: al usarlo se pide otro.
 */

export const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();

/** Rutas del API que exigen el token. */
export const HUMAN_ROUTES = ["/auth/login", "/auth/register", "/auth/verify-email", "/auth/resend-verification"];

/** Cuánto se espera al widget antes de mandar igual (el API decide). */
const WAIT_MS = 10_000;

let token: string | null = null;
let waiters: ((value: string | null) => void)[] = [];
let resetWidget: (() => void) | null = null;

export function turnstileEnabled(): boolean {
  return TURNSTILE_SITE_KEY.length > 0;
}

export function provideHumanToken(value: string) {
  token = value;
  const pending = waiters;
  waiters = [];
  pending.forEach((resolve) => resolve(value));
}

export function clearHumanToken() {
  token = null;
}

export function registerTurnstileReset(fn: (() => void) | null) {
  resetWidget = fn;
}

/** El token vigente (esperando al widget si hace falta). Lo consume y pide uno nuevo. */
export async function takeHumanToken(): Promise<string | null> {
  if (!turnstileEnabled()) return null;
  const value =
    token ??
    (await new Promise<string | null>((resolve) => {
      waiters.push(resolve);
      setTimeout(() => resolve(null), WAIT_MS);
    }));
  token = null;
  resetWidget?.();
  return value;
}
