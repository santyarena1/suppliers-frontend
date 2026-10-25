"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import RedeemAccessCode from "@/components/RedeemAccessCode";
import LocalPurchaseDashboard from "@/components/insights/LocalPurchaseDashboard";
import {
  invalidateMyProviders, loadMyProviders, Provider, providersApi, ProviderStatus,
  isLiveSyncRun, summarizeSyncRun, catalogSyncKickoff, isListProvider, listImportsApi, type VisibleProvider
} from "@/lib/api";
import { getTenant, isAdmin } from "@/lib/auth";
import AddSupplierDialog from "@/components/list-import/AddSupplierDialog";
import StoreProvidersSection from "@/components/storefront/StoreProvidersSection";
import AvailableProviders from "@/components/AvailableProviders";
import ProviderBadge from "@/components/ProviderBadge";
import { useIsRetailer } from "@/lib/purchase";
import UpsellNotice from "@/components/subscription/UpsellNotice";
import { capabilityAllowed, invalidateSubscription, useSubscription } from "@/lib/subscription";
import ProvidersTable, { providerRowState } from "@/components/providers/ProvidersTable";
import HubKpis from "@/components/providers/HubKpis";
import { FileSpreadsheet, Loader2, Plus } from "lucide-react";

type StatusMap = Partial<Record<string, ProviderStatus>>;

