"use client";

import { AlertTriangle, Clock, KeyRound, Loader2, PauseCircle, RefreshCw } from "lucide-react";

/** `health` de GET /providers/:p/status (solo proveedores por API). */
export interface SyncHealth {
  lastOkAt: string | null;
  lastAttemptAt: string | null;
  failing: boolean;
  consecutiveFailures: number;
  failureReason: string | null;
  paused: boolean;
  pausedAt: string | null;
  pauseReason: string | null;
  autoSync: boolean;
  stalePrices: boolean;
}

interface SyncHealthBannerProps {
  health: SyncHealth | null | undefined;
  providerName: string;
  syncing: boolean;
  canManage: boolean;
  onSync: () => void;
  onOpenAccount: () => void;
  onOpenSyncSettings: () => void;
}

/** "hace 3 h", "hace 2 días". */
function ago(iso: string | null): string {
  if (!iso) return "hace un tiempo";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

/**
 * Lo que el comercio tiene que saber de la sincronización de un proveedor, en una
 * franja: pausada, fallando o con precios viejos. Si está todo bien no muestra nada.
 */
export default function SyncHealthBanner({
  health,
  providerName,
  syncing,
  canManage,
  onSync,
  onOpenAccount,
  onOpenSyncSettings,
}: SyncHealthBannerProps) {
  if (!health || (!health.paused && !health.failing && !health.stalePrices)) return null;

  const pricesFrom = health.lastOkAt ? `Los precios que ves son de ${ago(health.lastOkAt)}.` : "Todavía no hay precios de una sincronización buena.";
  const tone = health.paused || health.failing ? "red" : "amber";
  const box =
    tone === "red"
      ? "border-red-500/30 bg-red-500/[0.07]"
      : "border-amber-500/30 bg-amber-500/[0.07]";
  const iconTone = tone === "red" ? "text-red-400" : "text-amber-300";

  let Icon = Clock;
  let title: string;
  let body: string;
  if (health.paused) {
    Icon = PauseCircle;
    title = `Sync pausado por error de ${providerName}`;
    body = `${health.pauseReason ?? "Falló varias veces seguidas."} Cuando se restablezca, continúa solo. ${pricesFrom}`;
  } else if (health.failing) {
    Icon = AlertTriangle;
    title = "La última sincronización falló";
    body = `${health.failureReason ?? "El proveedor no respondió bien."} ${pricesFrom} Se reintenta sola cada vez más espaciado.`;
  } else {
    title = `Precios de ${ago(health.lastOkAt)}`;
    body = health.autoSync
      ? "La sincronización automática viene atrasada. Podés sincronizar ahora."
      : "La sincronización automática está apagada: los precios no se actualizan solos.";
  }

  return (
    <div role="status" className={`rounded-xl border ${box} p-4 flex flex-col sm:flex-row sm:items-center gap-3`}>
      <Icon className={`w-5 h-5 flex-shrink-0 ${iconTone}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-surface-300 mt-0.5 leading-relaxed">{body}</p>
      </div>
      {canManage && (
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          {(health.paused || health.failing) && (
            <button
              type="button"
              onClick={onOpenAccount}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-surface-600 text-xs font-medium text-surface-200 hover:text-white hover:border-surface-400 transition-colors active:scale-[0.98]"
            >
              <KeyRound className="w-3.5 h-3.5" /> Revisar mi cuenta
            </button>
          )}
          {!health.paused && !health.failing && !health.autoSync && (
            <button
              type="button"
              onClick={onOpenSyncSettings}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-surface-600 text-xs font-medium text-surface-200 hover:text-white hover:border-surface-400 transition-colors active:scale-[0.98]"
            >
              Activar automática
            </button>
          )}
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors active:scale-[0.98]"
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {syncing ? "Sincronizando…" : "Sincronizar ahora"}
          </button>
        </div>
      )}
    </div>
  );
}
