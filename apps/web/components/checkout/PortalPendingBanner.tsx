"use client";

import PortalSyncNotice from "@/components/checkout/PortalSyncNotice";
import { providerLabel } from "@/components/ProviderBadge";
import { usePortalPending } from "@/lib/portalCartSync";

/**
 * Productos que están en el carrito del portal del distribuidor y no en NODO.
 * El portal los suma en su cotización, así que el total no cierra con NODO:
 * se avisa con nombre y se resuelve acá (traer a NODO o sacar del portal),
 * en cualquier pestaña del carrito.
 */
export default function PortalPendingBanner({ providers }: { providers?: string[] }) {
  const pendingByProvider = usePortalPending();
  const entries = Object.entries(pendingByProvider).filter(
    ([provider, entry]) => entry.pending.length > 0 && (!providers || providers.includes(provider))
  );
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {entries.map(([provider, entry]) => (
        <PortalSyncNotice
          key={provider}
          providerLabel={providerLabel(provider)}
          notice={{ lines: [], pending: entry.pending }}
          busyCode={entry.busyCode}
          onKeep={entry.keep}
          onDrop={entry.drop}
          onDismiss={() => undefined}
        />
      ))}
    </div>
  );
}
