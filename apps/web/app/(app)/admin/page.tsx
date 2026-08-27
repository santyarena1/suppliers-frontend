"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  adminApi, retailApi, AdminUser,
  ModulePermission, ModuleKey,
} from "@/lib/api";
import { isAdmin, getUser } from "@/lib/auth";
import UsersManagement from "@/components/admin/UsersManagement";
import OrganizationsTree from "@/components/admin/OrganizationsTree";
import CatalogEnrichmentPanel from "@/components/admin/CatalogEnrichmentPanel";
import DiagnosticsPanel from "@/components/DiagnosticsPanel";
import ImageSyncPanel from "@/components/admin/ImageSyncPanel";
import AdminAdsPanel from "@/components/admin/AdminAdsPanel";
import {
  Users, ShieldCheck,
  Loader2, CheckCircle2, XCircle, Zap, Network, DollarSign, Activity, Tags,
  ChevronLeft, ChevronRight, RefreshCw, Store, Search, Image as ImageIcon, Megaphone,
} from "lucide-react";
import { formatARS, proxyImg } from "@/lib/format";

type Tab = "organizations" | "users" | "permissions" | "retail" | "catalog" | "images" | "ads" | "diagnostics";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "organizations", label: "Organizaciones", icon: <Network className="w-3.5 h-3.5" /> },
  { key: "users", label: "Usuarios", icon: <Users className="w-3.5 h-3.5" /> },
  { key: "permissions", label: "Permisos", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  { key: "retail", label: "Locales / precios", icon: <DollarSign className="w-3.5 h-3.5" /> },
  { key: "catalog", label: "Catálogo", icon: <Tags className="w-3.5 h-3.5" /> },
  { key: "images", label: "Imágenes", icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { key: "ads", label: "Publicidad", icon: <Megaphone className="w-3.5 h-3.5" /> },
  { key: "diagnostics", label: "Diagnóstico", icon: <Activity className="w-3.5 h-3.5" /> },
];

const MODULE_LABELS: Record<ModuleKey, string> = {
  search: "Búsqueda",
  cart: "Carrito",
  credentials: "Credenciales (en Proveedores)",
  providers: "Proveedores",
  brands: "Portal de Marcas",
  diagnostics: "Diagnóstico",
  admin: "Administración",
};

const TAB_KEYS: Tab[] = ["organizations", "users", "permissions", "retail", "catalog", "images", "ads", "diagnostics"];

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-surface-500 text-sm">Cargando…</div>}>
      <AdminPageInner />
    </Suspense>
  );
}

function AdminPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = searchParams.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(initial && TAB_KEYS.includes(initial) ? initial : "organizations");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!isAdmin()) router.replace("/search");
  }, [router]);

  useEffect(() => {
    const q = searchParams.get("tab") as Tab | null;
    if (q && TAB_KEYS.includes(q)) setTab(q);
  }, [searchParams]);

  function selectTab(next: Tab) {
    setTab(next);
    const url = next === "organizations" ? "/admin" : `/admin?tab=${next}`;
    router.replace(url, { scroll: false });
  }

  const currentUser = getUser();

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <>
          <header className="flex-shrink-0 border-b border-surface-800 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-yellow-500/15 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-white">Administración</h1>
                <p className="text-xs text-surface-500">
                  Sesión como <span className="text-yellow-400 font-medium">{currentUser?.username}</span>
                </p>
              </div>
            </div>
          </header>

          <div className="flex-shrink-0 border-b border-surface-800 px-6 flex gap-1 overflow-x-auto">
            {TABS.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => selectTab(key)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3.5 py-2.5 border-b-2 -mb-px transition-all whitespace-nowrap ${
                  tab === key ? "border-brand-500 text-brand-700 dark:text-brand-400" : "border-transparent text-surface-500 hover:text-surface-300"
                }`}
              >
                {icon}{label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {tab === "organizations" && <OrganizationsTree showToast={showToast} />}
            {tab === "users" && <UsersManagement showToast={showToast} />}
            {tab === "permissions" && <PermissionsTab showToast={showToast} />}
            {tab === "retail" && <RetailTab showToast={showToast} />}
            {tab === "catalog" && <CatalogEnrichmentPanel showToast={showToast} />}
            {tab === "images" && <ImageSyncPanel showToast={showToast} />}
            {tab === "ads" && <AdminAdsPanel showToast={showToast} />}
            {tab === "diagnostics" && <DiagnosticsPanel />}
          </div>

      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl ${
          toast.ok
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
            : "bg-red-500/10 border-red-500/20 text-red-300"
        }`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </>
  );
}

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

