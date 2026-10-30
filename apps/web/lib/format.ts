import { assetUrl } from "./assets";

/** Hay importe de esta organización. `null` es “todavía no sincronizó”, no cero. */
export function hasOwnPrice(p: { price?: string | number | null; finalPrice?: string | number | null }): boolean {
  return p.price != null || p.finalPrice != null;
}

export function parsePrice(v: string | number | undefined | null): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const cleaned = v.toString().replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export function formatARS(n: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

export function formatUSD(n: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

export function proxyImg(url: string | undefined | null, opts?: { trim?: boolean }): string {
  if (!url) return "";
  if (url.startsWith("/assets/") || url.startsWith("/uploads/")) return assetUrl(url);
  const trim = opts?.trim === false ? "&trim=0" : "";
  // Ya es una foto por el proxy (ficha enriquecida, dirección cifrada): no se envuelve de nuevo.
  if (url.startsWith("/img-proxy?")) return `${url}${trim}`;
  return `/img-proxy?url=${encodeURIComponent(url)}${trim}`;
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "Enviando",
  PENDING_APPROVAL: "Esperando firma",
  CREATED: "Enviado al portal",
  OFFLINE: "Por mensaje",
  REJECTED: "Rechazado",
  FAILED: "Falló",
};

/** Estado de un pedido de NODO en palabras, para las pantallas del distribuidor. */
export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABEL[status] ?? status;
}
