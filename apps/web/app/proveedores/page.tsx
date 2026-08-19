"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import PrefsPanel from "@/components/PrefsPanel";
import { ALL_PROVIDERS, IMPLEMENTED_PROVIDERS, providersApi, ProviderStatus } from "@/lib/api";
import { PROVIDER_TEXT_COLOR } from "@/lib/providerColors";
import { Boxes, CheckCircle2, Clock, KeyRound, Loader2 } from "lucide-react";

type StatusMap = Partial<Record<string, ProviderStatus>>;

export default function ProveedoresPage() {
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(IMPLEMENTED_PROVIDERS.map((p) => providersApi.status(p))).then((results) => {
      if (cancelled) return;
      const map: StatusMap = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") map[IMPLEMENTED_PROVIDERS[i]] = r.value.data;
      });
      setStatuses(map);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const pending = ALL_PROVIDERS.filter((p) => !IMPLEMENTED_PROVIDERS.includes(p));

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Navbar />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0 pt-12 lg:pt-0">
          <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold text-white">Proveedores</h1>
              <p className="text-xs text-surface-500 hidden sm:block">
                Sincronización de catálogos completos a nuestra base
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
                      return (
                        <Link
                          key={provider}
                          href={`/proveedores/${provider}`}
                          className="bg-surface-900 border border-surface-800 hover:border-surface-600 rounded-xl p-4 transition-all flex flex-col gap-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-bold ${PROVIDER_TEXT_COLOR[provider] || "text-surface-200"}`}>
                              {provider.replace(/_/g, " ")}
                            </span>
                            {s?.hasCredentials ? (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" /> Configurado
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-surface-500">
                                <KeyRound className="w-3 h-3" /> Sin credencial
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-surface-400">
                            <span className="flex items-center gap-1.5">
                              <Boxes className="w-3.5 h-3.5 text-surface-600" />
                              {(s?.total ?? 0).toLocaleString("es-AR")} productos
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-surface-600" />
                              {s?.lastSyncedAt ? relativeTime(s.lastSyncedAt) : "nunca sincronizado"}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-widest mb-3">
                  Próximamente — {pending.length}
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
        </div>
      </div>
    </AuthGuard>
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
