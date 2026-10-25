"use client";

import { useEffect, useState } from "react";
import { ordersApi, type ProviderStatus, type PurchaseInsights, type VisibleProvider } from "@/lib/api";
import { formatUSD } from "@/lib/format";
import { providerRowState } from "./ProvidersTable";

/** Las cuatro cifras de arriba de Proveedores: estado, catálogo y compras de los últimos 90 días. */
export default function HubKpis({
  linked, statuses, showPurchases,
}: {
  linked: VisibleProvider[];
  statuses: Partial<Record<string, ProviderStatus>>;
  showPurchases: boolean;
}) {
  const [insights, setInsights] = useState<PurchaseInsights | null>(null);
  useEffect(() => {
    if (!showPurchases) return;
    ordersApi.insights(90).then((r) => setInsights(r.data)).catch(() => undefined);
  }, [showPurchases]);

  const states = linked.map((p) => providerRowState(p, statuses[p.provider], false).state);
  const ok = states.filter((s) => s === "ok" || s === "list").length;
  const attention = states.filter((s) => s === "attention" || s === "account" || s === "stale").length;
  const products = linked.reduce((sum, p) => sum + (statuses[p.provider]?.total ?? 0), 0);
  const withStock = linked.reduce((sum, p) => sum + (statuses[p.provider]?.withStock ?? 0), 0);
  const top = insights?.byProvider?.[0];
  const ar = (n: number) => n.toLocaleString("es-AR");

  const tiles: { label: string; value: string; sub: string }[] = [
    { label: "Conectados y al día", value: `${ok} de ${linked.length}`, sub: attention ? `${attention} necesita${attention === 1 ? "" : "n"} atención` : "Ninguno con problemas" },
    { label: "Productos en tu catálogo", value: ar(products), sub: `${ar(withStock)} con stock` },
    ...(insights
      ? [
          { label: "Comprado · 90 días", value: formatUSD(insights.kpis.spendUsd), sub: `${ar(insights.kpis.orders)} pedidos · ticket ${formatUSD(insights.kpis.avgTicketUsd)}` },
          ...(top ? [{ label: "Le comprás más a", value: top.label, sub: `${top.share.toLocaleString("es-AR", { maximumFractionDigits: 1 })} % de lo comprado` }] : []),
        ]
      : []),
  ];

  return (
    <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-surface-800 bg-surface-900 px-4 py-3.5">
          <dt className="text-xs font-semibold text-surface-400">{t.label}</dt>
          <dd className="m-0 mt-1.5 truncate font-mono text-2xl font-semibold tabular-nums text-white" title={t.value}>{t.value}</dd>
          <p className="m-0 mt-1 text-xs text-surface-500">{t.sub}</p>
        </div>
      ))}
    </dl>
  );
}
