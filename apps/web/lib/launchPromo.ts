const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");

/**
 * Promo de lanzamiento del plan Pro. La cuenta de lugares la lleva la API
 * (`GET /public/launch-promo`): arranca en 6 y suma un lugar por cada comercio
 * que se da de alta desde el lanzamiento. Esto es lo que se muestra si la API
 * no responde.
 */
export type LaunchPromoState = {
  discountPercent: number;
  months: number;
  spots: number;
  taken: number;
};

export const LAUNCH_PROMO_FALLBACK: LaunchPromoState = {
  discountPercent: 15,
  months: 3,
  spots: 15,
  taken: 6,
};

function isState(value: unknown): value is LaunchPromoState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return ["discountPercent", "months", "spots", "taken"].every((k) => typeof v[k] === "number" && Number.isFinite(v[k]));
}

export async function fetchLaunchPromo(signal?: AbortSignal): Promise<LaunchPromoState> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/launch-promo`, { signal, cache: "no-store" });
    if (!res.ok) return LAUNCH_PROMO_FALLBACK;
    const body: unknown = await res.json();
    // La API envuelve las respuestas en { success, data }.
    const data = body && typeof body === "object" && "data" in body ? (body as { data: unknown }).data : body;
    return isState(data) ? data : LAUNCH_PROMO_FALLBACK;
  } catch {
    return LAUNCH_PROMO_FALLBACK;
  }
}
