const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");

/**
 * Resuelve referencias de imagen almacenadas en la API (`/uploads/...`) a una URL
 * servible por el frontend.
 *
 * Las rutas `/uploads/...` pasan por `/img-proxy` (mismo origen que la web) para
 * evitar imágenes rotas por CORP/CORS al cargar directo desde el dominio de la API.
 * URLs externas http(s) se dejan como están (también se pueden proxificar si hace falta).
 */
export function assetUrl(ref: string | null | undefined): string {
  if (!ref) return "";
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
  if (ref.startsWith("/uploads/")) {
    const absolute = `${API_BASE}${ref}`;
    return `/img-proxy?url=${encodeURIComponent(absolute)}&trim=0`;
  }
  return ref;
}

/** URL absoluta del asset en la API (sin proxy). Útil para fetch server-side. */
export function assetAbsoluteUrl(ref: string | null | undefined): string {
  if (!ref) return "";
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
  if (ref.startsWith("/uploads/")) return `${API_BASE}${ref}`;
  return ref;
}
