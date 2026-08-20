"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import PrefsPanel from "@/components/PrefsPanel";
import {
  ALL_PROVIDERS, IMPLEMENTED_PROVIDERS, Provider, ProductDTO, ProviderStatus, ProviderConfig,
  MissingProductAction, ZeroStockAction, providersApi, searchApi, credentialsApi
} from "@/lib/api";
import { parsePrice, proxyImg } from "@/lib/format";
import { PROVIDER_TEXT_COLOR } from "@/lib/providerColors";
import { SKU_PREFIX } from "@/lib/providerMeta";
import NodoSpinner from "@/components/NodoSpinner";
import SyncProgressBar from "@/components/SyncProgressBar";
import {
  AlertTriangle, ArrowLeft, Boxes, CheckCircle2, Eye, EyeOff, ImageOff, KeyRound,
  Loader2, PackageCheck, Pencil, RefreshCw, Save, Search, Settings, Trash2, XCircle
} from "lucide-react";

const MISSING_ACTION_LABELS: Record<MissingProductAction, string> = {
  KEEP: "No hacer nada",
  OUT_OF_STOCK: "Marcar sin stock",
  HIDE: "Ocultar del catálogo",
  DELETE: "Eliminar de nuestra base",
};

const ZERO_STOCK_ACTION_LABELS: Record<ZeroStockAction, string> = {
  KEEP: "Mostrar igual",
  HIDE: "Ocultar del catálogo",
  DELETE: "Eliminar de nuestra base",
};

const INTERVAL_OPTIONS = [
  { minutes: 60, label: "Cada 1 hora" },
  { minutes: 120, label: "Cada 2 horas" },
  { minutes: 240, label: "Cada 4 horas" },
  { minutes: 360, label: "Cada 6 horas" },
  { minutes: 720, label: "Cada 12 horas" },
  { minutes: 1440, label: "Cada 24 horas" },
];