export default function ProveedoresPage() {
  const retailer = useIsRetailer();
  const { subscription } = useSubscription();
  const chatAllowed = capabilityAllowed(subscription, "integratedChat");
  const analyticsAllowed = capabilityAllowed(subscription, "advancedAnalytics");
  const [visible, setVisible] = useState<VisibleProvider[]>([]);
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Provider | null>(null);
  const [syncResult, setSyncResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const pendingRunId = useRef<Partial<Record<string, string>>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [enablingOwn, setEnablingOwn] = useState(false);
  const [ownError, setOwnError] = useState<string | null>(null);
  const tenantType = getTenant()?.type ?? null;
  const admin = isAdmin();
  // Un comercio (o el superadmin) da de alta proveedores por lista; un distribuidor o marca habilita la suya.
  const canCreateListProvider = admin || tenantType === "RETAILER";
  const canEnableOwnList = !admin && (tenantType === "DISTRIBUTOR" || tenantType === "BRAND");

  async function handleEnableOwnList() {
    setEnablingOwn(true);
    setOwnError(null);
    try {
      const res = await listImportsApi.enableOwnList({ listUpdateDays: 15 });
      invalidateMyProviders();
      window.location.href = `/proveedores/${res.data.providerKey}?tab=lists`;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setOwnError(msg || "No se pudo habilitar la lista");
      setEnablingOwn(false);
    }
  }

  const loadStatuses = useCallback(async (linkedProviders: Provider[]) => {
    const results = await Promise.allSettled(linkedProviders.map((p) => providersApi.status(p)));
    const map: StatusMap = {};
    results.forEach((r, i) => {
      if (r.status === "fulfilled") map[linkedProviders[i]] = r.value.data;
    });
    setStatuses(map);
  }, []);

  const load = useCallback(async (force = false) => {
    if (force) invalidateMyProviders();
    // Las tiendas de otros comercios (Vender en NODO) se ven en el buscador, no acá.
    const mine = (await loadMyProviders(force)).filter((p) => !p.storefront);
    setVisible(mine);
    const linked = mine.filter((p) => p.linked).map((p) => p.provider);
    await loadStatuses(linked);
    setLoading(false);
  }, [loadStatuses]);

  useEffect(() => { load(); }, [load]);

  const anyLive =
    Boolean(syncing) ||
    Object.values(statuses).some((s) => isLiveSyncRun(s?.currentRun));

  useEffect(() => {
    if (!anyLive) return;
    const linked = visible.filter((p) => p.linked).map((p) => p.provider);
    const id = setInterval(() => {
      void loadStatuses(linked);
    }, 1200);
    return () => clearInterval(id);
  }, [anyLive, visible, loadStatuses]);

  useEffect(() => {
    const provider = syncing;
    if (!provider) return;
    const id = pendingRunId.current[provider];
    const run = statuses[provider]?.currentRun;
    if (!id || !run || run.id !== id || run.status === "RUNNING") return;
    delete pendingRunId.current[provider];
    if (run.status === "OK") {
      setSyncResult((prev) => ({
        ...prev,
        [provider]: { ok: true, msg: summarizeSyncRun(run) },
      }));
      void load();
    } else {
      setSyncResult((prev) => ({
        ...prev,
        [provider]: { ok: false, msg: run.errorMessage || "Error al sincronizar" },
      }));
    }
    setSyncing(null);
  }, [syncing, statuses, load]);

  async function handleSync(provider: Provider, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSyncing(provider);
    setSyncResult((prev) => ({ ...prev, [provider]: undefined as unknown as { ok: boolean; msg: string } }));
    try {
      const res = await providersApi.sync(provider);
      const d = res.data;
      if (d.runId) pendingRunId.current[provider] = d.runId;
      const linked = visible.filter((p) => p.linked).map((p) => p.provider);
      await loadStatuses(linked);
      if (catalogSyncKickoff(d)) return;
      delete pendingRunId.current[provider];
      const msg =
        d.created != null
          ? `${d.synced.toLocaleString("es-AR")} productos · ${d.created.toLocaleString("es-AR")} nuevos · ${(d.updated ?? 0).toLocaleString("es-AR")} actualizados`
          : `${d.synced.toLocaleString("es-AR")} productos`;
      setSyncResult((prev) => ({ ...prev, [provider]: { ok: true, msg } }));
      await load();
      setSyncing(null);
    } catch (err: unknown) {
      delete pendingRunId.current[provider];
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setSyncResult((prev) => ({ ...prev, [provider]: { ok: false, msg: msg || "Error al sincronizar" } }));
      setSyncing(null);
    }
  }

  const linked = visible.filter((p) => p.linked);
  const advertised = visible.filter((p) => !p.linked);
  const activeInSearch = linked.filter((p) => p.inSearch !== false && !p.platformHidden).length;
  const attention = linked
    .map((p) => ({ p, ...providerRowState(p, statuses[p.provider], syncing === p.provider) }))
    .filter((r) => r.state === "attention" || r.state === "account");
  const maxSearch = subscription?.capabilities.maxSearchProviders ?? null;

  function onSearchChanged() {
    invalidateSubscription();
    void load(true);
  }

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Proveedores</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            Tus distribuidores, cómo están y qué te venden. Las cuentas son de este comercio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateListProvider && (
            <button
              type="button"
              data-tour="add-provider"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 text-xs font-medium border border-surface-700 hover:border-brand-500 text-surface-200 hover:text-white rounded-lg px-3 py-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar proveedor
            </button>
          )}
          {canEnableOwnList && !visible.some((p) => p.linked && isListProvider(p.provider)) && (
            <button
              type="button"
              onClick={handleEnableOwnList}
              disabled={enablingOwn}
              className="flex items-center gap-1.5 text-xs font-medium border border-surface-700 hover:border-brand-500 text-surface-200 hover:text-white rounded-lg px-3 py-1.5 transition-all disabled:opacity-50"
              title={ownError ?? "Publicar tu catálogo subiendo tu lista de precios"}
            >
              {enablingOwn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />} Habilitar mi lista
            </button>
          )}
          <PrefsPanel />
        </div>
      </header>

      <AddSupplierDialog open={createOpen} onClose={() => setCreateOpen(false)} kind="provider" onConnected={() => void load(true)} />

      <div className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-8">
              {/* Un comercio nuevo ve primero con quién se puede conectar. */}
              {retailer && !loading && linked.length === 0 && (
                <AvailableProviders providers={advertised} onConnected={() => void load(true)} />
              )}

              {!loading && attention.length > 0 && (
                <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4 sm:p-5">
                  <h2 className="text-sm font-semibold text-amber-300">
                    {attention.length === 1 ? "1 distribuidor necesita atención" : `${attention.length} distribuidores necesitan atención`}
                  </h2>
                  <ul className="m-0 mt-3 grid list-none gap-2.5 p-0 sm:grid-cols-2 lg:grid-cols-3">
                    {attention.slice(0, 6).map(({ p, reason }) => (
                      <li key={p.provider} className="rounded-xl border border-surface-800 bg-surface-950/60 px-3.5 py-3">
                        <ProviderBadge provider={p.provider} label={p.name} variant="inline" size="sm" />
                        <p className="mt-1.5 text-xs leading-relaxed text-surface-300">{reason}</p>
                        <Link href={`/proveedores/${p.provider}?tab=config`} className="mt-2 inline-block text-xs font-semibold text-brand-300 hover:text-white">
                          Ver qué hacer
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {!loading && linked.length > 0 && (
                <HubKpis linked={linked} statuses={statuses} showPurchases={analyticsAllowed} />
              )}

              {retailer && linked.length > 0 && (
                <p className="-mb-4 text-xs text-surface-400" data-testid="search-usage">
                  Conectados: <strong className="text-white">{linked.length}</strong>
                  <span className="mx-1.5 text-surface-600">·</span>
                  Activos en búsqueda:{" "}
                  <strong className="text-white">
                    {activeInSearch}
                    {maxSearch != null && ` / ${maxSearch}`}
                  </strong>
                  {maxSearch != null && (
                    <Link href="/suscripcion" className="ml-2 font-semibold text-brand-300 hover:text-brand-200">
                      Buscar en todos con NODO Pro
                    </Link>
                  )}
                </p>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
                </div>
              ) : linked.length === 0 ? (
                <div className="border border-surface-800 rounded-xl p-8 text-center flex flex-col gap-2">
                  <p className="text-sm text-surface-300">Todavía no estás conectado con ningún distribuidor.</p>
                  <p className="text-xs text-surface-500">
                    Elegí uno de arriba o pedile un código de acceso al distribuidor con el que ya trabajás y canjealo abajo.
                  </p>
                </div>
              ) : (
                <ProvidersTable
                  providers={linked}
                  statuses={statuses}
                  syncingProvider={syncing}
                  syncResult={syncResult}
                  retailer={retailer}
                  chatAllowed={chatAllowed}
                  onSync={handleSync}
                  onSearchChanged={onSearchChanged}
                />
              )}

              {analyticsAllowed ? <LocalPurchaseDashboard /> : <UpsellNotice capability="advancedAnalytics" compact />}

              {retailer && !loading && linked.length > 0 && advertised.length > 0 && (
                <AvailableProviders providers={advertised} onConnected={() => void load(true)} />
              )}

              <StoreProvidersSection onChanged={() => void load(true)} />

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
