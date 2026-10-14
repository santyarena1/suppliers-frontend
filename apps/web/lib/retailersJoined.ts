const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");

const STORAGE_KEY = "nodo:retailers-joined";

/**
 * Cuántos comercios ya usan NODO. La cuenta la lleva la API
 * (`GET /public/retailers-joined`): una base fija más cada comercio que se da
 * de alta desde el lanzamiento. Si la API no responde se usa el último valor
 * que vio este navegador y, si nunca vio ninguno, este piso.
 */
export const RETAILERS_JOINED_FALLBACK = 7;

function remembered(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(n) && n > 0 ? n : RETAILERS_JOINED_FALLBACK;
  } catch {
    return RETAILERS_JOINED_FALLBACK;
  }
}

function remember(count: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(count));
  } catch {
    // Sin almacenamiento: la próxima vez se vuelve a pedir y listo.
  }
}

export async function fetchRetailersJoined(signal?: AbortSignal): Promise<number> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/retailers-joined`, { signal, cache: "no-store" });
    if (!res.ok) return remembered();
    const body: unknown = await res.json();
    // La API envuelve las respuestas en { success, data }.
    const data = body && typeof body === "object" && "data" in body ? (body as { data: unknown }).data : body;
    const count = data && typeof data === "object" ? (data as { count?: unknown }).count : undefined;
    if (typeof count !== "number" || !Number.isFinite(count)) return remembered();
    remember(count);
    return count;
  } catch {
    return remembered();
  }
}
