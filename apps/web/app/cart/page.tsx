"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import PrefsPanel from "@/components/PrefsPanel";
import { useCart, CartItem } from "@/lib/cart";
import { usePrefs } from "@/lib/prefs";
import { parsePrice, formatARS, formatUSD, proxyImg } from "@/lib/format";
import { PROVIDER_CHIP_COLOR as PROVIDER_COLOR } from "@/lib/providerColors";
import {
  ShoppingCart, Trash2, Minus, Plus, Download,
  AlertTriangle, ImageOff, X, FileText, MessageCircle, Check, Copy
} from "lucide-react";

export default function CartPage() {
  const { items, byProvider, setQty, remove, clear, clearProvider, totalCount } = useCart();
  const { currency, withIva, applyIva, convert, currentRate, dollarLabel, dollarType } = usePrefs();

  const [confirmClear, setConfirmClear] = useState<"all" | string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [copied, setCopied] = useState(false);

  const sortedProviders = useMemo(
    () => Object.keys(byProvider).sort(),
    [byProvider]
  );

  function totalsFor(its: CartItem[]) {
    const subtotalUSD = its.reduce((sum, it) => sum + parsePrice(it.price) * it.qty, 0);
    const ivaUSD = withIva ? subtotalUSD * 0.21 : 0;
    const totalUSD = subtotalUSD + ivaUSD;
    return {
      subtotalUSD,
      ivaUSD,
      totalUSD,
      itemCount: its.reduce((s, it) => s + it.qty, 0),
      productCount: its.length,
    };
  }

  const grand = useMemo(() => totalsFor(items), [items, withIva]);
  const providerTotals = useMemo(() => {
    const m: Record<string, ReturnType<typeof totalsFor>> = {};
    for (const [p, its] of Object.entries(byProvider)) m[p] = totalsFor(its);
    return m;
  }, [byProvider, withIva]);

  function fmt(usd: number) {
    if (currency === "USD") return formatUSD(usd);
    return formatARS(convert(usd).amount);
  }

  function buildWhatsAppText(scope: "all" | string = "all") {
    const its = scope === "all" ? items : (byProvider[scope] || []);
    const tot = scope === "all" ? grand : providerTotals[scope];
    const date = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const sep = "━━━━━━━━━━━━━━━━━";

    const lines: string[] = [];
    lines.push(`🛒 *Cotización NODO*`);
    lines.push(`📅 ${date}`);
    if (currency === "ARS" && currentRate) {
      lines.push(`💵 Dólar ${dollarLabel(dollarType)}: $${currentRate.venta.toLocaleString("es-AR")}`);
    }
    lines.push("");

    const providersToShow = scope === "all" ? sortedProviders : [scope];

    for (const prov of providersToShow) {
      const its = byProvider[prov];
      if (!its || its.length === 0) continue;
      const pt = providerTotals[prov];
      lines.push(sep);
      lines.push(`*${prov.replace(/_/g, " ")}*  _(${pt.itemCount} u.)_`);
      lines.push(sep);
      for (const it of its) {
        const unit = parsePrice(it.price);
        const subtotal = unit * it.qty;
        const unitFmt = fmt(unit);
        const subFmt = fmt(subtotal);
        const nameTrim = it.name.length > 70 ? it.name.slice(0, 67) + "..." : it.name;
        if (it.qty === 1) {
          lines.push(`• ${nameTrim}`);
          lines.push(`   ${subFmt}`);
        } else {
          lines.push(`• ${nameTrim}  _x${it.qty}_`);
          lines.push(`   ${unitFmt} c/u → *${subFmt}*`);
        }
      }
      lines.push("");
      lines.push(`Subtotal ${prov.replace(/_/g, " ")}: *${fmt(pt.totalUSD)}*`);
      lines.push("");
    }

    lines.push(sep);
    lines.push(`*TOTAL ${scope === "all" ? "GENERAL" : scope.replace(/_/g, " ")}*`);
    lines.push(sep);
    lines.push(`Productos: ${tot.productCount}`);
    lines.push(`Unidades: ${tot.itemCount}`);
    lines.push(`Subtotal: ${fmt(tot.subtotalUSD)}`);
    if (withIva) lines.push(`IVA (21%): ${fmt(tot.ivaUSD)}`);
    lines.push(`*TOTAL: ${fmt(tot.totalUSD)}*${withIva ? "" : " _(sin IVA)_"}`);
    if (currency === "ARS") lines.push(`(${formatUSD(tot.totalUSD)} USD)`);

    return lines.join("\n");
  }

  async function copyForWhatsApp() {
    const txt = buildWhatsAppText(activeTab);
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: trigger a download
      const blob = new Blob([txt], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cotizacion-whatsapp.txt";
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  function shareWhatsApp() {
    const txt = buildWhatsAppText(activeTab);
    const url = `https://wa.me/?text=${encodeURIComponent(txt)}`;
    window.open(url, "_blank");
  }

  function exportJSON() {
    const data = {
      generatedAt: new Date().toISOString(),
      currency,
      withIva,
      dollarRate: currentRate?.venta,
      dollarType,
      items: items.map((it) => ({
        provider: it.provider,
        externalId: it.externalId,
        name: it.name,
        qty: it.qty,
        unitPriceUSD: parsePrice(it.price),
      })),
      totals: { ...grand },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cotizacion-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const rows = [
      ["Proveedor", "ID", "Producto", "Cantidad", "Precio Unit. USD", "Subtotal USD"],
      ...items.map((it) => [
        it.provider, it.externalId, `"${it.name.replace(/"/g, '""')}"`,
        it.qty.toString(), parsePrice(it.price).toFixed(2), (parsePrice(it.price) * it.qty).toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cotizacion-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabsToShow: Array<{ key: string; label: string; count: number }> = [
    { key: "all", label: "Todos los proveedores", count: totalCount },
    ...sortedProviders.map((p) => ({ key: p, label: p.replace(/_/g, " "), count: byProvider[p].reduce((s, it) => s + it.qty, 0) })),
  ];

  const shownItems = activeTab === "all" ? items : byProvider[activeTab] || [];
  const shownTotals = activeTab === "all" ? grand : providerTotals[activeTab];

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Navbar />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0 pt-12 lg:pt-0">
          {/* Header */}
          <header className="flex-shrink-0 border-b border-surface-800 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-brand-600/15 flex items-center justify-center">
                <ShoppingCart className="w-3.5 h-3.5 text-brand-400" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-white">Carrito</h1>
                <p className="text-xs text-surface-500">
                  {totalCount} unidad{totalCount !== 1 ? "es" : ""} · {items.length} producto{items.length !== 1 ? "s" : ""} · {sortedProviders.length} proveedor{sortedProviders.length !== 1 ? "es" : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PrefsPanel />
              {items.length > 0 && (
                <>
                  <button
                    onClick={copyForWhatsApp}
                    className={`flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2 transition-all border ${
                      copied
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                        : "bg-[#25D366]/10 border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/15"
                    }`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copiado" : "Copiar WhatsApp"}
                  </button>
                  <button
                    onClick={shareWhatsApp}
                    title="Abrir WhatsApp Web"
                    className="flex items-center gap-1.5 text-xs text-[#25D366] hover:bg-[#25D366]/10 border border-[#25D366]/20 hover:border-[#25D366]/40 rounded-lg px-3 py-2 transition-all"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex border border-surface-700 rounded-lg overflow-hidden">
                    <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs text-surface-300 hover:bg-surface-800 px-3 py-2 transition-colors">
                      <FileText className="w-3.5 h-3.5" />CSV
                    </button>
                    <button onClick={exportJSON} className="flex items-center gap-1.5 text-xs text-surface-300 hover:bg-surface-800 px-3 py-2 border-l border-surface-700 transition-colors">
                      <Download className="w-3.5 h-3.5" />JSON
                    </button>
                  </div>
                  <button
                    onClick={() => setConfirmClear("all")}
                    className="flex items-center gap-1.5 text-xs text-red-400 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/40 rounded-lg px-3 py-2 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />Vaciar
                  </button>
                </>
              )}
            </div>
          </header>

          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <ShoppingCart className="w-12 h-12 text-surface-700 mb-1" />
              <p className="text-sm font-medium text-surface-300">Tu carrito está vacío</p>
              <p className="text-xs text-surface-500">Agregá productos desde la búsqueda</p>
              <Link href="/search" className="mt-3 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-lg px-4 py-2 transition-all">
                Ir a buscar productos
              </Link>
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] overflow-hidden">
              {/* Main: items */}
              <div className="overflow-y-auto">
                {/* Tabs */}
                <div className="sticky top-0 z-10 bg-surface-950/95 backdrop-blur-sm border-b border-surface-800 px-6 py-2">
                  <div className="flex gap-1 overflow-x-auto">
                    {tabsToShow.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-1.5 whitespace-nowrap text-xs font-medium px-3 py-1.5 rounded-md transition-all ${
                          activeTab === tab.key
                            ? "bg-brand-600/15 text-brand-400"
                            : "text-surface-400 hover:text-surface-100 hover:bg-surface-800"
                        }`}
                      >
                        {tab.label}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          activeTab === tab.key ? "bg-brand-500/30" : "bg-surface-800"
                        }`}>{tab.count}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-6 py-5 flex flex-col gap-4">
                  {activeTab === "all" ? (
                    // grouped by provider
                    sortedProviders.map((prov) => (
                      <ProviderSection
                        key={prov}
                        provider={prov}
                        items={byProvider[prov]}
                        totals={providerTotals[prov]}
                        fmt={fmt}
                        currency={currency}
                        setQty={setQty}
                        remove={remove}
                        onClearProvider={() => setConfirmClear(prov)}
                      />
                    ))
                  ) : (
                    <ProviderSection
                      provider={activeTab}
                      items={shownItems}
                      totals={shownTotals}
                      fmt={fmt}
                      currency={currency}
                      setQty={setQty}
                      remove={remove}
                      onClearProvider={() => setConfirmClear(activeTab)}
                    />
                  )}
                </div>
              </div>

              {/* Sidebar: totals */}
              <aside className="border-l border-surface-800 bg-surface-950/50 overflow-y-auto">
                <div className="p-5 flex flex-col gap-4 sticky top-0">
                  <div>
                    <h2 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">
                      {activeTab === "all" ? "Resumen general" : `Resumen — ${activeTab.replace(/_/g, " ")}`}
                    </h2>
                    <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4 flex flex-col gap-3">
                      <Row label={`Productos`} value={shownTotals?.productCount || 0} />
                      <Row label={`Unidades`} value={shownTotals?.itemCount || 0} />
                      <div className="border-t border-surface-800 my-1" />
                      <Row label="Subtotal" value={fmt(shownTotals?.subtotalUSD || 0)} highlight />
                      {withIva && <Row label="IVA (21%)" value={fmt(shownTotals?.ivaUSD || 0)} muted />}

                      <div className="border-t border-surface-800 pt-3 mt-1">
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm font-semibold text-surface-300">Total</span>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-white tabular-nums">{fmt(shownTotals?.totalUSD || 0)}</p>
                            {currency === "ARS" && (
                              <p className="text-[11px] text-surface-500 tabular-nums">{formatUSD(shownTotals?.totalUSD || 0)} USD</p>
                            )}
                          </div>
                        </div>
                        {!withIva && <p className="text-[10px] text-surface-500 text-right">sin IVA</p>}
                      </div>
                    </div>
                  </div>

                  {/* Per-provider breakdown */}
                  {activeTab === "all" && sortedProviders.length > 1 && (
                    <div>
                      <h2 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Por proveedor</h2>
                      <div className="bg-surface-900 border border-surface-800 rounded-2xl p-3 flex flex-col gap-1">
                        {sortedProviders.map((p) => {
                          const t = providerTotals[p];
                          return (
                            <button
                              key={p}
                              onClick={() => setActiveTab(p)}
                              className="flex items-center justify-between gap-2 hover:bg-surface-800 rounded-md px-2 py-1.5 transition-colors text-left"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`text-[10px] font-bold ${PROVIDER_COLOR[p]?.split(" ")[0] || "text-surface-400"}`}>
                                  {p.replace(/_/g, " ")}
                                </span>
                                <span className="text-[10px] text-surface-500">{t.itemCount}u</span>
                              </div>
                              <span className="text-xs font-semibold text-surface-200 tabular-nums">{fmt(t.totalUSD)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {currentRate && currency === "ARS" && (
                    <div className="text-[10px] text-surface-500 border border-surface-800 rounded-lg p-3 leading-relaxed">
                      Convertido al dólar {dollarLabel(dollarType)} (${currentRate.venta.toLocaleString("es-AR")}) — actualizado {new Date(currentRate.fechaActualizacion).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      </div>

      {/* Confirm clear modal */}
      {confirmClear && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-900 border border-surface-700 rounded-2xl max-w-sm w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">
                  {confirmClear === "all" ? "Vaciar carrito" : `Vaciar ${confirmClear.replace(/_/g, " ")}`}
                </h3>
                <p className="text-xs text-surface-400">
                  {confirmClear === "all"
                    ? "Vas a eliminar todos los productos del carrito. Esta acción no se puede deshacer."
                    : `Vas a eliminar los productos de ${confirmClear.replace(/_/g, " ")}. Esta acción no se puede deshacer.`}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmClear(null)} className="flex-1 border border-surface-700 text-surface-300 hover:text-white rounded-lg py-2 text-sm transition-all">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (confirmClear === "all") clear();
                  else clearProvider(confirmClear);
                  setConfirmClear(null);
                  if (confirmClear !== "all") setActiveTab("all");
                }}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-lg py-2 text-sm font-semibold transition-all"
              >
                Vaciar
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}

function Row({ label, value, highlight, muted }: { label: string; value: string | number; highlight?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${muted ? "text-surface-500" : "text-surface-400"}`}>{label}</span>
      <span className={`text-xs tabular-nums ${highlight ? "font-bold text-white" : muted ? "text-surface-400" : "text-surface-200"}`}>{value}</span>
    </div>
  );
}

function ProviderSection({
  provider, items, totals, fmt, currency, setQty, remove, onClearProvider,
}: {
  provider: string;
  items: CartItem[];
  totals: ReturnType<typeof totalsFor>;
  fmt: (n: number) => string;
  currency: string;
  setQty: (p: string, e: string, q: number) => void;
  remove: (p: string, e: string) => void;
  onClearProvider: () => void;
}) {
  if (!items || items.length === 0) return null;
  const color = PROVIDER_COLOR[provider] || "text-surface-400 bg-surface-400/10 border-surface-400/30";

  return (
    <section className="bg-surface-900/50 border border-surface-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${color}`}>
            {provider.replace(/_/g, " ")}
          </span>
          <span className="text-xs text-surface-500">
            {totals.productCount} producto{totals.productCount !== 1 ? "s" : ""} · {totals.itemCount} unid.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white tabular-nums">{fmt(totals.totalUSD)}</span>
          <button onClick={onClearProvider} className="text-surface-500 hover:text-red-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="divide-y divide-surface-800">
        {items.map((it) => (
          <div key={`${it.provider}-${it.externalId}`} className="flex items-center gap-3 p-3">
            <Link href={`/product/${encodeURIComponent(it.provider)}/${encodeURIComponent(it.externalId)}`} className="w-14 h-14 relative flex-shrink-0 bg-surface-950 rounded-lg overflow-hidden border border-surface-800">
              {it.imageUrl ? (
                <Image src={proxyImg(it.imageUrl)} alt="" fill className="object-contain p-1" unoptimized />
              ) : (
                <ImageOff className="w-4 h-4 text-surface-700 absolute inset-0 m-auto" />
              )}
            </Link>

            <div className="flex-1 min-w-0">
              <Link href={`/product/${encodeURIComponent(it.provider)}/${encodeURIComponent(it.externalId)}`} className="text-sm text-surface-100 font-medium line-clamp-2 hover:text-white transition-colors">
                {it.name}
              </Link>
              <p className="text-[11px] text-surface-500 font-mono">#{it.externalId}</p>
            </div>

            <div className="flex items-center gap-1 bg-surface-800 border border-surface-700 rounded-md p-0.5 flex-shrink-0">
              <button
                onClick={() => it.qty <= 1 ? remove(it.provider, it.externalId) : setQty(it.provider, it.externalId, it.qty - 1)}
                className="w-6 h-6 flex items-center justify-center text-surface-400 hover:text-white"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="number"
                min={1}
                value={it.qty}
                onChange={(e) => setQty(it.provider, it.externalId, Math.max(1, parseInt(e.target.value) || 1))}
                className="w-10 bg-transparent text-white text-xs font-semibold text-center focus:outline-none tabular-nums"
              />
              <button onClick={() => setQty(it.provider, it.externalId, it.qty + 1)} className="w-6 h-6 flex items-center justify-center text-surface-400 hover:text-white">
                <Plus className="w-3 h-3" />
              </button>
            </div>

            <div className="text-right flex-shrink-0 min-w-[80px]">
              <p className="text-sm font-bold text-white tabular-nums">{fmt(parsePrice(it.price) * it.qty)}</p>
              <p className="text-[10px] text-surface-500 tabular-nums">{fmt(parsePrice(it.price))} c/u</p>
            </div>

            <button
              onClick={() => remove(it.provider, it.externalId)}
              className="text-surface-600 hover:text-red-400 transition-colors flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function totalsFor(items: CartItem[]) {
  return {
    subtotalUSD: 0, ivaUSD: 0, totalUSD: 0, itemCount: 0, productCount: 0,
  };
}
