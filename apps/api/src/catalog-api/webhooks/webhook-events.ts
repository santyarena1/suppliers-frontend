import type { CatalogApiWebhookEvent } from "@nodo/shared";
import type { ChangeItem } from "../changes/changes-feed.service";

/** Reintentos tras un fallo: 1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 24 h. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000, 24 * 3_600_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
/** Fallos seguidos (entre todas sus entregas) para apagar un webhook. */
export const DISABLE_AFTER_FAILURES = 20;
/** Items por entrega. */
export const ITEMS_PER_DELIVERY = 100;

/** Cuándo reintentar después del intento número `attempts` (1 = el primero). `null` = no se reintenta más. */
export function nextAttemptAfter(attempts: number, now: Date): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return new Date(now.getTime() + RETRY_DELAYS_MS[Math.max(0, attempts - 1)]);
}

/** Los eventos que representa un cambio (un cambio de precio es también una actualización). */
export function eventsOf(item: ChangeItem): CatalogApiWebhookEvent[] {
  switch (item.type) {
    case "offer.updated": {
      const out: CatalogApiWebhookEvent[] = ["offer.updated"];
      if (item.changed?.includes("price")) out.push("price.changed");
      if (item.changed?.includes("stock")) out.push("stock.changed");
      return out;
    }
    default:
      return [item.type];
  }
}

/** Los cambios que le interesan a un webhook según los eventos a los que se suscribió. */
export function itemsFor(subscribed: readonly string[], items: ChangeItem[]): (ChangeItem & { events: CatalogApiWebhookEvent[] })[] {
  const wanted = new Set(subscribed);
  return items
    .map((item) => ({ ...item, events: eventsOf(item) }))
    .filter((item) => item.events.some((e) => wanted.has(e)));
}
