"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import NodoSpinner from "@/components/NodoSpinner";
import SyncProgressBar from "@/components/SyncProgressBar";
import { ALL_PROVIDERS, IMPLEMENTED_PROVIDERS, Provider, providersApi, ProviderStatus, canSyncProvider } from "@/lib/api";
import { PROVIDER_TEXT_COLOR } from "@/lib/providerColors";
import { Boxes, CheckCircle2, Clock, KeyRound, Loader2, RefreshCw, Settings, XCircle } from "lucide-react";

type StatusMap = Partial<Record<string, ProviderStatus>>;

export default function ProveedoresPage() {
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Provider | null>(null);
  const [syncResult, setSyncResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  async function loadStatuses() {
    const results = await Promise.allSettled(IMPLEMENTED_PROVIDERS.map((p) => providersApi.status(p)));
    const map: StatusMap = {};
    results.forEach((r, i) => {
      if (r.status === "fulfilled") map[IMPLEMENTED_PROVIDERS[i]] = r.value.data;
    });
    setStatuses(map);
    setLoading(false);
  }

  useEffect(() => { loadStatuses(); }, []);

  async function handleSync(provider: Provider, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSyncing(provider);
    setSyncResult((prev) => ({ ...prev, [provider]: undefined as unknown as { ok: boolean; msg: string } }));
    try {
      const res = await providersApi.sync(provider);
      setSyncResult((prev) => ({ ...prev, [provider]: { ok: true, msg: `${res.data.synced.toLocaleString("es-AR")} productos` } }));
      await loadStatuses();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setSyncResult((prev) => ({ ...prev, [provider]: { ok: false, msg: msg || "Error al sincronizar" } }));
    } finally {
      setSyncing(null);
    }
  }

  const pending = ALL_PROVIDERS.filter((p) => !IMPLEMENTED_PROVIDERS.includes(p));

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Dashboard de Proveedores</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            Cada usuario carga su propia cuenta de cada proveedor — entrá a uno para conectar credenciales, sincronizar y ver el catálogo
          </p>
        </div>
        <PrefsPanel />
      </header>

      <div className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-8">
              <section>
                <h2 className="text-xs font-semibold text-surface-400 uppercase tracking-widest mb-3">
                  Integrados — {IMPLEMENTED_PROVIDERS.length}
                </h2>
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {IMPLEMENTED_PROVIDERS.map((provider) => {
                      const s = statuses[provider];
                      const result = syncResult[provider];
                      const isSyncing = syncing === provider;
                      return (
                        <div
                          key={provider}
                          className="bg-surface-900 border border-surface-800 hover:border-surface-600 rounded-xl p-4 transition-all flex flex-col gap-3"
                        >
                          <Link href={`/proveedores/${provider}`} className="flex items-center justify-between">
                            <span className={`text-sm font-bold ${PROVIDER_TEXT_COLOR[provider] || "text-surface-200"}`}>
                              {provider.replace(/_/g, " ")}
                            </span>
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

                          <div className="flex items-center gap-2 pt-1 border-t border-surface-800 mt-1">
                            <Link
                              href={`/proveedores/${provider}?tab=${canSyncProvider(s) ? "sync" : "credentials"}`}
                              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-surface-700 hover:border-surface-500 text-surface-300 hover:text-white rounded-lg py-1.5 transition-all"
                            >
                              {s?.hasCredentials ? <Settings className="w-3.5 h-3.5" /> : <KeyRound className="w-3.5 h-3.5" />}
                              {s?.hasCredentials ? "Configurar" : s?.publicCatalog ? "Sincronizar" : "Cargar cuenta"}
                            </Link>
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

              <section>
                <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-widest mb-3">
                  Conectar nuevo — {pending.length} disponibles
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
                  {pending.map((provider) => (
                    <div
                      key={provider}
                      title="Todavía no tiene integración real"
                      className="border border-surface-800 rounded-lg px-3 py-2.5 opacity-50 cursor-not-allowed"
                    >
                      <span className="text-[11px] font-bold text-surface-500 block truncate">
                        {provider.replace(/_/g, " ")}
                      </span>
                    </div>
                  ))}
                </div>
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
