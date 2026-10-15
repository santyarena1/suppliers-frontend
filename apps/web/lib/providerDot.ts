import { canSyncProvider, IMPLEMENTED_PROVIDERS, isListProvider, type FreshnessStatus, type Provider, type ProviderStatus } from "@/lib/api";

/** Se conecta con una lista de precios (no tiene API en NODO): Ashir, los LIST_… */
export function connectsByList(provider: string): boolean {
  return isListProvider(provider) || !IMPLEMENTED_PROVIDERS.includes(provider as Provider);
}

export type DotTone = "loading" | "ok" | "warn" | "off";

/**
 * Color del puntito de cada proveedor en el sidebar.
 *  - Por lista: verde con la lista cargada y vigente, amarillo si se está por
 *    vencer (o ya venció) y gris si ya no se ve en el catálogo (sin productos o
 *    fuera de la búsqueda).
 *  - Por API: verde sincronizado, amarillo con cuenta pero sin sincronizar, gris sin cuenta.
 */
export function providerDotTone(
  provider: string,
  status: ProviderStatus | undefined,
  freshness: FreshnessStatus | undefined,
  loading: boolean,
  inSearch = true
): DotTone {
  if (loading && !status) return "loading";
  if (connectsByList(provider)) {
    if (!status || status.total <= 0 || !inSearch) return "off";
    if (freshness === "DUE_SOON" || freshness === "OVERDUE") return "warn";
    return "ok";
  }
  if (!canSyncProvider(status)) return "off";
  return status?.lastSyncedAt ? "ok" : "warn";
}

export const DOT_CLASS: Record<DotTone, string> = {
  loading: "bg-surface-700 animate-pulse",
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  off: "bg-surface-600",
};

export function providerDotTitle(provider: string, tone: DotTone, freshness: FreshnessStatus | undefined): string {
  if (connectsByList(provider)) {
    if (tone === "off") return "No se ve en el catálogo: subí tu lista o volvé a sumarlo a la búsqueda";
    if (freshness === "OVERDUE") return "La lista está vencida: subí una nueva";
    if (freshness === "DUE_SOON") return "La lista se está por vencer";
    return "Lista cargada";
  }
  if (tone === "off") return "Sin cuenta conectada";
  if (tone === "warn") return "Cuenta conectada, todavía sin sincronizar";
  return "Sincronizado";
}
