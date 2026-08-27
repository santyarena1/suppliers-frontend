import { assetUrl } from "./assets";

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
  return `/img-proxy?url=${encodeURIComponent(url)}${trim}`;
}
