import { adsApi } from "@/lib/api";

const impressed = new Set<string>();

function pathOf() {
  return typeof window === "undefined" ? undefined : window.location.pathname;
}

/** Una impresión por campaña y sesión de pestaña, para no inflar el recuento. */
export function trackAdImpression(campaignId: string) {
  if (!campaignId || impressed.has(campaignId)) return;
  impressed.add(campaignId);
  void adsApi.track(campaignId, "impression", pathOf()).catch(() => {
    impressed.delete(campaignId);
  });
}

export function trackAdClick(campaignId: string) {
  if (!campaignId) return;
  void adsApi.track(campaignId, "click", pathOf()).catch(() => {
    /* el click igual navega */
  });
}
