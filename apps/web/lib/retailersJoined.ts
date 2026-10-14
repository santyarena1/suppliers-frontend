const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");

/**
 * Cuántos comercios ya usan NODO. La cuenta la lleva la API
 * (`GET /public/retailers-joined`): una base fija más cada comercio que se da
 * de alta desde el lanzamiento. Esto es lo que se muestra si la API no responde.
 */
export const RETAILERS_JOINED_FALLBACK = 6;

export async function fetchRetailersJoined(signal?: AbortSignal): Promise<number> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/retailers-joined`, { signal, cache: "no-store" });
    if (!res.ok) return RETAILERS_JOINED_FALLBACK;
    const body: unknown = await res.json();
    // La API envuelve las respuestas en { success, data }.
    const data = body && typeof body === "object" && "data" in body ? (body as { data: unknown }).data : body;
    const count = data && typeof data === "object" ? (data as { count?: unknown }).count : undefined;
    return typeof count === "number" && Number.isFinite(count) ? count : RETAILERS_JOINED_FALLBACK;
  } catch {
    return RETAILERS_JOINED_FALLBACK;
  }
}
