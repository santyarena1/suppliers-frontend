"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpDown,
  Download,
  LayoutDashboard,
  Loader2,
  Package,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  ordersApi,
  type PurchaseInsights,
  type PurchaseProductRow,
  type PurchaseRankRow,
} from "@/lib/api";
import { formatUSD, proxyImg } from "@/lib/format";
import ProviderBadge from "@/components/ProviderBadge";
import { ChannelPie, MixPie, RankBarChart, ShippingMonthChart, SpendAreaChart, WeekdayBars } from "./InsightCharts";

const PERIODS: { days: number; label: string }[] = [
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
  { days: 365, label: "12 meses" },
  { days: 0, label: "Todo" },
];

type Tab = "resumen" | "distribuidores" | "marcas" | "categorias" | "productos" | "envios" | "pagos" | "direcciones";

type Focus = { kind: "brand" | "category" | "provider"; key: string; label: string } | null;

type ProductSort = "spendUsd" | "qty" | "orders" | "name" | "lastPaidUsd";

const TABS: { id: Tab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "distribuidores", label: "Distribuidores" },
  { id: "marcas", label: "Marcas" },
  { id: "categorias", label: "Categorías" },
  { id: "productos", label: "Productos" },
  { id: "envios", label: "Envíos" },
  { id: "pagos", label: "Pagos" },
  { id: "direcciones", label: "Direcciones" },
];

function pct(n: number) {
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

function qty(n: number) {
  return n.toLocaleString("es-AR");
}

function pesos(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);
}

function formatFreight(usd: number, ars: number) {
  const parts: string[] = [];
  if (usd > 0) parts.push(formatUSD(usd));
  if (ars > 0) parts.push(pesos(ars));
  return parts.join(" · ") || "—";
}

function when(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" });
}

