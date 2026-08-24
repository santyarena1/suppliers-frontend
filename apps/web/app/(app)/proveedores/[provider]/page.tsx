"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import PrefsPanel from "@/components/PrefsPanel";
import {
  ALL_PROVIDERS, IMPLEMENTED_PROVIDERS, Provider, ProductDTO, ProviderStatus, ProviderConfig,
  MissingProductAction, ZeroStockAction, providersApi, searchApi, canSyncProvider,
  invidAccountApi, invidCheckoutApi, InvidOrder, InvidAccountMovement, InvidNodoDraft, InvidFileForm, uploadAuthedFile,
  TENANT_ROLES_CAN_PURGE_CATALOG, invalidateMyProviders
} from "@/lib/api";
import { getTenant, isAdmin } from "@/lib/auth";
import ProviderPurchaseConfig from "@/components/ProviderPurchaseConfig";
import { parsePrice, proxyImg } from "@/lib/format";
import { PROVIDER_TEXT_COLOR } from "@/lib/providerColors";
import { SKU_PREFIX } from "@/lib/providerMeta";
import NodoSpinner from "@/components/NodoSpinner";
import SyncProgressBar from "@/components/SyncProgressBar";
import NewBytesAccountPanel from "@/components/NewBytesAccountPanel";
import ElitAccountPanel from "@/components/ElitAccountPanel";
import GrupoNucleoAccountPanel from "@/components/GrupoNucleoAccountPanel";
import AirAccountPanel from "@/components/AirAccountPanel";
import AccountRowDetail, { VerMasButton } from "@/components/account/AccountRowDetail";
import { draftItems, draftLines } from "@/components/account/draftDetail";
import ProviderCredentialForm from "@/components/ProviderCredentialForm";
import {
  AlertTriangle, ArrowLeft, Boxes, CheckCircle2, FileSpreadsheet, ImageOff, KeyRound,
  Loader2, PackageCheck, Receipt, RefreshCw, Save, Search, Settings, Trash2, Wallet, XCircle
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

type ProviderTab = "credentials" | "sync" | "catalog" | "config" | "invid-account" | "nb-account" | "elit-account" | "gn-account" | "air-account";

const VALID_PROVIDER_TABS: ProviderTab[] = [
  "credentials", "sync", "config", "catalog", "invid-account", "nb-account", "elit-account", "gn-account", "air-account",
];

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

  const [tab, setTab] = useState<ProviderTab>("sync");
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const tabFromQuery = useRef(false);
  const autoTabDone = useRef(false);

  useEffect(() => {
    tabFromQuery.current = false;
    autoTabDone.current = false;
    const initialTab = new URLSearchParams(window.location.search).get("tab");
    if (VALID_PROVIDER_TABS.includes(initialTab as ProviderTab)) {
      setTab(initialTab as ProviderTab);
      tabFromQuery.current = true;
      if (initialTab === "invid-account") loadInvidAccount();
    }
  }, [provider]);

  const [invidOrders, setInvidOrders] = useState<InvidOrder[] | null>(null);
  const [invidBalance, setInvidBalance] = useState<number | null>(null);
  const [invidMovements, setInvidMovements] = useState<InvidAccountMovement[] | null>(null);
  const [loadingInvidAccount, setLoadingInvidAccount] = useState(false);
  const [invidAccountError, setInvidAccountError] = useState<string | null>(null);
  const [invidNodoDrafts, setInvidNodoDrafts] = useState<InvidNodoDraft[] | null>(null);
  const [invidPaymentUploads, setInvidPaymentUploads] = useState<InvidFileForm[]>([]);
  const [invidUploadNote, setInvidUploadNote] = useState<string | null>(null);
  const [invidDetail, setInvidDetail] = useState<
    | { kind: "order"; row: InvidOrder }
    | { kind: "movement"; row: InvidAccountMovement }
    | { kind: "draft"; row: InvidNodoDraft }
    | null
  >(null);
  const [invidUploadError, setInvidUploadError] = useState<string | null>(null);
  const [invidUploading, setInvidUploading] = useState(false);

  async function loadInvidAccount() {
    setLoadingInvidAccount(true);
    setInvidAccountError(null);
    try {
      const [ordersRes, statementRes, draftsRes] = await Promise.all([
        invidAccountApi.orders(),
        invidAccountApi.accountStatement(),
        invidCheckoutApi.drafts().catch(() => ({ data: [] as InvidNodoDraft[] })),
      ]);
      setInvidOrders(ordersRes.data.orders);
      setInvidPaymentUploads(ordersRes.data.paymentUploads ?? []);
      setInvidUploadNote(ordersRes.data.note ?? null);
      setInvidBalance(statementRes.data.balance);
      setInvidMovements(statementRes.data.movements);
      setInvidNodoDrafts(draftsRes.data ?? []);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setInvidAccountError(msg || "No se pudo traer Pedidos/Cuenta Corriente de Invid");
    } finally {
      setLoadingInvidAccount(false);
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
  const [configError, setConfigError] = useState<string | null>(null);

  const [clearingZeroStock, setClearingZeroStock] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [dangerResult, setDangerResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // Vacía el catálogo de toda la organización, no solo el de quien lo pide.
  const [canPurge, setCanPurge] = useState(false);
  const [isRetailer, setIsRetailer] = useState(false);

  useEffect(() => {
    const tenant = getTenant();
    const role = tenant?.role;
    setCanPurge(isAdmin() || (!!role && TENANT_ROLES_CAN_PURGE_CATALOG.includes(role)));
    setIsRetailer(tenant?.type === "RETAILER");
  }, []);

  async function loadConfig() {
    if (!implemented) return;
    setLoadingConfig(true);
    try {
      const res = await providersApi.getConfig(provider);
      setConfig({
        ...res.data,
        acceptsOffline: Boolean(res.data.acceptsOffline),
        acceptsScheme: Boolean(res.data.acceptsScheme),
        offlineIvaAdjustment: res.data.offlineIvaAdjustment ?? null,
        schemeIvaAdjustment: res.data.schemeIvaAdjustment ?? null,
        schemeDiscountPercent: res.data.schemeDiscountPercent ?? null,
      });
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
    setConfigError(null);
    try {
      const res = await providersApi.updateConfig(provider, {
        enabled: config.enabled,
        syncIntervalMinutes: config.syncIntervalMinutes,
        missingProductAction: config.missingProductAction,
        zeroStockAction: config.zeroStockAction,
        priceMarkupPercent: Number(config.priceMarkupPercent) || 0,
        minStockThreshold: Number(config.minStockThreshold) || 0,
        acceptsOffline: Boolean(config.acceptsOffline),
        acceptsScheme: Boolean(config.acceptsScheme),
        offlineIvaAdjustment: config.offlineIvaAdjustment,
        schemeIvaAdjustment: config.schemeIvaAdjustment,
        schemeDiscountPercent:
          config.schemeDiscountPercent == null || config.schemeDiscountPercent === ""
            ? null
            : Number(config.schemeDiscountPercent),
      });
      setConfig(res.data);
      invalidateMyProviders();
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setConfigError(msg || "No se pudo guardar la configuración");
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

  useEffect(() => { loadStatus(); loadConfig(); }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoTabDone.current || loadingStatus || !status) return;
    if (status.provider !== provider) return;
    autoTabDone.current = true;
    if (tabFromQuery.current) return;
    if (!canSyncProvider(status)) setTab("credentials");
  }, [loadingStatus, status, provider]);

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

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setSyncResult(null);
    try {
      const res = await providersApi.importFile(provider, file);
      const parts = [`${res.data.synced.toLocaleString("es-AR")} productos importados`];
      if (res.data.rowsSkipped > 0) parts.push(`${res.data.rowsSkipped} filas omitidas (sin código o nombre)`);
      if (res.data.unmappedColumns.length > 0) parts.push(`columnas no reconocidas: ${res.data.unmappedColumns.join(", ")}`);
      setSyncResult({ ok: true, msg: parts.join(" · ") });
      await loadStatus();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setSyncResult({ ok: false, msg: msg || "Error al importar el archivo" });
    } finally {
      setImporting(false);
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
    return <div className="flex-1 flex items-center justify-center text-surface-500 text-sm">Proveedor inválido.</div>;
  }

  return (
    <>
          <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/proveedores" className="text-surface-500 hover:text-white transition-colors flex-shrink-0 lg:hidden">
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="min-w-0">
                <h1 className={`text-base font-bold truncate ${PROVIDER_TEXT_COLOR[provider] || "text-white"}`}>
                  {provider.replace(/_/g, " ")}
                </h1>
                <p className="text-xs text-surface-500 hidden sm:block">
                  {implemented ? "Cargá tu cuenta, sincronizá el catálogo y mirá pedidos" : "Sin integración real todavía"}
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
                    <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Tu cuenta</span>
                    {loadingStatus ? (
                      <Loader2 className="w-4 h-4 animate-spin text-surface-600 mt-2" />
                    ) : status?.hasCredentials ? (
                      <button onClick={() => setTab("credentials")} className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400 mt-1 hover:text-emerald-300 transition-colors">
                        <CheckCircle2 className="w-4 h-4" /> Configurada
                      </button>
                    ) : status?.publicCatalog ? (
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-sky-400 mt-1">
                        <CheckCircle2 className="w-4 h-4" /> Catálogo público
                      </span>
                    ) : (
                      <button onClick={() => setTab("credentials")} className="flex items-center gap-1.5 text-sm font-semibold text-surface-400 hover:text-white mt-1 transition-colors">
                        <KeyRound className="w-4 h-4" /> Cargar cuenta
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
                    { key: "credentials" as const, label: "Mi cuenta" },
                    { key: "sync" as const, label: "Sincronización" },
                    { key: "config" as const, label: "Configuración" },
                    { key: "catalog" as const, label: "Catálogo" },
                    ...(provider === "INVID" ? [{ key: "invid-account" as const, label: "Pedidos y Cta. Cte." }] : []),
                    ...(provider === "NEW_BYTES" ? [{ key: "nb-account" as const, label: "Pedidos y Cta. Cte." }] : []),
                    ...(provider === "ELIT" ? [{ key: "elit-account" as const, label: "Pedidos y Cta. Cte." }] : []),
                    ...(provider === "GRUPO_NUCLEO" ? [{ key: "gn-account" as const, label: "Pedidos y Cta. Cte." }] : []),
                    ...(provider === "AIR" ? [{ key: "air-account" as const, label: "Pedidos y Cta. Cte." }] : []),
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => {
                        setTab(key);
                        if (key === "invid-account" && invidOrders === null && !loadingInvidAccount) loadInvidAccount();
                      }}
                      className={`text-sm font-medium px-4 py-2.5 border-b-2 -mb-px transition-all ${
                        tab === key ? "border-brand-500 text-brand-700 dark:text-brand-400" : "border-transparent text-surface-500 hover:text-surface-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {tab === "credentials" && (
                  <ProviderCredentialForm provider={provider} onChanged={loadStatus} />
                )}

                {tab === "sync" && (
                  <div className="max-w-xl flex flex-col gap-4">
                    <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
                      <p className="text-sm text-surface-400">
                        Trae el catálogo completo de {provider.replace(/_/g, " ")} y lo guarda en nuestra base.
                        Las búsquedas de los usuarios consultan esta base, no la API del proveedor en vivo.
                      </p>
                      {!canSyncProvider(status) && (
                        <div className="flex items-start gap-2.5 bg-amber-500/8 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs rounded-lg px-3.5 py-2.5">
                          <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          Necesitás <button type="button" onClick={() => setTab("credentials")} className="underline font-medium">cargar tu cuenta</button> antes de sincronizar.
                        </div>
                      )}
                      {status?.publicCatalog && !status.hasCredentials && (
                        <p className="text-xs text-surface-500">
                          Este catálogo es público: se sincroniza sin login. Los precios son los que publica el sitio (lista, no necesariamente mayorista).
                        </p>
                      )}
                      <button
                        onClick={handleSync}
                        disabled={syncing || !canSyncProvider(status)}
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

                    <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <FileSpreadsheet className="w-4 h-4 text-brand-700 dark:text-brand-400" />
                        Importar desde Excel/CSV
                      </div>
                      <p className="text-xs text-surface-500">
                        Alternativa cuando la API del proveedor no da abasto (límites de requests, etc.): exportá el
                        catálogo desde el portal de {provider.replace(/_/g, " ")} y subilo acá. Reconoce columnas
                        como código/SKU, nombre, precio, stock, marca, categoría — lo que no matchea se ignora, no se inventa.
                      </p>
                      <label className={`flex items-center justify-center gap-2 border border-dashed border-surface-700 hover:border-brand-500 text-surface-300 hover:text-white text-sm font-medium rounded-lg py-2.5 transition-all cursor-pointer ${importing ? "opacity-50 pointer-events-none" : ""}`}>
                        {importing ? <NodoSpinner className="w-4 h-4" /> : <FileSpreadsheet className="w-4 h-4" />}
                        {importing ? "Importando..." : "Elegir archivo (.xlsx, .csv)"}
                        <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} disabled={importing} />
                      </label>
                      {importing && <SyncProgressBar />}
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

                        {isRetailer && (
                          <ProviderPurchaseConfig provider={provider} config={config} onChange={setConfig} />
                        )}

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
                        {configError && (
                          <div className="flex items-center gap-2 text-xs rounded-lg px-3.5 py-2.5 bg-red-500/8 border border-red-500/20 text-red-400">
                            <XCircle className="w-4 h-4 flex-shrink-0" /> {configError}
                          </div>
                        )}
                      </form>
                    )}

                    {!loadingConfig && config && canPurge && (
                      <div className="border border-red-500/20 rounded-xl p-5 flex flex-col gap-4 mt-5">
                        <div className="flex items-center gap-2 text-sm font-semibold text-red-400">
                          <AlertTriangle className="w-4 h-4" />
                          Zona de peligro
                        </div>
                        <p className="text-xs text-surface-500">
                          Estas acciones vacían el catálogo de {provider.replace(/_/g, " ")} para toda tu organización y no se pueden deshacer. Hay que volver a sincronizar para recuperarlo.
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

                {tab === "invid-account" && (
                  <div className="flex flex-col gap-5 max-w-3xl">
                    <p className="text-xs text-surface-500">
                      Datos reales de tu cuenta en invidcomputers.com. Ver más muestra ítems, entrega/pago y PDFs si el portal los linkea. Si hay un formulario de comprobante de pago en la sesión, también se puede subir desde Nodo.
                    </p>
                    {loadingInvidAccount ? (
                      <div className="flex justify-center py-10"><NodoSpinner className="w-6 h-6" /></div>
                    ) : invidAccountError ? (
                      <div className="flex items-center gap-2 text-xs rounded-lg px-3.5 py-2.5 bg-red-500/8 border border-red-500/20 text-red-400">
                        <XCircle className="w-4 h-4 flex-shrink-0" /> {invidAccountError}
                        <button onClick={loadInvidAccount} className="ml-auto underline">Reintentar</button>
                      </div>
                    ) : (
                      <>
                        <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-white">
                            <Wallet className="w-4 h-4 text-brand-700 dark:text-brand-400" />
                            Cuenta Corriente
                          </div>
                          {invidBalance != null && (
                            <div>
                              <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Saldo</span>
                              <p className={`text-2xl font-bold tabular-nums ${invidBalance < 0 ? "text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                                {invidBalance.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
                              </p>
                            </div>
                          )}
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-surface-500">
                                  <th className="text-left font-semibold px-2 py-2">Fecha</th>
                                  <th className="text-left font-semibold px-2 py-2">Tipo</th>
                                  <th className="text-left font-semibold px-2 py-2">Número</th>
                                  <th className="text-right font-semibold px-2 py-2">Total</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-surface-800">
                                {(invidMovements ?? []).map((m, i) => (
                                  <tr key={i}>
                                    <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{m.date}</td>
                                    <td className="px-2 py-2 text-surface-200">{m.docType}</td>
                                    <td className="px-2 py-2 text-surface-400 font-mono text-xs">{m.docNumber}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-surface-200">{m.currency} {m.total}</td>
                                    <td className="px-2 py-2 text-right"><VerMasButton onClick={() => setInvidDetail({ kind: "movement", row: m })} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {(invidMovements ?? []).length === 0 && (
                              <p className="text-center text-xs text-surface-500 py-6">Sin movimientos.</p>
                            )}
                          </div>
                        </div>

                        <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-white">
                            <Receipt className="w-4 h-4 text-orange-400" />
                            Borradores creados desde Nodo
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-surface-500">
                                  <th className="text-left font-semibold px-2 py-2">Estado</th>
                                  <th className="text-left font-semibold px-2 py-2">Pedido web</th>
                                  <th className="text-left font-semibold px-2 py-2">Orden</th>
                                  <th className="text-left font-semibold px-2 py-2">Fecha</th>
                                  <th className="text-right font-semibold px-2 py-2">Total</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-surface-800">
                                {(invidNodoDrafts ?? []).map((d) => (
                                  <tr key={d.id}>
                                    <td className="px-2 py-2">
                                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                        d.status === "CREATED" ? "bg-amber-500/10 text-amber-400"
                                          : d.status === "PENDING" ? "bg-sky-500/10 text-sky-400"
                                          : "bg-red-500/10 text-red-400"
                                      }`}>{d.status === "CREATED" ? "Pendiente" : d.status === "PENDING" ? "Procesando" : d.status}</span>
                                    </td>
                                    <td className="px-2 py-2 text-surface-400 font-mono text-xs">{d.invidWebOrderNumber ?? "—"}</td>
                                    <td className="px-2 py-2 text-surface-400 font-mono text-xs">{d.invidOrderNumber ?? "—"}</td>
                                    <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{new Date(d.createdAt).toLocaleString("es-AR")}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-surface-200">{d.total ?? "—"}</td>
                                    <td className="px-2 py-2 text-right"><VerMasButton onClick={() => setInvidDetail({ kind: "draft", row: d })} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {(invidNodoDrafts ?? []).length === 0 && (
                              <p className="text-center text-xs text-surface-500 py-6">Todavía no creaste borradores desde Nodo.</p>
                            )}
                          </div>
                        </div>

                        <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-white">
                            <Receipt className="w-4 h-4 text-brand-700 dark:text-brand-400" />
                            Mis Pedidos
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-surface-500">
                                  <th className="text-left font-semibold px-2 py-2">N° Orden</th>
                                  <th className="text-left font-semibold px-2 py-2">N° Pedido Web</th>
                                  <th className="text-left font-semibold px-2 py-2">Estado</th>
                                  <th className="text-left font-semibold px-2 py-2">Fecha</th>
                                  <th className="text-right font-semibold px-2 py-2">Importe</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-surface-800">
                                {(invidOrders ?? []).map((o, i) => (
                                  <tr key={i}>
                                    <td className="px-2 py-2 text-surface-400 font-mono text-xs">{o.orderNumber}</td>
                                    <td className="px-2 py-2 text-surface-400 font-mono text-xs">{o.webOrderNumber}</td>
                                    <td className="px-2 py-2">
                                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                        o.status === "Cerrado" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                        : o.status === "Vencido" || o.status === "Cancelado" ? "bg-red-500/10 text-red-400"
                                        : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                      }`}>{o.status}</span>
                                    </td>
                                    <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{o.date}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-surface-200">{o.amount}</td>
                                    <td className="px-2 py-2 text-right"><VerMasButton onClick={() => setInvidDetail({ kind: "order", row: o })} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {(invidOrders ?? []).length === 0 && (
                              <p className="text-center text-xs text-surface-500 py-6">Sin pedidos.</p>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                    {invidDetail?.kind === "order" && (
                      <AccountRowDetail
                        open
                        title={`Pedido ${invidDetail.row.orderNumber}`}
                        lines={[
                          { label: "Orden", value: invidDetail.row.orderNumber },
                          { label: "Pedido web", value: invidDetail.row.webOrderNumber },
                          { label: "Estado", value: invidDetail.row.status },
                          { label: "Fecha", value: invidDetail.row.date },
                          { label: "Importe", value: invidDetail.row.amount },
                          { label: "Factura", value: invidDetail.row.invoice },
                          { label: "Entrega", value: invidDetail.row.delivery || "" },
                          { label: "Pago", value: invidDetail.row.payment || "" },
                        ]}
                        items={(invidDetail.row.items ?? []).map((it) => ({
                          code: it.code,
                          name: it.name,
                          qty: it.qty,
                          price: it.price,
                          total: it.total,
                        }))}
                        documents={[
                          ...(invidDetail.row.invoiceHrefs ?? []).map((href, i) => ({
                            label: "Descargar factura",
                            href: `/providers/INVID/documents?href=${encodeURIComponent(href)}`,
                            filename: `invid-factura-${invidDetail.row.orderNumber || i}.pdf`,
                          })),
                          ...(invidDetail.row.links ?? [])
                            .filter((l) => !/ultima\.php/i.test(l.href))
                            .map((l) => ({
                              label: l.label || "Descargar",
                              href: `/providers/INVID/documents?href=${encodeURIComponent(l.href)}`,
                              filename: l.label || "invid-doc",
                            })),
                        ]}
                        note={
                          invidPaymentUploads.length === 0
                            ? (invidUploadNote || "Si Invid no muestra un formulario de comprobante en esta sesión, el alta se hace desde su portal.")
                            : undefined
                        }
                        upload={
                          invidPaymentUploads.length > 0
                            ? {
                                label: "Subir comprobante de pago",
                                loading: invidUploading,
                                error: invidUploadError,
                                onFile: (file) => {
                                  setInvidUploading(true);
                                  setInvidUploadError(null);
                                  void uploadAuthedFile("/providers/INVID/payments/attach", file)
                                    .then(() => { setInvidUploadError(null); })
                                    .catch((e: unknown) => setInvidUploadError(e instanceof Error ? e.message : "No se pudo subir"))
                                    .finally(() => setInvidUploading(false));
                                },
                              }
                            : undefined
                        }
                        onClose={() => setInvidDetail(null)}
                      />
                    )}
                    {invidDetail?.kind === "movement" && (
                      <AccountRowDetail
                        open
                        title={`${invidDetail.row.docType} ${invidDetail.row.docNumber}`.trim()}
                        lines={[
                          { label: "Fecha", value: invidDetail.row.date },
                          { label: "Tipo", value: invidDetail.row.docType },
                          { label: "Número", value: invidDetail.row.docNumber },
                          { label: "Interno", value: invidDetail.row.internalNumber },
                          { label: "Moneda", value: invidDetail.row.currency },
                          { label: "Total", value: invidDetail.row.total },
                        ]}
                        documents={(invidDetail.row.hrefs ?? []).map((href, i) => ({
                          label: "Descargar",
                          href: `/providers/INVID/documents?href=${encodeURIComponent(href)}`,
                          filename: `invid-${invidDetail.row.docNumber || i}.pdf`,
                        }))}
                        note={(invidDetail.row.hrefs ?? []).length === 0 ? "Este movimiento no trae un link de PDF en el HTML de Invid." : undefined}
                        onClose={() => setInvidDetail(null)}
                      />
                    )}
                    {invidDetail?.kind === "draft" && (
                      <AccountRowDetail
                        open
                        title="Borrador desde Nodo"
                        lines={draftLines(invidDetail.row)}
                        items={draftItems(invidDetail.row)}
                        onClose={() => setInvidDetail(null)}
                      />
                    )}
                  </div>
                )}

                {tab === "nb-account" && <NewBytesAccountPanel />}
                {tab === "elit-account" && <ElitAccountPanel />}
                {tab === "gn-account" && <GrupoNucleoAccountPanel />}
                {tab === "air-account" && <AirAccountPanel />}
              </div>
            </div>
          )}
    </>
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
