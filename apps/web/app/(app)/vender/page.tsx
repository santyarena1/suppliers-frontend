"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Power } from "lucide-react";
import PrefsPanel from "@/components/PrefsPanel";
import StorefrontIntro from "@/components/storefront/StorefrontIntro";
import StorefrontOrders from "@/components/storefront/StorefrontOrders";
import StorefrontOverview from "@/components/storefront/StorefrontOverview";
import StorefrontProducts from "@/components/storefront/StorefrontProducts";
import StorefrontSettings from "@/components/storefront/StorefrontSettings";
import UpgradeOffer from "@/components/storefront/UpgradeOffer";
import { invalidateMyProviders, myApi, storefrontApi, type MyStorefront } from "@/lib/api";
import { apiError } from "@/lib/storefront";
import { capabilityAllowed, useSubscription } from "@/lib/subscription";

type Tab = "resumen" | "productos" | "pedidos" | "datos";
const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "resumen", label: "Resumen", hint: "Si tu tienda se ve, qué falta para que la vean otros comercios y qué tenés pendiente." },
  { key: "productos", label: "Productos", hint: "Lo que publicás: de dónde salen los productos, y su precio, stock y fotos." },
  { key: "pedidos", label: "Pedidos", hint: "Lo que te pidieron otros comercios: confirmás o rechazás cada pedido y coordinan pago y entrega." },
  {
    key: "datos",
    label: "Configuración",
    hint: "Cómo te ven los compradores, tus condiciones de venta, cada cuánto confirmás el stock y quién ve tu tienda.",
  },
];

export default function VenderPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-surface-500">Cargando…</div>}>
      <VenderInner />
    </Suspense>
  );
}

/** Vender en NODO (docs/PLAN_VENDER_EN_NODO.md): la tienda del comercio para los demás comercios. */
function VenderInner() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = TABS.some((t) => t.key === raw) ? (raw as Tab) : "resumen";
  const { subscription, loading: subLoading } = useSubscription();
  const [store, setStore] = useState<MyStorefront | null>(null);
  const [org, setOrg] = useState<{ name: string; phone: string | null; email: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await storefrontApi.mine();
      setStore(res.data);
      setError(null);
    } catch (err) {
      setError(apiError(err, "No se pudo cargar tu tienda"));
    }
  }, []);

  useEffect(() => {
    void reload();
    myApi
      .org()
      .then((r) => setOrg({ name: r.data.name, phone: r.data.contactPhone, email: r.data.contactEmail ?? null }))
      .catch(() => setOrg(null));
  }, [reload]);

  function go(next: Tab) {
    router.replace(next === "resumen" ? "/vender" : `/vender?tab=${next}`, { scroll: false });
  }

  function changed(next?: MyStorefront) {
    if (next) setStore(next);
    else void reload();
    // La tienda propia no se ve en el buscador propio, pero lo que se publica cambia lo que ven los demás.
    invalidateMyProviders();
  }

  const allowed = capabilityAllowed(subscription, "storefront");

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Vender en NODO</h1>
          <p className="text-xs text-surface-500 hidden sm:block">Tu stock, a la vista de los demás comercios</p>
        </div>
        <PrefsPanel />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4">
          {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
          {!store || subLoading ? (
            !error && (
              <div className="flex justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
              </div>
            )
          ) : !store.exists ? (
            <StorefrontIntro
              allowed={allowed}
              orgName={org?.name ?? "tu comercio"}
              defaultPhone={org?.phone ?? null}
              defaultEmail={org?.email ?? null}
              onOpened={(next) => {
                changed(next);
                go("productos");
              }}
            />
          ) : (
            <>
              <nav className="flex gap-1 overflow-x-auto border-b border-surface-800" aria-label="Secciones de la tienda">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => go(t.key)}
                    aria-current={tab === t.key ? "page" : undefined}
                    className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                      tab === t.key ? "border-brand-500 text-white" : "border-transparent text-surface-400 hover:text-white"
                    }`}
                  >
                    {t.label}
                    {t.key === "pedidos" && store.pendingOrders > 0 && (
                      <span className="rounded-full bg-sky-500 px-1.5 text-[10px] font-semibold leading-4 text-white">{store.pendingOrders}</span>
                    )}
                  </button>
                ))}
              </nav>
              <p className="-mt-1 text-xs text-surface-400">{TABS.find((t) => t.key === tab)?.hint}</p>
              {store.status === "CLOSED" && <ReopenCard onReopened={changed} />}
              {tab === "resumen" && <StorefrontOverview store={store} onChange={changed} onGo={go} />}
              {tab === "productos" && (
                <StorefrontProducts
                  provider={store.provider}
                  sellsOffline={store.sellsOffline}
                  defaultWarranty={store.defaultWarranty}
                  sheet={store.sheet}
                  productCount={store.productCount}
                  inStockCount={store.inStockCount}
                  onStoreChange={changed}
                  onChanged={() => changed()}
                />
              )}
              {tab === "pedidos" && <StorefrontOrders storeName={store.name} onChanged={() => changed()} />}
              {tab === "datos" && <StorefrontSettings store={store} onChange={changed} />}
            </>
          )}
          {store && <UpgradeOffer />}
        </div>
      </div>
    </>
  );
}

/** Tienda cerrada por el dueño: se reabre cuando quiera, con lo que tenga cargado. */
function ReopenCard({ onReopened }: { onReopened: (next: MyStorefront) => void }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function reopen() {
    setWorking(true);
    setError(null);
    try {
      onReopened((await storefrontApi.open({})).data);
    } catch (err) {
      setError(apiError(err, "No se pudo abrir la tienda"));
    } finally {
      setWorking(false);
    }
  }
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-surface-700 bg-surface-900 p-4">
      <Power className="h-5 w-5 text-surface-400" aria-hidden />
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-sm font-semibold text-white">Tu tienda está cerrada</p>
        <p className="text-xs text-surface-400">Nadie la ve. Abrila de nuevo cuando quieras: vuelve con tus productos y tus compradores.</p>
        {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
      </div>
      <button
        type="button"
        onClick={() => void reopen()}
        disabled={working}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
      >
        {working && <Loader2 className="h-4 w-4 animate-spin" />}
        Abrir la tienda
      </button>
    </section>
  );
}