function downloadCsv(filename: string, rows: string[][]) {
  const body = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LocalPurchaseDashboard() {
  const [days, setDays] = useState(90);
  const [tab, setTab] = useState<Tab>("resumen");
  const [focus, setFocus] = useState<Focus>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<ProductSort>("spendUsd");
  const [selected, setSelected] = useState<PurchaseProductRow | null>(null);
  const [data, setData] = useState<PurchaseInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    ordersApi
      .insights(days)
      .then((res) => {
        if (!alive) return;
        setData(res.data);
        setSelected(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setError(msg || "No se pudo cargar el tablero de este comercio");
        setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [days]);

  const products = useMemo(() => {
    if (!data) return [];
    let rows = data.topProducts;
    if (focus?.kind === "brand") rows = rows.filter((p) => p.brand === focus.key);
    if (focus?.kind === "category") rows = rows.filter((p) => p.category === focus.key);
    if (focus?.kind === "provider") rows = rows.filter((p) => p.provider === focus.key);
    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((p) =>
        [p.name, p.sku, p.brand, p.category, p.providerName].join(" ").toLowerCase().includes(needle)
      );
    }
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "es");
      return Number(b[sort]) - Number(a[sort]);
    });
    return copy;
  }, [data, focus, q, sort]);

  function openRank(kind: "brand" | "category" | "provider", row: PurchaseRankRow) {
    setFocus({ kind, key: row.key, label: row.label });
    setTab("productos");
    setSelected(null);
  }

  function exportProducts() {
    if (!data) return;
    downloadCsv(`compras-${data.tenantName.replace(/\s+/g, "-").toLowerCase()}-${days || "todo"}.csv`, [
      ["SKU", "Producto", "Marca", "Categoría", "Distribuidor", "Unidades", "Pedidos", "Comprado USD", "Último pago", "Precio actual", "Stock"],
      ...products.map((p) => [
        p.sku,
        p.name,
        p.brand,
        p.category,
        p.providerName,
        String(p.qty),
        String(p.orders),
        String(p.spendUsd),
        String(p.lastPaidUsd),
        p.currentUsd == null ? "" : String(p.currentUsd),
        p.stock == null ? "" : String(p.stock),
      ]),
    ]);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4 text-brand-400" />
            Compras de este local
          </h2>
          <p className="text-xs text-surface-500 mt-0.5">
            {data ? `${data.tenantName} · ` : ""}
            solo este comercio, no se mezclan otros locales. Pedidos al portal y offline.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-surface-900 border border-surface-800 rounded-lg p-0.5 self-start">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`text-[11px] font-medium px-2.5 py-1.5 rounded-md transition-all ${
                days === p.days ? "bg-brand-600 text-white" : "text-surface-400 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-surface-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-xs font-medium px-3 py-2 border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id ? "border-brand-500 text-white" : "border-transparent text-surface-500 hover:text-surface-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-surface-500 gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
          Armando el tablero de este comercio…
        </div>
      )}

      {error && (
        <div className="border border-red-500/30 bg-red-500/10 rounded-xl px-4 py-3 text-sm text-red-200">{error}</div>
      )}

      {!loading && !error && data && data.kpis.orders === 0 && (
        <div className="border border-surface-800 rounded-xl p-8 text-center">
          <Package className="w-8 h-8 text-surface-600 mx-auto mb-2" />
          <p className="text-sm text-surface-300">Todavía no hay compras registradas en este período.</p>
          <p className="text-xs text-surface-500 mt-1">
            Cuando confirmes pedidos al portal o offline, acá vas a ver marcas, categorías, distribuidores y el detalle de cada producto.
          </p>
          {data.kpis.catalogSkus > 0 && (
            <p className="text-xs text-surface-500 mt-3">
              Catálogo de este local: {qty(data.kpis.catalogSkus)} SKUs · {qty(data.kpis.catalogInStock)} con stock
            </p>
          )}
        </div>
      )}

      {!loading && data && data.kpis.orders > 0 && (
        <>
          {data.truncated && (
            <p className="text-[11px] text-amber-300">
              Se tomaron los últimos 5.000 pedidos de este comercio. El recorte no incluye otros locales.
            </p>
          )}

          {tab === "resumen" && <Resumen data={data} onOpen={openRank} />}
          {tab === "distribuidores" && (
            <RankDetail
              title="Distribuidores más comprados"
              hint="Share de spend de este local. El catálogo de la derecha es el de tu cuenta en ese proveedor."
              rows={data.byProvider}
              extra={(row) => {
                const p = data.byProvider.find((x) => x.key === row.key);
                return p ? `${qty(p.catalogInStock)} / ${qty(p.catalogSkus)} en stock` : "";
              }}
              onRow={(row) => openRank("provider", row)}
              color="#22d3ee"
            />
          )}
          {tab === "marcas" && (
            <div className="flex flex-col gap-4">
              <RankDetail
                title="Marcas más compradas"
                hint="Marca resuelta contra el catálogo de este comercio. Si el SKU no está sincronizado, figura como Sin marca."
                rows={data.byBrand}
                onRow={(row) => openRank("brand", row)}
                color="#a78bfa"
              />
              {data.brandProviders.length > 0 && (
                <Card title="Dónde comprás cada marca">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-surface-500">
                        <tr className="border-b border-surface-800">
                          <th className="text-left font-medium py-2">Marca</th>
                          <th className="text-left font-medium py-2">Distribuidor</th>
                          <th className="text-right font-medium py-2">Unidades</th>
                          <th className="text-right font-medium py-2">Comprado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.brandProviders.slice(0, 40).map((row) => (
                          <tr key={`${row.brand}-${row.provider}`} className="border-b border-surface-800/60">
                            <td className="py-1.5 text-surface-200">{row.brand}</td>
                            <td className="py-1.5">
                              <ProviderBadge provider={row.provider} size="sm" />
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-surface-400">{qty(row.units)}</td>
                            <td className="py-1.5 text-right tabular-nums text-white">{formatUSD(row.spendUsd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}
          {tab === "categorias" && (
            <div className="grid lg:grid-cols-2 gap-4">
              <RankDetail
                title="Categorías"
                rows={data.byCategory}
                onRow={(row) => openRank("category", row)}
                color="#34d399"
              />
              <RankDetail title="Subcategorías" rows={data.bySubcategory} color="#fbbf24" />
            </div>
          )}
          {tab === "productos" && (
            <ProductsPanel
              products={products}
              focus={focus}
              q={q}
              sort={sort}
              selected={selected}
              onClearFocus={() => setFocus(null)}
              onQuery={setQ}
              onSort={setSort}
              onSelect={setSelected}
              onExport={exportProducts}
            />
          )}
          {tab === "envios" && <EnviosPanel data={data} />}
          {tab === "pagos" && <PagosPanel data={data} />}
          {tab === "direcciones" && <DireccionesPanel data={data} />}
        </>
      )}
    </section>
  );
}

function Resumen({
  data,
  onOpen,
}: {
  data: PurchaseInsights;
  onOpen: (kind: "brand" | "category" | "provider", row: PurchaseRankRow) => void;
}) {
  const k = data.kpis;
  const delta = k.spendDeltaPercent;
  const up = delta != null && delta > 0;
  const down = delta != null && delta < 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Comprado"
          value={formatUSD(k.spendUsd)}
          hint={
            delta == null
              ? "USD de ítems del período"
              : `${up ? "+" : ""}${pct(delta)} vs período anterior`
          }
          trend={up ? "up" : down ? "down" : undefined}
        />
        <Kpi label="Pedidos" value={qty(k.orders)} hint={`Ticket ${formatUSD(k.avgTicketUsd)}`} />
        <Kpi label="Unidades" value={qty(k.units)} hint={`${k.avgUnitsPerOrder} por pedido`} />
        <Kpi
          label="Catálogo de este local"
          value={qty(k.catalogSkus)}
          hint={`${qty(k.catalogInStock)} con stock${k.lastSyncAt ? ` · sync ${when(k.lastSyncAt)}` : ""}`}
        />
        <Kpi label="SKUs comprados" value={qty(k.uniqueSkus)} hint={`${pct(k.repeatSkuShare)} se recompraron`} />
        <Kpi label="Marcas" value={qty(k.uniqueBrands)} hint={`${qty(k.uniqueCategories)} categorías`} />
        <Kpi label="Distribuidores" value={qty(k.providersUsed)} hint={`Top 1 = ${pct(data.concentration.providers.top1)}`} />
        <Kpi label="Importe de pedidos" value={formatUSD(k.orderTotalUsd)} hint="Totales guardados (puede incluir IVA/envío)" />
        <Kpi
          label="Gastado en envíos"
          value={formatFreight(k.shippingUsd ?? data.ops?.kpis.shippingUsd ?? 0, k.shippingArs ?? data.ops?.kpis.shippingArs ?? 0)}
          hint="New Bytes cotiza en pesos. Elit/Invid en USD solo si el pedido guardó el flete. No se convierte."
        />
        <Kpi
          label="Retiro vs envío"
          value={`${qty(k.pickupOrders ?? data.ops?.kpis.pickupOrders ?? 0)} / ${qty(k.shippingOrders ?? data.ops?.kpis.shippingOrders ?? 0)}`}
          hint="Retiros · envíos. Lo que no informa el proveedor queda sin dato."
        />
        <Kpi
          label="IVA / internos"
          value={formatUSD(k.taxesUsd ?? data.ops?.kpis.taxesUsd ?? 0)}
          hint={`Percepciones ${formatUSD(k.perceptionsUsd ?? data.ops?.kpis.perceptionsUsd ?? 0)}`}
        />
        <Kpi
          label="Medios de pago"
          value={qty(k.uniquePayments ?? data.ops?.kpis.uniquePayments ?? 0)}
          hint={`${qty(k.uniqueAddresses ?? data.ops?.kpis.uniqueAddresses ?? 0)} direcciones distintas`}
        />
      </div>

      {data.concentration.providers.top1 >= 60 && (
        <div className="flex items-start gap-2 border border-amber-500/30 bg-amber-500/10 rounded-xl px-4 py-3 text-xs text-amber-100">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          El {pct(data.concentration.providers.top1)} de lo comprado en este local sale de un solo distribuidor. El top 5 cubre {pct(data.concentration.providers.top5)}.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-3">
        <Card title="Evolución mensual" className="lg:col-span-2">
          <SpendAreaChart data={data.byMonth} />
        </Card>
        <Card title="Canal">
          <ChannelPie data={data.channelMix} />
          <ul className="text-[11px] text-surface-400 space-y-1 mt-1">
            {data.channelMix.map((c) => (
              <li key={c.channel} className="flex justify-between">
                <span>{c.channel === "OFFLINE" ? "Offline (Nodo)" : "Portal"}</span>
                <span className="tabular-nums text-surface-200">
                  {formatUSD(c.spendUsd)} · {c.orders} ped. · {pct(c.share)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card title="Por día de la semana">
          <WeekdayBars data={data.byWeekday} />
        </Card>
        <Card title="Concentración">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <ConcBlock title="Distribuidores" values={data.concentration.providers} />
            <ConcBlock title="Marcas" values={data.concentration.brands} />
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <MiniRank title="Top distribuidores" rows={data.byProvider} onPick={(r) => onOpen("provider", r)} />
        <MiniRank title="Top marcas" rows={data.byBrand} onPick={(r) => onOpen("brand", r)} />
        <MiniRank title="Top categorías" rows={data.byCategory} onPick={(r) => onOpen("category", r)} />
      </div>

      <Card title="Pedidos recientes de este local">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-surface-500">
              <tr className="border-b border-surface-800">
                <th className="text-left font-medium py-2">Fecha</th>
                <th className="text-left font-medium py-2">Distribuidor</th>
                <th className="text-left font-medium py-2">Canal</th>
                <th className="text-right font-medium py-2">SKUs</th>
                <th className="text-right font-medium py-2">Unid.</th>
                <th className="text-right font-medium py-2">Importe</th>
              </tr>
            </thead>
            <tbody>
              {data.recentOrders.map((o) => (
                <tr key={o.id} className="border-b border-surface-800/60">
                  <td className="py-1.5 text-surface-400">{when(o.createdAt)}</td>
                  <td className="py-1.5">
                    <ProviderBadge provider={o.provider} label={o.providerName} size="sm" />
                  </td>
                  <td className="py-1.5">
                    <span className={o.channel === "OFFLINE" ? "text-amber-300" : "text-violet-300"}>
                      {o.channel === "OFFLINE" ? "Offline" : "Portal"}
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{o.skus}</td>
                  <td className="py-1.5 text-right tabular-nums">{o.units}</td>
                  <td className="py-1.5 text-right tabular-nums text-white">{formatUSD(o.spendUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link href="/pedidos" className="inline-block mt-3 text-[11px] text-brand-400 hover:text-brand-300">
          Ver todos los pedidos →
        </Link>
      </Card>
    </div>
  );
}

function RankDetail({
  title,
  hint,
  rows,
  extra,
  onRow,
  color,
}: {
  title: string;
  hint?: string;
  rows: PurchaseRankRow[];
  extra?: (row: PurchaseRankRow) => string;
  onRow?: (row: PurchaseRankRow) => void;
  color: string;
}) {
  return (
    <Card title={title} hint={hint}>
      <RankBarChart data={rows} color={color} />
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-xs">
          <thead className="text-surface-500">
            <tr className="border-b border-surface-800">
              <th className="text-left font-medium py-2">Nombre</th>
              <th className="text-right font-medium py-2">Share</th>
              <th className="text-right font-medium py-2">Unid.</th>
              <th className="text-right font-medium py-2">Pedidos</th>
              <th className="text-right font-medium py-2">Comprado</th>
              <th className="text-right font-medium py-2">Última</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                onClick={() => onRow?.(row)}
                className={`border-b border-surface-800/60 ${onRow ? "cursor-pointer hover:bg-surface-800/40" : ""}`}
              >
                <td className="py-1.5 text-surface-200">
                  {row.label}
                  {extra ? <span className="block text-[10px] text-surface-500">{extra(row)}</span> : null}
                </td>
                <td className="py-1.5 text-right tabular-nums text-surface-400">{pct(row.share)}</td>
                <td className="py-1.5 text-right tabular-nums">{qty(row.units)}</td>
                <td className="py-1.5 text-right tabular-nums">{row.orders}</td>
                <td className="py-1.5 text-right tabular-nums text-white">{formatUSD(row.spendUsd)}</td>
                <td className="py-1.5 text-right text-surface-500">{when(row.lastBoughtAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onRow && <p className="text-[10px] text-surface-600 mt-2">Clic en una fila para ver los productos de ese recorte.</p>}
    </Card>
  );
}

function ProductsPanel({
  products,
  focus,
  q,
  sort,
  selected,
  onClearFocus,
  onQuery,
  onSort,
  onSelect,
  onExport,
}: {
  products: PurchaseProductRow[];
  focus: Focus;
  q: string;
  sort: ProductSort;
  selected: PurchaseProductRow | null;
  onClearFocus: () => void;
  onQuery: (v: string) => void;
  onSort: (v: ProductSort) => void;
  onSelect: (p: PurchaseProductRow | null) => void;
  onExport: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        {focus && (
          <button
            onClick={onClearFocus}
            className="flex items-center gap-1 text-[11px] bg-brand-600/20 text-brand-200 border border-brand-500/30 rounded-full px-2.5 py-1"
          >
            {focus.kind === "brand" ? "Marca" : focus.kind === "category" ? "Categoría" : "Distribuidor"}: {focus.label}
            <X className="w-3 h-3" />
          </button>
        )}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-surface-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Buscar producto, SKU, marca…"
            className="w-full bg-surface-900 border border-surface-800 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder:text-surface-600"
          />
        </div>
        <button
          onClick={onExport}
          className="flex items-center justify-center gap-1.5 text-xs border border-surface-700 hover:border-surface-500 text-surface-300 rounded-lg px-3 py-2"
        >
          <Download className="w-3.5 h-3.5" />
          CSV
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-3">
        <Card title={`${qty(products.length)} productos de este local`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-surface-500">
                <tr className="border-b border-surface-800">
                  <SortTh active={sort === "name"} onClick={() => onSort("name")}>
                    Producto
                  </SortTh>
                  <th className="text-left font-medium py-2">Marca</th>
                  <th className="text-left font-medium py-2">Dist.</th>
                  <SortTh active={sort === "qty"} onClick={() => onSort("qty")} right>
                    Unid.
                  </SortTh>
                  <SortTh active={sort === "orders"} onClick={() => onSort("orders")} right>
                    Ped.
                  </SortTh>
                  <SortTh active={sort === "spendUsd"} onClick={() => onSort("spendUsd")} right>
                    Comprado
                  </SortTh>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr
                    key={`${p.provider}-${p.sku}`}
                    onClick={() => onSelect(p)}
                    className={`border-b border-surface-800/60 cursor-pointer hover:bg-surface-800/40 ${
                      selected?.sku === p.sku && selected?.provider === p.provider ? "bg-brand-600/10" : ""
                    }`}
                  >
                    <td className="py-1.5 pr-2">
                      <p className="text-surface-100 line-clamp-2">{p.name}</p>
                      <p className="text-[10px] text-surface-500">{p.sku}</p>
                    </td>
                    <td className="py-1.5 text-surface-400">{p.brand}</td>
                    <td className="py-1.5">
                      <ProviderBadge provider={p.provider} size="sm" />
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{qty(p.qty)}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.orders}</td>
                    <td className="py-1.5 text-right tabular-nums text-white">{formatUSD(p.spendUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Detalle">
          {!selected && (
            <p className="text-xs text-surface-500 py-8 text-center">Elegí un producto para ver el detalle.</p>
          )}
          {selected && (
            <div className="flex flex-col gap-3 text-xs">
              {selected.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxyImg(selected.imageUrl)}
                  alt=""
                  className="w-full h-32 object-contain bg-surface-950 rounded-lg border border-surface-800"
                />
              )}
              <div>
                <p className="text-sm text-white font-medium leading-snug">{selected.name}</p>
                <p className="text-surface-500 mt-0.5">{selected.sku}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                <Dt>Marca</Dt>
                <Dd>{selected.brand}</Dd>
                <Dt>Categoría</Dt>
                <Dd>{selected.category}</Dd>
                <Dt>Subcategoría</Dt>
                <Dd>{selected.subcategory}</Dd>
                <Dt>Distribuidor</Dt>
                <Dd>{selected.providerName}</Dd>
                <Dt>Unidades</Dt>
                <Dd>{qty(selected.qty)}</Dd>
                <Dt>Pedidos</Dt>
                <Dd>{selected.orders}</Dd>
                <Dt>Comprado</Dt>
                <Dd>{formatUSD(selected.spendUsd)}</Dd>
                <Dt>Último pago</Dt>
                <Dd>{formatUSD(selected.lastPaidUsd)}</Dd>
                <Dt>Precio actual</Dt>
                <Dd>
                  {selected.currentUsd == null ? "—" : formatUSD(selected.currentUsd)}
                  {selected.deltaPercent != null && (
                    <span className={selected.deltaPercent > 0 ? " text-red-400" : selected.deltaPercent < 0 ? " text-emerald-400" : ""}>
                      {" "}
                      ({selected.deltaPercent > 0 ? "+" : ""}
                      {pct(selected.deltaPercent)})
                    </span>
                  )}
                </Dd>
                <Dt>Stock hoy</Dt>
                <Dd>{selected.stock == null ? "—" : qty(selected.stock)}</Dd>
                <Dt>Última compra</Dt>
                <Dd>{when(selected.lastBoughtAt)}</Dd>
              </dl>
              <Link
                href={`/product/${selected.provider}/${encodeURIComponent(selected.sku)}`}
                className="text-center text-[11px] font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg py-2"
              >
                Abrir ficha
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function SortTh({
  children,
  active,
  onClick,
  right,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
  right?: boolean;
}) {
  return (
    <th className={`${right ? "text-right" : "text-left"} font-medium py-2`}>
      <button onClick={onClick} className={`inline-flex items-center gap-1 ${active ? "text-white" : ""}`}>
        {children}
        <ArrowUpDown className="w-3 h-3" />
      </button>
    </th>
  );
}

function Card({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-surface-900 border border-surface-800 rounded-xl p-4 ${className}`}>
      <h3 className="text-xs font-semibold text-white mb-1">{title}</h3>
      {hint && <p className="text-[11px] text-surface-500 mb-3">{hint}</p>}
      {children}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: "up" | "down";
}) {
  return (
    <div className="bg-surface-900 border border-surface-800 rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wider text-surface-500">{label}</p>
      <p className="text-lg font-semibold text-white tabular-nums mt-0.5 flex items-center gap-1">
        {value}
        {trend === "up" && <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
        {trend === "down" && <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
      </p>
      {hint && <p className="text-[11px] text-surface-500 mt-0.5">{hint}</p>}
    </div>
  );
}

function ConcBlock({ title, values }: { title: string; values: { top1: number; top5: number; top10: number } }) {
  return (
    <div>
      <p className="text-surface-400 mb-2">{title}</p>
      {[
        ["Top 1", values.top1],
        ["Top 5", values.top5],
        ["Top 10", values.top10],
      ].map(([label, n]) => (
        <div key={String(label)} className="mb-2">
          <div className="flex justify-between text-surface-300 mb-0.5">
            <span>{label}</span>
            <span className="tabular-nums">{pct(Number(n))}</span>
          </div>
          <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.min(100, Number(n))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniRank({
  title,
  rows,
  onPick,
}: {
  title: string;
  rows: PurchaseRankRow[];
  onPick: (row: PurchaseRankRow) => void;
}) {
  return (
    <Card title={title}>
      <ul className="flex flex-col gap-1.5">
        {rows.slice(0, 6).map((row, i) => (
          <li key={row.key}>
            <button
              onClick={() => onPick(row)}
              className="w-full flex items-center gap-2 text-left text-xs hover:bg-surface-800/50 rounded-lg px-1 py-1"
            >
              <span className="text-surface-600 w-4 tabular-nums">{i + 1}</span>
              <span className="flex-1 text-surface-200 truncate">{row.label}</span>
              <span className="tabular-nums text-surface-400">{pct(row.share)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Dt({ children }: { children: ReactNode }) {
  return <dt className="text-surface-500">{children}</dt>;
}

function Dd({ children }: { children: ReactNode }) {
  return <dd className="text-surface-200 text-right">{children}</dd>;
}

function EmptyOps({ text }: { text: string }) {
  return <p className="text-xs text-surface-500 py-6 text-center">{text}</p>;
}

function EnviosPanel({ data }: { data: PurchaseInsights }) {
  const ops = data.ops;
  if (!ops) return <EmptyOps text="El tablero todavía no trajo el detalle de envíos." />;
  const k = ops.kpis;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-surface-500 leading-relaxed">
        New Bytes cotiza el envío en pesos y acá se muestra en pesos: no se convierte a dólares.
        Elit/Invid/Air solo suman flete en USD si el pedido guardó el costo. No se estima restando IVA.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Pedidos con envío" value={qty(k.shippingOrders)} hint={`${pct(k.shippingOrders && data.kpis.orders ? (k.shippingOrders / data.kpis.orders) * 100 : 0)} del período`} />
        <Kpi
          label="Flete en pesos"
          value={pesos(k.shippingArs ?? 0)}
          hint={k.avgShippingArs ? `Promedio ${pesos(k.avgShippingArs)} · cotización New Bytes` : "Ningún pedido guardó cotización en pesos"}
        />
        <Kpi
          label="Flete en dólares"
          value={formatUSD(k.shippingUsd ?? 0)}
          hint={k.avgShippingUsd ? `Promedio ${formatUSD(k.avgShippingUsd)} · shippingCost del pedido` : "Elit/Invid casi no guardan el flete"}
        />
        <Kpi label="Retiros" value={qty(k.pickupOrders)} hint={`${qty(k.unknownFulfillment)} sin dato de entrega`} />
        {k.dropShippingOrders > 0 && <Kpi label="Dropshipping" value={qty(k.dropShippingOrders)} hint="Marca blanca / envío al cliente final" />}
      </div>
      <div className="grid lg:grid-cols-3 gap-3">
        <Card title="Cómo salen los pedidos" className="lg:col-span-1">
          <MixPie
            data={ops.fulfillmentMix.map((r) => ({ name: r.label, value: r.orders, share: r.share }))}
            colors={["#f59e0b", "#22d3ee", "#71717a"]}
          />
          <ul className="text-[11px] text-surface-400 space-y-1 mt-1">
            {ops.fulfillmentMix.map((r) => (
              <li key={r.key} className="flex justify-between">
                <span>{r.label}</span>
                <span className="tabular-nums text-surface-200">{r.orders} · {pct(r.share)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Flete por mes" className="lg:col-span-2" hint="Suma de costos que el pedido trajo guardados, en la moneda original. No se convierte ni se estima con el IVA.">
          <ShippingMonthChart data={ops.shippingByMonth} />
        </Card>
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        <Card title="Modos de entrega">
          {ops.byDelivery.length === 0 ? <EmptyOps text="Ningún pedido guardó etiqueta de entrega." /> : (
            <NamedTable
              rows={ops.byDelivery}
              extraHeader="Flete"
              extra={(r) => formatFreight(r.extraUsd ?? 0, r.extraArs ?? 0)}
            />
          )}
        </Card>
        <Card title="Flete por distribuidor">
          {ops.shippingByProvider.every((p) => (p.shippingUsd ?? 0) === 0 && (p.shippingArs ?? 0) === 0) ? (
            <EmptyOps text="Ningún distribuidor informó costo de envío en este período." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-surface-500">
                  <tr className="border-b border-surface-800">
                    <th className="text-left font-medium py-2">Distribuidor</th>
                    <th className="text-right font-medium py-2">Pedidos</th>
                    <th className="text-right font-medium py-2">Flete USD</th>
                    <th className="text-right font-medium py-2">Flete ARS</th>
                  </tr>
                </thead>
                <tbody>
                  {ops.shippingByProvider.map((row) => (
                    <tr key={row.provider} className="border-b border-surface-800/60">
                      <td className="py-1.5"><ProviderBadge provider={row.provider} label={row.label} size="sm" /></td>
                      <td className="py-1.5 text-right tabular-nums">{row.orders}</td>
                      <td className="py-1.5 text-right tabular-nums text-white">{row.shippingUsd > 0 ? formatUSD(row.shippingUsd) : "—"}</td>
                      <td className="py-1.5 text-right tabular-nums text-white">{row.shippingArs > 0 ? pesos(row.shippingArs) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function PagosPanel({ data }: { data: PurchaseInsights }) {
  const ops = data.ops;
  if (!ops) return <EmptyOps text="El tablero todavía no trajo el detalle de pagos." />;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Medios distintos" value={qty(ops.kpis.uniquePayments)} hint="Según la etiqueta que guardó cada checkout" />
        <Kpi label="IVA / internos" value={formatUSD(ops.kpis.taxesUsd)} hint="Campo impuestos del pedido" />
        <Kpi label="Percepciones" value={formatUSD(ops.kpis.perceptionsUsd)} hint="IIBB y percepciones informadas" />
        <Kpi label="Neto de ítems" value={formatUSD(ops.kpis.subtotalUsd)} hint="Subtotal guardado, sin flete" />
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        <Card title="Formas de pago" hint="Transferencia, cuenta corriente, efectivo, factura al cliente, etc.">
          {ops.byPayment.length === 0 ? <EmptyOps text="Ningún pedido guardó medio de pago." /> : (
            <>
              <RankBarChart data={ops.byPayment.map((r) => ({ label: r.label, spendUsd: r.spendUsd }))} color="#34d399" />
              <NamedTable rows={ops.byPayment} />
            </>
          )}
        </Card>
        <Card title="Quién arma los pedidos" hint="Usuario de Nodo que confirmó el checkout en este local.">
          {ops.byBuyer.length === 0 ? <EmptyOps text="Los pedidos no trajeron autor." /> : <NamedTable rows={ops.byBuyer} />}
        </Card>
      </div>
      <Card title="A qué hora se confirman" hint="Hora de Argentina.">
        <WeekdayBars data={ops.byHour.filter((h) => h.orders > 0).map((h) => ({ label: h.label, spendUsd: h.spendUsd, orders: h.orders }))} />
      </Card>
      {(ops.kpis.customerSaleOrders > 0 || ops.kpis.withNotes > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {ops.kpis.customerSaleOrders > 0 && <Kpi label="Factura al cliente" value={qty(ops.kpis.customerSaleOrders)} hint="Grupo Núcleo: venta a nombre del cliente final" />}
          {ops.kpis.withNotes > 0 && <Kpi label="Con notas" value={qty(ops.kpis.withNotes)} hint="Pedidos que llevaron comentario al vendedor" />}
        </div>
      )}
    </div>
  );
}

function DireccionesPanel({ data }: { data: PurchaseInsights }) {
  const ops = data.ops;
  if (!ops) return <EmptyOps text="El tablero todavía no trajo direcciones." />;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Kpi label="Direcciones usadas" value={qty(ops.kpis.uniqueAddresses)} hint="Calle + localidad que vino en el snapshot del pedido" />
        <Kpi label="Sucursales / depósitos" value={qty(ops.byWarehouse.length)} hint="Air sucursal, Elit warehouse, retiro NB" />
        <Kpi label="Pedidos sin dirección" value={qty(Math.max(0, data.kpis.orders - ops.byAddress.reduce((s, r) => s + r.orders, 0)))} hint="Offline u órdenes que no guardaron domicilio" />
      </div>
      <Card title="Domicilios más usados" hint="Se arma con el snapshot de cada checkout (Invid, New Bytes, Elit, Air). No cruza otros locales.">
        {ops.byAddress.length === 0 ? (
          <EmptyOps text="Todavía no hay domicilios guardados en los pedidos de este período." />
        ) : (
          <NamedTable rows={ops.byAddress} extraHeader="Flete" extra={(r) => formatFreight(r.extraUsd ?? 0, r.extraArs ?? 0)} />
        )}
      </Card>
      {ops.byWarehouse.length > 0 && (
        <Card title="Sucursales y depósitos">
          <NamedTable rows={ops.byWarehouse} />
        </Card>
      )}
    </div>
  );
}

function NamedTable({
  rows,
  extraHeader,
  extra,
}: {
  rows: (PurchaseRankRow & { extraUsd?: number; extraArs?: number })[];
  extraHeader?: string;
  extra?: (row: PurchaseRankRow & { extraUsd?: number; extraArs?: number }) => string;
}) {
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-xs">
        <thead className="text-surface-500">
          <tr className="border-b border-surface-800">
            <th className="text-left font-medium py-2">Detalle</th>
            <th className="text-right font-medium py-2">Share</th>
            <th className="text-right font-medium py-2">Pedidos</th>
            <th className="text-right font-medium py-2">Importe</th>
            {extraHeader && <th className="text-right font-medium py-2">{extraHeader}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-surface-800/60">
              <td className="py-1.5 text-surface-200 pr-3">{row.label}</td>
              <td className="py-1.5 text-right tabular-nums text-surface-400">{pct(row.share)}</td>
              <td className="py-1.5 text-right tabular-nums">{row.orders}</td>
              <td className="py-1.5 text-right tabular-nums text-white">{formatUSD(row.spendUsd)}</td>
              {extraHeader && extra && (
                <td className="py-1.5 text-right tabular-nums text-amber-200">{extra(row)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
