"use client";

import { ArrowRightLeft, X } from "lucide-react";
import type { PortalSyncNotice as Notice } from "@/lib/portalCartSync";

/** Aviso de lo que se trajo del portal del distribuidor al carrito de NODO. */
export default function PortalSyncNotice({
  providerLabel,
  notice,
  onDismiss,
}: {
  providerLabel: string;
  notice: Notice;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-surface-300">
      <ArrowRightLeft className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-sky-400" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-surface-200">Carrito sincronizado con el portal de {providerLabel}</p>
        {notice.lines.length > 0 && (
          <ul className="mt-1 space-y-0.5 list-disc pl-4">
            {notice.lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
        )}
        {notice.missing.length > 0 && (
          <p className="mt-1 text-amber-400/90">
            En el portal hay productos que no están en el catálogo de NODO y no se pudieron traer:{" "}
            {notice.missing.map((m) => (m.name ? `${m.name} (${m.code})` : m.code)).join(", ")}. Siguen en el portal.
          </p>
        )}
      </div>
      <button type="button" onClick={onDismiss} className="text-surface-500 hover:text-white" aria-label="Cerrar">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
