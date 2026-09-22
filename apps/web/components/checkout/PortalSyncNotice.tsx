"use client";

import { ArrowRightLeft, X } from "lucide-react";
import type { PortalPendingLine, PortalSyncNotice as Notice } from "@/lib/portalCartSync";

/** Aviso de la unificación con el carrito del distribuidor. Lo pendiente se deja o se saca. */
export default function PortalSyncNotice({
  providerLabel,
  notice,
  busyCode,
  onKeep,
  onDrop,
  onDismiss,
}: {
  providerLabel: string;
  notice: Notice;
  busyCode?: string | null;
  onKeep: (item: PortalPendingLine) => void;
  onDrop: (item: PortalPendingLine) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-surface-300">
      <ArrowRightLeft className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-sky-400" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-surface-200">Carrito unificado con {providerLabel}</p>
        {notice.lines.length > 0 && (
          <ul className="mt-1 space-y-0.5 list-disc pl-4">
            {notice.lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
        {notice.pending.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <p className="text-surface-200">
              Esto ya estaba en el carrito de {providerLabel}. Sigue ahí y entra en la cotización hasta que decidas.
            </p>
            {notice.pending.map((item) => {
              const label = item.name ? `${item.name} (${item.code})` : item.code;
              const busy = busyCode === item.code;
              return (
                <div key={item.code} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0">{label} · {item.qty} u.</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onKeep(item)}
                    className="h-6 px-2 rounded-sm border border-surface-600 text-surface-100 hover:bg-white/10 disabled:opacity-50"
                  >
                    Dejar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDrop(item)}
                    className="h-6 px-2 rounded-sm border border-surface-600 text-surface-100 hover:bg-white/10 disabled:opacity-50"
                  >
                    Sacar
                  </button>
                  {item.error && <span className="text-amber-400/90">{item.error}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {notice.pending.length === 0 && (
        <button type="button" onClick={onDismiss} className="text-surface-500 hover:text-white" aria-label="Cerrar">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
