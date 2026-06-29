import { MOCK_FALLBACK_ENABLED, MOCK_SESSION_KEY } from "./config";

const MOCK_EVENT = "brands-mock-change";

export function markMockActive() {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(MOCK_SESSION_KEY, "1");
    window.dispatchEvent(new Event(MOCK_EVENT));
  }
}

export function clearMockActive() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(MOCK_SESSION_KEY);
    window.dispatchEvent(new Event(MOCK_EVENT));
  }
}

export function isMockActive(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(MOCK_SESSION_KEY) === "1";
}

export { MOCK_EVENT };

/**
 * Intenta la llamada real al backend. Si falla y el fallback está habilitado,
 * devuelve datos hardcodeados de _dev-fallback/.
 */
export async function withFallback<T>(
  label: string,
  live: () => Promise<T>,
  mock: () => T | Promise<T>
): Promise<T> {
  if (!MOCK_FALLBACK_ENABLED) return live();

  try {
    const result = await live();
    clearMockActive();
    return result;
  } catch {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[brands/_dev-fallback] ${label} → datos hardcodeados`);
    }
    markMockActive();
    return mock();
  }
}