// ---------- Permisos ----------

function PermissionsTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [perms, setPerms] = useState<ModulePermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { adminApi.listUsers().then((r) => setUsers(r.data)).catch(() => setUsers([])); }, []);

  useEffect(() => {
    if (!selected) { setPerms([]); return; }
    setLoading(true);
    adminApi.getPermissions(selected).then((r) => setPerms(r.data)).catch(() => setPerms([])).finally(() => setLoading(false));
  }, [selected]);

  function toggle(module: ModuleKey) {
    setPerms((prev) => prev.map((p) => (p.module === module ? { ...p, allowed: !p.allowed } : p)));
  }

  async function save() {
    setSaving(true);
    try {
      await adminApi.updatePermissions(selected, perms);
      showToast("Permisos actualizados");
    } catch (err) {
      showToast(errMsg(err, "Error al guardar permisos"), false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg flex flex-col gap-4">
      <div>
        <label className="block text-xs font-medium text-surface-400 mb-1.5">Usuario</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
        >
          <option value="">Elegí un usuario...</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
        </select>
      </div>

      {loading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>}

      {!loading && selected && perms.length > 0 && (
        <div className="border border-surface-800 rounded-xl divide-y divide-surface-800">
          {perms.map((p) => (
            <div key={p.module} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="text-sm text-surface-200">{MODULE_LABELS[p.module]}</span>
                {p.module === "credentials" && (
                  <p className="text-[11px] text-surface-500 mt-0.5">Ya no tiene ítem propio en el menú: vive en cada proveedor.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => toggle(p.module)}
                className={`w-10 rounded-full relative transition-colors ${p.allowed ? "bg-brand-600" : "bg-surface-600"}`}
                style={{ height: 22 }}
              >
                <span className={`absolute top-0.5 bg-white rounded-full transition-all ${p.allowed ? "left-[22px]" : "left-0.5"}`} style={{ width: 18, height: 18 }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && perms.length > 0 && (
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg py-2.5 transition-all"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar permisos"}
        </button>
      )}
    </div>
  );
}

// ---------- Precios de venta (referencia de mercado) ----------

function RetailTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [syncingStoreId, setSyncingStoreId] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    running: boolean;
    mode: "full" | "batch" | null;
    stores: number;
    products: number;
    lastRun: {
      status: string;
      mode: string;
      startedAt: string;
      finishedAt: string | null;
      storesTotal: number;
      storesDone: number;
      productsUpserted: number;
      currentStoreName: string | null;
      errorMessage: string | null;
    } | null;
  } | null>(null);
  const [stores, setStores] = useState<
    {
      id: string;
      externalId: number;
      name: string;
      logoUrl: string | null;
      priceDivisor: number;
      syncedAt: string;
      productCount: number;
      neverSynced: boolean;
    }[]
  >([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [storeQ, setStoreQ] = useState("");
  const [prodQ, setProdQ] = useState("");
  const [prodPage, setProdPage] = useState(1);
  const [catalog, setCatalog] = useState<{
    store: { id: string; name: string; priceDivisor: number; syncedAt: string };
    total: number;
    products: {
      id: string;
      name: string;
      price: number;
      categoryName: string | null;
      imageUrl: string | null;
      productUrl: string | null;
      syncedAt: string;
    }[];
  } | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const loadStatus = useCallback(() => {
    retailApi
      .ingestStatus()
      .then((r) => setStatus(r.data))
      .catch(() => setStatus(null));
  }, []);

  const loadStores = useCallback(() => {
    retailApi
      .listStores()
      .then((r) => setStores(r.data))
      .catch(() => setStores([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadStatus();
    loadStores();
    const id = setInterval(() => {
      loadStatus();
      if (status?.running) loadStores();
    }, status?.running ? 4_000 : 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStatus, loadStores, status?.running]);

  useEffect(() => {
    if (!selectedStoreId) {
      setCatalog(null);
      return;
    }
    setCatalogLoading(true);
    retailApi
      .listStoreProducts(selectedStoreId, { q: prodQ, page: prodPage, take: 40 })
      .then((r) => setCatalog(r.data))
      .catch(() => setCatalog(null))
      .finally(() => setCatalogLoading(false));
  }, [selectedStoreId, prodQ, prodPage]);

  async function startIngest() {
    setStarting(true);
    try {
      const r = await retailApi.triggerIngest();
      if (r.data.started) {
        showToast(
          r.data.reason === "queued_after_batch"
            ? "Full encolado: termina el batch del cron y sigue hasta el final"
            : "Sync full iniciado en segundo plano (sigue hasta terminar)"
        );
      } else {
        showToast(
          r.data.reason === "already_running" ? "Ya hay un sync full en curso" : "No se inició",
          false
        );
      }
      loadStatus();
    } catch (err) {
      showToast(errMsg(err, "Error al iniciar ingesta"), false);
    } finally {
      setStarting(false);
    }
  }

  async function repairCentavos() {
    setRepairing(true);
    try {
      const r = await retailApi.repairPrices();
      showToast(
        r.data.storesRepaired > 0
          ? `Reparados ${r.data.storesRepaired} locales · ${r.data.productsScaled} productos ×100`
          : "No había catálogos con ÷100 falso"
      );
      loadStores();
      if (selectedStoreId) {
        const again = await retailApi.listStoreProducts(selectedStoreId, {
          q: prodQ,
          page: prodPage,
          take: 40,
        });
        setCatalog(again.data);
      }
    } catch (err) {
      showToast(errMsg(err, "Error al reparar precios"), false);
    } finally {
      setRepairing(false);
    }
  }

  async function syncOneStore(storeId: string) {
    setSyncingStoreId(storeId);
    try {
      const r = await retailApi.triggerStoreIngest(storeId);
      if (r.data.started) {
        showToast(`Local sincronizado · ${r.data.productsUpserted ?? 0} productos`);
        loadStores();
        loadStatus();
        if (selectedStoreId === storeId) {
          setProdPage(1);
          const again = await retailApi.listStoreProducts(storeId, { q: prodQ, page: 1, take: 40 });
          setCatalog(again.data);
        }
      } else {
        showToast("Ya hay una ingesta en curso", false);
      }
    } catch (err) {
      showToast(errMsg(err, "Error al sincronizar local"), false);
    } finally {
      setSyncingStoreId(null);
    }
  }

  const filteredStores = stores.filter((s) =>
    !storeQ.trim() ? true : s.name.toLowerCase().includes(storeQ.trim().toLowerCase())
  );

  const run = status?.lastRun;
  const progressPct =
    run && run.storesTotal > 0
      ? Math.min(100, Math.round((run.storesDone / run.storesTotal) * 100))
      : status?.running
        ? 5
        : 0;

  if (loading && stores.length === 0 && !status) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white mb-1">Precios de venta (referencia)</h2>
          <p className="text-xs text-surface-500 leading-relaxed max-w-2xl">
            Catálogo de precios en locales. El automático corre **cada 5 minutos las 24 h**
            (al despertar el API arranca al toque, no espera a la mañana). “Sincronizar todo”
            hace un full en segundo plano; si hay un batch del cron, lo corta y encola el full.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => void repairCentavos()}
            disabled={repairing || status?.running}
            className="flex items-center justify-center gap-2 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 text-amber-200 text-sm font-semibold rounded-lg px-4 py-2.5 transition-all"
            title="Corrige locales que quedaron con precios ÷100 por error (no toca Multiplo)"
          >
            {repairing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Reparar ÷100 falsos
          </button>
          <button
            type="button"
            onClick={() => void startIngest()}
            disabled={starting || (status?.running && status.mode === "full")}
            className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-all"
          >
            {starting || status?.running ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {status?.running && status.mode === "full"
              ? "Full en curso…"
              : status?.running && status.mode === "batch"
                ? "Encolar full (corta batch)"
                : "Sincronizar todo"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-surface-500">Locales</p>
          <p className="text-lg font-semibold text-white tabular-nums">{status?.stores ?? stores.length}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-surface-500">Productos</p>
          <p className="text-lg font-semibold text-white tabular-nums">{status?.products ?? "—"}</p>
        </div>
        <div className="col-span-2">
          <p className="text-[10px] uppercase tracking-wider text-surface-500">Estado sync</p>
          {run ? (
            <div className="mt-0.5 space-y-1.5">
              <p className="text-xs text-surface-300">
                {run.status}
                {status?.running ? ` · ${status.mode === "batch" ? "batch cron" : "full"}` : ""}
                {run.currentStoreName ? ` · ${run.currentStoreName}` : ""}
              </p>
              <div className="h-1.5 rounded-full bg-surface-800 overflow-hidden">
                <div
                  className="h-full bg-brand-500 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-[11px] text-surface-500 tabular-nums">
                {run.storesDone}/{run.storesTotal || "?"} locales · {run.productsUpserted} upserts ·{" "}
                {new Date(run.startedAt).toLocaleString("es-AR")}
              </p>
              {run.errorMessage && (
                <p className="text-[11px] text-red-400">{run.errorMessage}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-surface-500 mt-0.5">Todavía no corrió</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 min-h-[420px]">
        <div className="rounded-xl border border-surface-800 bg-surface-950 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-surface-800 space-y-2">
            <p className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-brand-400" /> Locales ingeridos
            </p>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <span className="inline-flex items-center gap-1 text-emerald-300">
                <span className="w-2 h-2 rounded-sm bg-emerald-500/70" /> Listo
              </span>
              <span className="inline-flex items-center gap-1 text-amber-300">
                <span className="w-2 h-2 rounded-sm bg-amber-500/70" /> En proceso
              </span>
              <span className="inline-flex items-center gap-1 text-surface-400">
                <span className="w-2 h-2 rounded-sm bg-surface-600" /> Falta
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
              <input
                value={storeQ}
                onChange={(e) => setStoreQ(e.target.value)}
                placeholder="Filtrar locales…"
                className="w-full bg-surface-900 border border-surface-700 rounded-lg pl-8 pr-2 py-1.5 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredStores.length === 0 ? (
              <p className="text-xs text-surface-500 p-4 text-center">Sin locales todavía. Corré un sync.</p>
            ) : (
              filteredStores.map((s) => {
                const selected = selectedStoreId === s.id;
                const inProgress =
                  syncingStoreId === s.id ||
                  (!!status?.running &&
                    !!status.lastRun?.currentStoreName &&
                    status.lastRun.currentStoreName.toLowerCase() === s.name.toLowerCase());
                const done = !s.neverSynced && s.productCount > 0 && !inProgress;
                const rowBg = inProgress
                  ? "bg-amber-500/15 border-l-2 border-l-amber-400"
                  : done
                    ? "bg-emerald-500/10 border-l-2 border-l-emerald-400"
                    : "bg-surface-900/60 border-l-2 border-l-surface-600";
                return (
                  <div
                    key={s.id}
                    className={`w-full text-left px-3 py-2.5 border-b border-surface-900/80 flex gap-2 items-start ${rowBg} ${
                      selected ? "ring-1 ring-inset ring-brand-500/40" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStoreId(s.id);
                        setProdPage(1);
                        setProdQ("");
                      }}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="text-xs font-medium text-white truncate">{s.name}</p>
                      <p className="text-[10px] text-surface-400 tabular-nums mt-0.5">
                        {inProgress
                          ? "Sincronizando…"
                          : done
                            ? `${s.productCount} productos`
                            : s.neverSynced
                              ? "Sin sincronizar"
                              : "Sin productos"}
                        {!inProgress && !s.neverSynced && s.productCount > 0
                          ? ` · ${new Date(s.syncedAt).toLocaleString("es-AR")}`
                          : ""}
                        {s.priceDivisor > 1 ? ` · ÷${s.priceDivisor}` : ""}
                      </p>
                    </button>
                    <button
                      type="button"
                      title="Sincronizar este local"
                      disabled={!!syncingStoreId || status?.running}
                      onClick={() => void syncOneStore(s.id)}
                      className="p-1.5 rounded-md text-surface-500 hover:text-white hover:bg-black/20 disabled:opacity-40"
                    >
                      {syncingStoreId === s.id || inProgress ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border border-surface-800 bg-surface-950 flex flex-col overflow-hidden">
          {!selectedStoreId ? (
            <div className="flex-1 flex items-center justify-center p-8 text-center">
              <p className="text-xs text-surface-500">Elegí un local para ver su catálogo ingerido.</p>
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-surface-800 flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[160px]">
                  <p className="text-xs font-semibold text-white">{catalog?.store.name ?? "…"}</p>
                  <p className="text-[10px] text-surface-500 tabular-nums">
                    {catalog ? `${catalog.total} en catálogo` : ""}
                    {catalog?.store.priceDivisor && catalog.store.priceDivisor > 1
                      ? ` · precios ÷${catalog.store.priceDivisor}`
                      : ""}
                  </p>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
                  <input
                    value={prodQ}
                    onChange={(e) => {
                      setProdQ(e.target.value);
                      setProdPage(1);
                    }}
                    placeholder="Buscar en este local…"
                    className="w-52 bg-surface-900 border border-surface-700 rounded-lg pl-8 pr-2 py-1.5 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {catalogLoading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
                  </div>
                ) : !catalog || catalog.products.length === 0 ? (
                  <p className="text-xs text-surface-500 p-8 text-center">Sin productos en este local.</p>
                ) : (
                  <ul className="divide-y divide-surface-900">
                    {catalog.products.map((p) => (
                      <li key={p.id} className="px-3 py-2.5 flex gap-3 items-center">
                        <div className="w-10 h-10 rounded-md bg-white flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {p.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={proxyImg(p.imageUrl)} alt="" className="w-full h-full object-contain p-0.5" />
                          ) : (
                            <Store className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-surface-100 line-clamp-2 leading-snug">{p.name}</p>
                          {p.categoryName && (
                            <p className="text-[10px] text-surface-500 mt-0.5">{p.categoryName}</p>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-emerald-400 tabular-nums flex-shrink-0">
                          {formatARS(p.price)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {catalog && catalog.total > 40 && (
                <div className="p-2 border-t border-surface-800 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={prodPage <= 1}
                    onClick={() => setProdPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-md text-surface-400 hover:text-white disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] text-surface-500 tabular-nums">
                    Pág. {prodPage} / {Math.ceil(catalog.total / 40)}
                  </span>
                  <button
                    type="button"
                    disabled={prodPage >= Math.ceil(catalog.total / 40)}
                    onClick={() => setProdPage((p) => p + 1)}
                    className="p-1.5 rounded-md text-surface-400 hover:text-white disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