export default function ProviderDetailPage({ params }: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = use(params);
  const provider = raw.toUpperCase() as Provider;
  const valid = ALL_PROVIDERS.includes(provider);
  const implemented = IMPLEMENTED_PROVIDERS.includes(provider);

  const [tab, setTab] = useState<"credentials" | "sync" | "catalog" | "config">("sync");
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [credFields, setCredFields] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  const [showValues, setShowValues] = useState<Record<number, boolean>>({});
  const [loadingCred, setLoadingCred] = useState(true);
  const [savingCred, setSavingCred] = useState(false);
  const [deletingCred, setDeletingCred] = useState(false);
  const [credResult, setCredResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [hasCred, setHasCred] = useState(false);

  useEffect(() => {
    const initialTab = new URLSearchParams(window.location.search).get("tab");
    if (initialTab === "credentials" || initialTab === "sync" || initialTab === "config" || initialTab === "catalog") {
      setTab(initialTab);
    }
  }, []);

  async function loadCredential() {
    setLoadingCred(true);
    try {
      const res = await credentialsApi.getByProvider(provider);
      const parsed = typeof res.data.credentialsJson === "string" ? JSON.parse(res.data.credentialsJson) : res.data.credentialsJson;
      setCredFields(Object.entries(parsed).map(([key, value]) => ({ key, value: String(value) })));
      setHasCred(true);
    } catch {
      setCredFields([{ key: "", value: "" }]);
      setHasCred(false);
    } finally {
      setLoadingCred(false);
    }
  }

  async function handleSaveCredential(e: React.FormEvent) {
    e.preventDefault();
    setSavingCred(true);
    setCredResult(null);
    try {
      const creds: Record<string, string> = {};
      credFields.forEach(({ key, value }) => { if (key.trim()) creds[key.trim()] = value; });
      await credentialsApi.save(provider, creds);
      setCredResult({ ok: true, msg: "Credencial guardada" });
      setHasCred(true);
      await loadStatus();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setCredResult({ ok: false, msg: msg || "Error al guardar la credencial" });
    } finally {
      setSavingCred(false);
    }
  }

  async function handleDeleteCredential() {
    if (!window.confirm(`¿Eliminar la credencial de ${provider.replace(/_/g, " ")}?`)) return;
    setDeletingCred(true);
    try {
      await credentialsApi.delete(provider);
      setCredFields([{ key: "", value: "" }]);
      setHasCred(false);
      setCredResult({ ok: true, msg: "Credencial eliminada" });
      await loadStatus();
    } catch {
      setCredResult({ ok: false, msg: "Error al eliminar la credencial" });
    } finally {
      setDeletingCred(false);
    }
  }

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductDTO[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  const [clearingZeroStock, setClearingZeroStock] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [dangerResult, setDangerResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function loadConfig() {
    if (!implemented) return;
    setLoadingConfig(true);
    try {
      const res = await providersApi.getConfig(provider);
      setConfig(res.data);
    } catch {
      setConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSavingConfig(true);
    setConfigSaved(false);
    try {
      const res = await providersApi.updateConfig(provider, {
        enabled: config.enabled,
        syncIntervalMinutes: config.syncIntervalMinutes,
        missingProductAction: config.missingProductAction,
        zeroStockAction: config.zeroStockAction,
        priceMarkupPercent: Number(config.priceMarkupPercent) || 0,
        minStockThreshold: Number(config.minStockThreshold) || 0,
      });
      setConfig(res.data);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleClearZeroStock() {
    if (!window.confirm(`¿Borrar ya mismo todos los productos de ${provider.replace(/_/g, " ")} con stock 0? Esta acción no se puede deshacer.`)) return;
    setClearingZeroStock(true);
    setDangerResult(null);
    try {
      const res = await providersApi.clearZeroStock(provider);
      setDangerResult({ ok: true, msg: `${res.data.deleted.toLocaleString("es-AR")} productos sin stock eliminados` });
      await loadStatus();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDangerResult({ ok: false, msg: msg || "Error al limpiar sin stock" });
    } finally {
      setClearingZeroStock(false);
    }
  }

  async function handleDeleteAllProducts() {
    if (!window.confirm(`¿Eliminar TODOS los productos de ${provider.replace(/_/g, " ")} de nuestra base? Esta acción no se puede deshacer. Vas a tener que sincronizar de nuevo para recuperarlos.`)) return;
    setDeletingAll(true);
    setDangerResult(null);
    try {
      const res = await providersApi.deleteAllProducts(provider);
      setDangerResult({ ok: true, msg: `${res.data.deleted.toLocaleString("es-AR")} productos eliminados del catálogo` });
      await loadStatus();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDangerResult({ ok: false, msg: msg || "Error al eliminar productos" });
    } finally {
      setDeletingAll(false);
    }
  }

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

  useEffect(() => { loadStatus(); loadConfig(); loadCredential(); }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

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
                      <button onClick={() => setTab("credentials")} className="flex items-center gap-1.5 text-sm font-semibold text-surface-400 hover:text-white mt-1 transition-colors">
                        <KeyRound className="w-4 h-4" /> Configurar
                      </button>
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
                    { key: "credentials" as const, label: "Credenciales" },
                    { key: "sync" as const, label: "Sincronización" },
                    { key: "config" as const, label: "Configuración" },
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

                {tab === "credentials" && (
                  <div className="max-w-xl flex flex-col gap-4">
                    <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
                      <p className="text-sm text-surface-400">
                        Credenciales de acceso a la API de {provider.replace(/_/g, " ")}. Se guardan cifradas y son
                        solo tuyas — cada usuario carga las suyas.
                      </p>
                      {loadingCred ? (
                        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
                      ) : (
                        <form onSubmit={handleSaveCredential} className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-surface-400">Campos</label>
                            <button type="button" onClick={() => setCredFields((prev) => [...prev, { key: "", value: "" }])} className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                              + Agregar campo
                            </button>
                          </div>
                          {credFields.map((field, i) => (
                            <div key={i} className="flex gap-2 items-center">
                              <input
                                placeholder="Clave"
                                value={field.key}
                                onChange={(e) => setCredFields((prev) => prev.map((f, idx) => idx === i ? { ...f, key: e.target.value } : f))}
                                className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500 font-mono"
                              />
                              <div className="relative flex-[1.5]">
                                <input
                                  placeholder="Valor"
                                  type={showValues[i] ? "text" : "password"}
                                  value={field.value}
                                  onChange={(e) => setCredFields((prev) => prev.map((f, idx) => idx === i ? { ...f, value: e.target.value } : f))}
                                  className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 pr-8 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500 font-mono"
                                />
                                <button type="button" onClick={() => setShowValues((v) => ({ ...v, [i]: !v[i] }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                                  {showValues[i] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                              {credFields.length > 1 && (
                                <button type="button" onClick={() => setCredFields((prev) => prev.filter((_, idx) => idx !== i))} className="text-surface-600 hover:text-red-400 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          <div className="flex gap-2 pt-1">
                            <button type="submit" disabled={savingCred} className="flex-1 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg py-2.5 transition-all">
                              {savingCred ? <NodoSpinner className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                              {hasCred ? "Actualizar" : "Guardar"}
                            </button>
                            {hasCred && (
                              <button type="button" onClick={handleDeleteCredential} disabled={deletingCred} className="flex items-center justify-center gap-1.5 border border-red-500/25 text-red-400 hover:bg-red-500/10 disabled:opacity-40 text-sm font-medium rounded-lg px-4 transition-all">
                                {deletingCred ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </form>
                      )}
                      {credResult && (
                        <div className={`flex items-center gap-2 text-xs rounded-lg px-3.5 py-2.5 ${
                          credResult.ok
                            ? "bg-emerald-500/8 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                            : "bg-red-500/8 border border-red-500/20 text-red-400"
                        }`}>
                          {credResult.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
                          {credResult.msg}
                        </div>
                      )}
                    </div>
                  </div>
                )}

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
                          Necesitás <button type="button" onClick={() => setTab("credentials")} className="underline font-medium">configurar la credencial</button> antes de sincronizar.
                        </div>
                      )}
                      <button
                        onClick={handleSync}
                        disabled={syncing || !status?.hasCredentials}
                        className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg py-2.5 transition-all"
                      >
                        {syncing ? <NodoSpinner className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                        {syncing ? "Sincronizando..." : "Sincronizar ahora"}
                      </button>
                      {syncing && <SyncProgressBar />}
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

                {tab === "config" && (
                  <div className="max-w-xl">
                    {loadingConfig || !config ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
                      </div>
                    ) : (
                      <form onSubmit={handleSaveConfig} className="flex flex-col gap-5">
                        <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-white">
                            <Settings className="w-4 h-4 text-brand-700 dark:text-brand-400" />
                            Sincronización automática
                          </div>

                          <div className="flex items-center justify-between bg-surface-800 rounded-lg px-3.5 py-3">
                            <div>
                              <p className="text-sm text-surface-200">Sincronización activa</p>
                              <p className="text-xs text-surface-500">Se sincroniza solo, según el intervalo, sin que apretés el botón.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                              className={`w-10 rounded-full relative transition-colors flex-shrink-0 ${config.enabled ? "bg-brand-600" : "bg-surface-600"}`}
                              style={{ height: 22 }}
                            >
                              <span className={`absolute top-0.5 bg-white rounded-full transition-all ${config.enabled ? "left-[22px]" : "left-0.5"}`} style={{ width: 18, height: 18 }} />
                            </button>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-surface-400 mb-1.5">Intervalo de sincronización</label>
                            <select
                              value={config.syncIntervalMinutes}
                              onChange={(e) => setConfig({ ...config, syncIntervalMinutes: Number(e.target.value) })}
                              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500 transition-all"
                            >
                              {INTERVAL_OPTIONS.map((o) => (
                                <option key={o.minutes} value={o.minutes}>{o.label}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-surface-400 mb-1.5">Prefijo de SKU</label>
                            <input
                              disabled
                              value={SKU_PREFIX[provider] ?? "—"}
                              className="w-full bg-surface-800/50 border border-surface-800 rounded-lg px-3.5 py-2.5 text-sm text-surface-500 font-mono cursor-not-allowed"
                            />
                            <p className="text-[11px] text-surface-500 mt-1">Fijo del proveedor, no editable.</p>
                          </div>
                        </div>

                        <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
                          <div className="text-sm font-semibold text-white">Precio</div>
                          <div>
                            <label className="block text-xs font-medium text-surface-400 mb-1.5">Markup sobre el precio del proveedor (%)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={config.priceMarkupPercent}
                              onChange={(e) => setConfig({ ...config, priceMarkupPercent: e.target.value })}
                              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500 transition-all"
                            />
                            <p className="text-[11px] text-surface-500 mt-1">Se aplica al guardar cada producto. Ej: 10 = precio del proveedor + 10%.</p>
                          </div>
                        </div>

                        <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
                          <div className="text-sm font-semibold text-white">Manejo de stock y catálogo</div>
                          <div>
                            <label className="block text-xs font-medium text-surface-400 mb-1.5">Stock mínimo del proveedor</label>
                            <input
                              type="number"
                              min={0}
                              step="1"
                              value={config.minStockThreshold}
                              onChange={(e) => setConfig({ ...config, minStockThreshold: Number(e.target.value) })}
                              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500 transition-all"
                            />
                            <p className="text-[11px] text-surface-500 mt-1">
                              Si el proveedor informa esta cantidad o menos, lo tratamos como sin stock (stock 0). Ej: 0 = usar el stock tal cual lo informa.
                            </p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-surface-400 mb-1.5">Producto con stock 0 en la última sync</label>
                            <select
                              value={config.zeroStockAction}
                              onChange={(e) => setConfig({ ...config, zeroStockAction: e.target.value as ZeroStockAction })}
                              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500 transition-all"
                            >
                              {(Object.keys(ZERO_STOCK_ACTION_LABELS) as ZeroStockAction[]).map((k) => (
                                <option key={k} value={k}>{ZERO_STOCK_ACTION_LABELS[k]}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-surface-400 mb-1.5">Producto que dejó de venir en la última sync</label>
                            <select
                              value={config.missingProductAction}
                              onChange={(e) => setConfig({ ...config, missingProductAction: e.target.value as MissingProductAction })}
                              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500 transition-all"
                            >
                              {(Object.keys(MISSING_ACTION_LABELS) as MissingProductAction[]).map((k) => (
                                <option key={k} value={k}>{MISSING_ACTION_LABELS[k]}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {config.lastSyncError && (
                          <div className="flex items-start gap-2.5 bg-red-500/8 border border-red-500/20 text-red-400 text-xs rounded-lg px-3.5 py-2.5">
                            <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            Último error de sincronización: {config.lastSyncError}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={savingConfig}
                          className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg py-2.5 transition-all"
                        >
                          {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          {savingConfig ? "Guardando..." : "Guardar configuración"}
                        </button>
                        {configSaved && (
                          <div className="flex items-center gap-2 text-xs rounded-lg px-3.5 py-2.5 bg-emerald-500/8 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Configuración guardada
                          </div>
                        )}
                      </form>
                    )}

                    {!loadingConfig && config && (
                      <div className="border border-red-500/20 rounded-xl p-5 flex flex-col gap-4 mt-5">
                        <div className="flex items-center gap-2 text-sm font-semibold text-red-400">
                          <AlertTriangle className="w-4 h-4" />
                          Zona de peligro
                        </div>
                        <p className="text-xs text-surface-500">
                          Acciones inmediatas sobre nuestra base para {provider.replace(/_/g, " ")}, sin esperar a la próxima sincronización. No se pueden deshacer.
                        </p>

                        <div className="flex items-center justify-between gap-3 bg-surface-800 rounded-lg px-3.5 py-3">
                          <div>
                            <p className="text-sm text-surface-200">Limpiar sin stock</p>
                            <p className="text-xs text-surface-500">Borra ya los productos con stock 0 de {provider.replace(/_/g, " ")}.</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleClearZeroStock}
                            disabled={clearingZeroStock}
                            className="flex items-center gap-1.5 flex-shrink-0 bg-surface-700 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-40 text-surface-200 text-xs font-semibold rounded-lg px-3 py-2 transition-all"
                          >
                            {clearingZeroStock ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            Limpiar
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-3 bg-surface-800 rounded-lg px-3.5 py-3">
                          <div>
                            <p className="text-sm text-surface-200">Eliminar todo el catálogo</p>
                            <p className="text-xs text-surface-500">Borra los {(status?.total ?? 0).toLocaleString("es-AR")} productos de {provider.replace(/_/g, " ")} de nuestra base.</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleDeleteAllProducts}
                            disabled={deletingAll}
                            className="flex items-center gap-1.5 flex-shrink-0 bg-red-500/10 hover:bg-red-500/25 text-red-400 disabled:opacity-40 text-xs font-semibold rounded-lg px-3 py-2 transition-all"
                          >
                            {deletingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            Eliminar todo
                          </button>
                        </div>

                        {dangerResult && (
                          <div className={`flex items-center gap-2 text-xs rounded-lg px-3.5 py-2.5 ${
                            dangerResult.ok
                              ? "bg-emerald-500/8 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                              : "bg-red-500/8 border border-red-500/20 text-red-400"
                          }`}>
                            {dangerResult.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
                            {dangerResult.msg}
                          </div>
                        )}
                      </div>
                    )}
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
