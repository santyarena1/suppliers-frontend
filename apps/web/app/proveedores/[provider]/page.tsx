"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import PrefsPanel from "@/components/PrefsPanel";
import { ALL_PROVIDERS, IMPLEMENTED_PROVIDERS, Provider, ProductDTO, ProviderStatus, providersApi, searchApi } from "@/lib/api";
import { parsePrice, proxyImg } from "@/lib/format";
import { PROVIDER_TEXT_COLOR } from "@/lib/providerColors";
import {
  ArrowLeft, Boxes, CheckCircle2, ImageOff, KeyRound,
  Loader2, PackageCheck, RefreshCw, Search, XCircle
} from "lucide-react";

export default function ProviderDetailPage({ params }: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = use(params);
  const provider = raw.toUpperCase() as Provider;
  const valid = ALL_PROVIDERS.includes(provider);
  const implemented = IMPLEMENTED_PROVIDERS.includes(provider);

  const [tab, setTab] = useState<"sync" | "catalog">("sync");
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductDTO[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  async function loadStatus() {
    if (!implemented) return;
    setLoadingStatus(true);
    try {
      const res = await providersApi.status(provider);
      setStatus(res.data);
    } catch {
      setStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  }

  useEffect(() => { loadStatus(); }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await providersApi.sync(provider);
      setSyncResult({ ok: true, msg: `Sincronización completa: ${res.data.synced.toLocaleString("es-AR")} productos` });
      await loadStatus();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setSyncResult({ ok: false, msg: msg || "Error al sincronizar" });
    } finally {
      setSyncing(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setSearched(true);
    try {
      const res = await searchApi.byProvider(provider, query);
      setResults(Array.isArray(res.data) ? res.data : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  if (!valid) {
    return (
      <AuthGuard>
        <div className="flex h-screen overflow-hidden">
          <Navbar />
          <div className="flex-1 flex items-center justify-center text-surface-500 text-sm">
            Proveedor inválido.
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Navbar />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0 pt-12 lg:pt-0">
          <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/proveedores" className="text-surface-500 hover:text-white transition-colors flex-shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="min-w-0">
                <h1 className={`text-base font-bold truncate ${PROVIDER_TEXT_COLOR[provider] || "text-white"}`}>
                  {provider.replace(/_/g, " ")}
                </h1>
                <p className="text-xs text-surface-500 hidden sm:block">
                  {implemented ? "Sincronización con catálogo propio" : "Sin integración real todavía"}
                </p>
              </div>
            </div>
            <PrefsPanel />
          </header>

          {!implemented ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
              <Boxes className="w-8 h-8 text-surface-700" />
              <p className="text-sm text-surface-400 max-w-sm">
                {provider.replace(/_/g, " ")} todavía no tiene integración real construida. Va a
                sumarse más adelante, uno por uno, con datos reales.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard label="En catálogo" value={status?.total} icon={Boxes} loading={loadingStatus} />
                  <StatCard label="Con stock" value={status?.withStock} icon={PackageCheck} loading={loadingStatus} accent="emerald" />
                  <div className="bg-surface-900 border border-surface-800 rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Credencial</span>
                    {loadingStatus ? (
                      <Loader2 className="w-4 h-4 animate-spin text-surface-600 mt-2" />
                    ) : status?.hasCredentials ? (
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400 mt-1">
                        <CheckCircle2 className="w-4 h-4" /> Configurada
                      </span>
                    ) : (
                      <Link href="/credentials" className="flex items-center gap-1.5 text-sm font-semibold text-surface-400 hover:text-white mt-1 transition-colors">
                        <KeyRound className="w-4 h-4" /> Configurar
                      </Link>
                    )}
                  </div>
                  <div className="bg-surface-900 border border-surface-800 rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Última sync</span>
                    <span className="text-sm font-semibold text-white mt-1">
                      {status?.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </span>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-surface-800">
                  {[
                    { key: "sync" as const, label: "Sincronización" },
                    { key: "catalog" as const, label: "Catálogo" },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setTab(key)}
                      className={`text-sm font-medium px-4 py-2.5 border-b-2 -mb-px transition-all ${
                        tab === key ? "border-brand-500 text-brand-700 dark:text-brand-400" : "border-transparent text-surface-500 hover:text-surface-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {tab === "sync" && (
                  <div className="max-w-xl flex flex-col gap-4">
                    <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
                      <p className="text-sm text-surface-400">
                        Trae el catálogo completo de {provider.replace(/_/g, " ")} y lo guarda en nuestra base.
                        Las búsquedas de los usuarios consultan esta base, no la API del proveedor en vivo.
                      </p>
                      {!status?.hasCredentials && (
                        <div className="flex items-start gap-2.5 bg-amber-500/8 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs rounded-lg px-3.5 py-2.5">
                          <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          Necesitás <Link href="/credentials" className="underline font-medium">configurar la credencial</Link> antes de sincronizar.
                        </div>
                      )}
                      <button
                        onClick={handleSync}
                        disabled={syncing || !status?.hasCredentials}
                        className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg py-2.5 transition-all"
                      >
                        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        {syncing ? "Sincronizando..." : "Sincronizar ahora"}
                      </button>
                      {syncResult && (
                        <div className={`flex items-center gap-2 text-xs rounded-lg px-3.5 py-2.5 ${
                          syncResult.ok
                            ? "bg-emerald-500/8 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                            : "bg-red-500/8 border border-red-500/20 text-red-400"
                        }`}>
                          {syncResult.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
                          {syncResult.msg}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tab === "catalog" && (
                  <div className="flex flex-col gap-4">
                    <form onSubmit={handleSearch} className="flex gap-2 max-w-xl">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Buscar en el catálogo sincronizado..."
                          className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500 transition-all"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={searching}
                        className="bg-surface-700 hover:bg-surface-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 transition-all"
                      >
                        {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
                      </button>
                    </form>

                    {searched && !searching && (
                      <p className="text-xs text-surface-500">{results.length} resultado{results.length !== 1 ? "s" : ""}</p>
                    )}

                    <div className="border border-surface-800 rounded-xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-surface-900 text-[10px] uppercase tracking-wider text-surface-500">
                              <th className="text-left font-semibold px-3 py-2.5 w-12"></th>
                              <th className="text-left font-semibold px-3 py-2.5">Producto</th>
                              <th className="text-left font-semibold px-3 py-2.5">Marca</th>
                              <th className="text-left font-semibold px-3 py-2.5">Categoría</th>
                              <th className="text-right font-semibold px-3 py-2.5">Precio</th>
                              <th className="text-right font-semibold px-3 py-2.5">Stock</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-800">
                            {results.map((p) => (
                              <tr key={`${p.provider}-${p.externalId}`} className="hover:bg-surface-900/60 transition-colors">
                                <td className="px-3 py-2">
                                  <div className="w-8 h-8 rounded-md bg-surface-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                                    {p.imageUrl ? (
                                      <Image src={proxyImg(p.imageUrl)} alt="" width={32} height={32} className="object-contain w-full h-full" unoptimized />
                                    ) : (
                                      <ImageOff className="w-3.5 h-3.5 text-surface-600" />
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-surface-200 max-w-xs truncate">{p.name}</td>
                                <td className="px-3 py-2 text-surface-400">{p.brand || "—"}</td>
                                <td className="px-3 py-2 text-surface-400">{p.category || "—"}</td>
                                <td className="px-3 py-2 text-right text-surface-200 tabular-nums">
                                  {p.currency ?? "USD"} {parsePrice(p.price).toLocaleString("es-AR", { maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  <span className={p.stock && p.stock > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-surface-600"}>
                                    {p.stock ?? "—"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {searched && !searching && results.length === 0 && (
                        <p className="text-center text-xs text-surface-500 py-10">Sin resultados.</p>
                      )}
                      {!searched && (
                        <p className="text-center text-xs text-surface-500 py-10">Buscá algo para ver el catálogo sincronizado.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}

function StatCard({ label, value, icon: Icon, loading, accent }: {
  label: string; value: number | undefined; icon: React.ElementType; loading: boolean; accent?: "emerald";
}) {
  return (
    <div className="bg-surface-900 border border-surface-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${accent === "emerald" ? "text-emerald-700 dark:text-emerald-400" : "text-surface-500"}`} />
        <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-surface-600" />
      ) : (
        <span className="text-xl font-bold text-white tabular-nums">{(value ?? 0).toLocaleString("es-AR")}</span>
      )}
    </div>
  );
}
