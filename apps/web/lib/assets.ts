const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");

/**
 * Resuelve referencias de imagen almacenadas en la API (`/uploads/...`) a URL absoluta.
 * URLs externas http(s) se devuelven sin cambios.
 */
export function assetUrl(ref: string | null | undefined): string {
  if (!ref) return "";
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
  if (ref.startsWith("/uploads/")) return `${API_BASE}${ref}`;
  return ref;
}
