"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import NodoSpinner from "@/components/NodoSpinner";
import SyncProgressBar from "@/components/SyncProgressBar";
import RedeemAccessCode from "@/components/RedeemAccessCode";
import LocalPurchaseDashboard from "@/components/insights/LocalPurchaseDashboard";
import {
  invalidateMyProviders, loadMyProviders, Provider, providersApi, ProviderStatus,
  canSyncProvider, type VisibleProvider
} from "@/lib/api";
import ProviderBadge from "@/components/ProviderBadge";
import { useIsRetailer } from "@/lib/purchase";
import { providerHasIvaRate } from "@/lib/purchase-pricing";
import { Boxes, CheckCircle2, Clock, KeyRound, Loader2, MessageSquare, RefreshCw, Settings, Sparkles, StickyNote, XCircle } from "lucide-react";

type StatusMap = Partial<Record<string, ProviderStatus>>;

export default function ProveedoresPage() {
  const retailer = useIsRetailer();
  const [visible, setVisible] = useState<VisibleProvider[]>([]);
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Provider | null>(null);
  const [syncResult, setSyncResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const load = useCallback(async (force = false) => {
    if (force) invalidateMyProviders();
    const mine = await loadMyProviders(force);
    setVisible(mine);

    const linked = mine.filter((p) => p.linked).map((p) => p.provider);
    const results = await Promise.allSettled(linked.map((p) => providersApi.status(p)));
    const map: StatusMap = {};
    results.forEach((r, i) => {
      if (r.status === "fulfilled") map[linked[i]] = r.value.data;
    });
    setStatuses(map);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSync(provider: Provider, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSyncing(provider);
    setSyncResult((prev) => ({ ...prev, [provider]: undefined as unknown as { ok: boolean; msg: string } }));
    try {
      const res = await providersApi.sync(provider);
      setSyncResult((prev) => ({ ...prev, [provider]: { ok: true, msg: `${res.data.synced.toLocaleString("es-AR")} productos` } }));
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setSyncResult((prev) => ({ ...prev, [provider]: { ok: false, msg: msg || "Error al sincronizar" } }));
    } finally {
      setSyncing(null);
    }
  }

  const linked = visible.filter((p) => p.linked);
  const advertised = visible.filter((p) => !p.linked);

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Dashboard de Proveedores</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            Compras, marcas y catálogo de este comercio — las cuentas no se mezclan con otros locales
          </p>
        </div>
        <PrefsPanel />
      </header>

      <div className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-8">
              <LocalPurchaseDashboard />
              {retailer && (
                <div className="border border-amber-500/30 bg-amber-500/10 rounded-xl px-4 py-3 text-sm text-amber-100">
                  <span className="font-semibold">Pedido offline y esquema</span>
                  <span className="block text-xs text-amber-200/80 mt-0.5">
                    Entrá a un distribuidor que informe IVA (New Bytes, Elit, Grupo Núcleo, Air, Invid o Diapstore) → pestaña Configuración. Activá los checks y elegí el IVA. Ceven y el resto no habilitan esto.
                  </span>
                </div>
              )}
              <section>
                <h2 className="text-xs font-semibold text-surface-400 uppercase tracking-widest mb-3">
                  Tus proveedores — {linked.length}
                </h2>
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
                  </div>
                ) : linked.length === 0 ? (
                  <div className="border border-surface-800 rounded-xl p-8 text-center flex flex-col gap-2">
                    <p className="text-sm text-surface-300">Todavía no estás conectado con ningún proveedor.</p>
                    <p className="text-xs text-surface-500">
                      Pedile un código de acceso al distribuidor con el que ya trabajás y canjealo acá abajo.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {linked.map(({ provider, name, accountManager, linkId }) => {
                      const s = statuses[provider];
                      const result = syncResult[provider];
                      const isSyncing = syncing === provider;
                      return (
                        <div
                          key={provider}
                          className="bg-surface-900 border border-surface-800 hover:border-surface-600 rounded-xl p-4 transition-all flex flex-col gap-3"
                        >
                          <Link href={`/proveedores/${provider}`} className="flex items-center justify-between gap-3">
                            <ProviderBadge provider={provider} label={name} variant="inline" size="md" />
                            {s?.hasCredentials ? (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" /> Configurado
                              </span>
                            ) : s?.publicCatalog ? (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-sky-400">
                                <CheckCircle2 className="w-3 h-3" /> Catálogo público
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-surface-500">
                                <KeyRound className="w-3 h-3" /> Sin credencial
                              </span>
                            )}
                          </Link>

                          <Link href={`/proveedores/${provider}`} className="flex items-center gap-4 text-xs text-surface-400">
                            <span className="flex items-center gap-1.5">
                              <Boxes className="w-3.5 h-3.5 text-surface-600" />
                              {(s?.total ?? 0).toLocaleString("es-AR")} productos
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-surface-600" />
                              {s?.lastSyncedAt ? relativeTime(s.lastSyncedAt) : "nunca sincronizado"}
                            </span>
                          </Link>

                          {accountManager && (
                            <p className="text-[11px] text-surface-500 -mt-1">
                              Tu vendedor: {accountManager.name} · {accountManager.email}
                            </p>
                          )}

                          <div className="flex items-center gap-2 pt-1 border-t border-surface-800 mt-1">
                            {linkId && (
                              <Link
                                href={`/mensajes?linkId=${linkId}`}
                                className="flex items-center justify-center gap-1 text-xs font-medium border border-brand-500/40 hover:border-brand-400 text-brand-200 hover:text-white rounded-lg px-2.5 py-1.5 transition-all"
                                title={accountManager ? `Hablar con ${accountManager.name}` : "Hablar con el vendedor asignado"}
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Hablar
                              </Link>
                            )}
                            <Link
                              href={`/proveedores/${provider}?tab=${canSyncProvider(s) ? "sync" : "credentials"}`}
                              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-surface-700 hover:border-surface-500 text-surface-300 hover:text-white rounded-lg py-1.5 transition-all"
                            >
                              {s?.hasCredentials ? <Settings className="w-3.5 h-3.5" /> : <KeyRound className="w-3.5 h-3.5" />}
                              {s?.hasCredentials ? "Configurar" : s?.publicCatalog ? "Sincronizar" : "Cargar cuenta"}
                            </Link>
                            {retailer && providerHasIvaRate(provider) && (
                              <Link
                                href={`/proveedores/${provider}?tab=config`}
                                className="flex items-center justify-center gap-1 text-xs font-medium border border-amber-500/40 hover:border-amber-400 text-amber-200 hover:text-white rounded-lg px-2.5 py-1.5 transition-all"
                                title="Pedido offline y esquema"
                              >
                                <StickyNote className="w-3.5 h-3.5" />
                              </Link>
                            )}
                            <button
                              onClick={(e) => handleSync(provider, e)}
                              disabled={isSyncing || !canSyncProvider(s)}
                              title={!canSyncProvider(s) ? "Configurá la credencial primero" : undefined}
                              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-lg py-1.5 transition-all"
                            >
                              {isSyncing ? <NodoSpinner className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
                              {isSyncing ? "Sincronizando" : "Sincronizar"}
                            </button>
                          </div>

                          {isSyncing && <SyncProgressBar />}

                          {result && !isSyncing && (
                            <div className={`flex items-center gap-1.5 text-[11px] rounded-md px-2.5 py-1.5 ${
                              result.ok
                                ? "bg-emerald-500/8 text-emerald-700 dark:text-emerald-400"
                                : "bg-red-500/8 text-red-400"
                            }`}>
                              {result.ok ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <XCircle className="w-3 h-3 flex-shrink-0" />}
                              {result.msg}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {advertised.length > 0 && (
                <section>
                  <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-widest mb-3">
                    Podés conectarte — {advertised.length}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {advertised.map(({ provider, name }) => (
                      <Link
                        key={provider}
                        href={`/proveedores/${provider}?tab=credentials`}
                        className="bg-surface-900 border border-surface-800 hover:border-surface-600 rounded-xl p-4 flex items-center justify-between gap-3 transition-all"
                      >
                        <ProviderBadge provider={provider} label={name} variant="inline" size="md" />
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400">
                          <Sparkles className="w-3 h-3" /> Cargá tu cuenta
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-widest mb-3">
                  Conectar con un código
                </h2>
                <RedeemAccessCode onRedeemed={() => load(true)} />
              </section>
            </div>
          </div>
    </>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}
