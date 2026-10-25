"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ordersApi, providersApi, type CatalogSyncRun, type Provider, type ProviderConfig, type ProviderStatus, type TenantOrder } from "@/lib/api";
import { formatUSD } from "@/lib/format";
import { sumOrderLines } from "@/lib/order-lines";

const card = "rounded-xl border border-surface-800 bg-surface-900";
const head = "flex items-center justify-between gap-2 border-b border-surface-800 px-4 py-3";
const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

/** Resumen de un distribuidor: la cuenta, cómo se le compra, últimos pedidos y actualizaciones. */
export default function ProviderSummaryTab({
  provider, status, config, listPriced, onGo,
}: {
  provider: Provider;
  status: ProviderStatus | null;
  config: ProviderConfig | null;
  listPriced: boolean;
  onGo: (tab: "config" | "sync" | "lists" | "orders" | "credentials") => void;
}) {
  const [orders, setOrders] = useState<TenantOrder[] | null>(null);
  const [runs, setRuns] = useState<CatalogSyncRun[] | null>(null);
  useEffect(() => {
    ordersApi.list().then((r) => setOrders(r.data.filter((o) => o.provider === provider))).catch(() => setOrders([]));
    if (!listPriced) providersApi.syncRunsPage(provider, { take: 40 }).then((r) => {
      // Solo las de las últimas 48 horas.
      const since = Date.now() - 48 * 3600 * 1000;
      setRuns(r.data.items.filter((x) => new Date(x.startedAt).getTime() >= since));
    }).catch(() => setRuns([]));
  }, [provider, listPriced]);

  const habitual = config?.shippingMethods?.find((m) => (m as { habitual?: boolean }).habitual) ?? config?.shippingMethods?.[0];
  const recent = runs ?? [];
  const failed = recent.filter((r) => r.status === "ERROR").length;
  const rows: [string, string][] = [
    ["Cuenta del portal", status?.hasCredentials ? "Cargada" : status?.publicCatalog ? "Catálogo público" : listPriced ? "Precios por lista" : "Sin cargar"],
    ["Precios", listPriced ? "Por la lista que subís" : "Desde tu cuenta, automáticos"],
    ["Se actualizan", listPriced ? "Cuando subís una lista" : config?.enabled ? `Cada ${Math.round((config.syncIntervalMinutes ?? 0) / 60)} h, de 6 a 23` : "Solo a mano"],
    ["Última actualización", when(status?.lastSyncedAt ?? config?.lastSyncedAt)],
  ];
  const buy: [string, string][] = [
    ["Envío habitual", habitual ? (habitual as { name?: string; label?: string }).name ?? (habitual as { label?: string }).label ?? "—" : "Según tus pedidos"],
    ["Formas de pago cargadas", String(config?.paymentOptions?.length ?? 0)],
    ["Percepción IIBB", config?.manualIibbPercent != null ? `${config.manualIibbPercent} %` : "La que informe el portal"],
    ["Pedido offline", config?.acceptsOffline ? "Activado" : "No"],
    ["Esquema", config?.acceptsScheme ? `Activado${config.schemeDiscountPercent ? ` · ${config.schemeDiscountPercent} %` : ""}` : "No"],
  ];

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2" data-tour="provider-tab-content">
      <div className="flex flex-col gap-4">
        <section className={card} aria-label="Tu cuenta">
          <div className={head}><h2 className="text-sm font-semibold text-white">Tu cuenta</h2><button type="button" onClick={() => onGo("credentials")} className="text-xs font-semibold text-brand-300 hover:text-white">Configurar</button></div>
          <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2.5 px-4 py-3 text-sm">
            {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-surface-400">{k}</dt><dd className="m-0 text-right text-white">{v}</dd></div>)}
          </dl>
        </section>
        <section className={card} aria-label="Cómo le comprás">
          <div className={head}><h2 className="text-sm font-semibold text-white">Cómo le comprás</h2><button type="button" onClick={() => onGo("config")} className="text-xs font-semibold text-brand-300 hover:text-white">Configurar</button></div>
          <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2.5 px-4 py-3 text-sm">
            {buy.map(([k, v]) => <div key={k} className="contents"><dt className="text-surface-400">{k}</dt><dd className="m-0 text-right text-white">{v}</dd></div>)}
          </dl>
        </section>
      </div>

      <div className="flex flex-col gap-4">
        <section className={card} aria-label="Últimos pedidos desde NODO">
          <div className={head}><h2 className="text-sm font-semibold text-white">Últimos pedidos desde NODO</h2><Link href="/pedidos" className="text-xs font-semibold text-brand-300 hover:text-white">Ver todos</Link></div>
          {orders == null ? (
            <p className="px-4 py-4 text-sm text-surface-500">Cargando…</p>
          ) : orders.length === 0 ? (
            <p className="px-4 py-4 text-sm text-surface-400">Todavía no le hiciste pedidos desde NODO.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {orders.slice(0, 5).map((o) => {
                const t = sumOrderLines(o.items);
                return (
                  <li key={o.id} className="flex items-center justify-between gap-3 border-b border-surface-800/70 px-4 py-2.5 text-sm last:border-0">
                    <span className="min-w-0">
                      <span className="block text-white">{new Date(o.createdAt).toLocaleDateString("es-AR")} {o.orderNumber || o.webOrderNumber ? <span className="font-mono text-xs text-surface-400">#{o.orderNumber || o.webOrderNumber}</span> : null}</span>
                      <span className="block truncate text-xs text-surface-500">{o.items.length} producto{o.items.length === 1 ? "" : "s"}{o.deliveryLabel ? ` · ${o.deliveryLabel}` : ""}</span>
                    </span>
                    <span className="whitespace-nowrap font-mono tabular-nums text-white">{t.final > 0 ? formatUSD(t.final) : "—"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {!listPriced && (
          <section className={card} aria-label="Actualizaciones">
            <div className={head}><h2 className="text-sm font-semibold text-white">Actualizaciones · últimas 48 h</h2><button type="button" onClick={() => onGo("sync")} className="text-xs font-semibold text-brand-300 hover:text-white">Ver todas</button></div>
            <div className="px-4 py-3">
              <p className="text-sm text-surface-300">
                {runs == null ? "Cargando…" : recent.length ? `${recent.length - failed} de ${recent.length} salieron bien${failed ? `, ${failed} con error` : ""}.` : "No hubo actualizaciones en las últimas 48 horas."}
              </p>
              {recent.length > 0 && (
                <div className="mt-3 flex h-12 items-end gap-[3px]" aria-hidden>
                  {recent.slice().reverse().map((r) => (
                    <span key={r.id} title={`${when(r.startedAt)} · ${r.status === "ERROR" ? "error" : `${r.created} nuevos, ${r.updated} cambios`}`} className={`min-w-[4px] flex-1 rounded-sm ${r.status === "ERROR" ? "h-full bg-red-400" : r.created > 0 ? "h-[90%] bg-emerald-400" : "h-3/5 bg-emerald-700"}`} />
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-surface-500">Cada barra es una actualización; las más altas trajeron productos nuevos y las rojas tuvieron error.</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
