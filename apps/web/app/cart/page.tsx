"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import PrefsPanel from "@/components/PrefsPanel";
import InvidDraftPanel from "@/components/InvidDraftPanel";
import { useCart, CartItem } from "@/lib/cart";
import { usePrefs } from "@/lib/prefs";
import { proxyImg, formatUSD } from "@/lib/format";
import { PROVIDER_CHIP_COLOR as PROVIDER_COLOR, PROVIDER_TEXT_COLOR } from "@/lib/providerColors";
import { useProviderDisplay } from "@/lib/providerDisplay";
import {
  linePricing,
  extractTaxLines,
  taxByKind,
  formatAlicuota,
} from "@/lib/tax";
import {
  Trash2, Minus, Plus, Download, AlertTriangle, ImageOff,
  FileText, MessageCircle, Check, Copy, ChevronDown,
} from "lucide-react";

type Totals = {
  subtotalUSD: number;
  ivaUSD: number;
  internosUSD: number;
  iibbUSD: number;
  otherUSD: number;
  taxUSD: number;
  totalUSD: number;
  itemCount: number;
  productCount: number;
};

export default function CartPage() {
  const { items, byProvider, setQty, remove, clear, clearProvider, totalCount } = useCart();
  const { currency, withIva, convert, currentRate, dollarLabel, dollarType } = usePrefs();

  const [confirmClear, setConfirmClear] = useState<"all" | string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const sortedProviders = useMemo(
    () => Object.keys(byProvider).sort(),
    [byProvider]
  );

  function totalsFor(its: CartItem[]): Totals {
    let subtotalUSD = 0, ivaUSD = 0, internosUSD = 0, iibbUSD = 0, otherUSD = 0;
    for (const it of its) {
      const pricing = linePricing(it, it.qty);
      subtotalUSD += pricing.net;
      for (const line of extractTaxLines(it)) {
        const amt = line.unitAmount * it.qty;
        if (line.kind === "iva") ivaUSD += amt;
        else if (line.kind === "internos") internosUSD += amt;
        else if (line.kind === "iibb") iibbUSD += amt;
        else otherUSD += amt;
      }
    }
    const taxUSD = ivaUSD + internosUSD + iibbUSD + otherUSD;
    return {
      subtotalUSD,
      ivaUSD,
      internosUSD,
      iibbUSD,
      otherUSD,
      taxUSD,
      totalUSD: withIva ? subtotalUSD + taxUSD : subtotalUSD,
      itemCount: its.reduce((s, it) => s + it.qty, 0),
      productCount: its.length,
    };
  }

  const grand = useMemo(() => totalsFor(items), [items, withIva]);
  const providerTotals = useMemo(() => {
    const m: Record<string, Totals> = {};
    for (const [p, its] of Object.entries(byProvider)) m[p] = totalsFor(its);
    return m;
  }, [byProvider, withIva]);

  function fmt(usd: number, digits = currency === "USD" ? 2 : 0) {
    if (currency === "USD") return formatUSD(usd);
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(convert(usd).amount);
  }

  function buildWhatsAppText(scope: "all" | string = "all") {
    const tot = scope === "all" ? grand : providerTotals[scope];
    const date = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const lines: string[] = [];
    lines.push(`*Cotización NODO*`);
    lines.push(date);
    if (currency === "ARS" && currentRate) {
      lines.push(`Dólar ${dollarLabel(dollarType)}: $${currentRate.venta.toLocaleString("es-AR")}`);
    }
    lines.push("");

    const providersToShow = scope === "all" ? sortedProviders : [scope];
    for (const prov of providersToShow) {
      const its = byProvider[prov];
      if (!its || its.length === 0) continue;
      const pt = providerTotals[prov];
      lines.push(`*${prov.replace(/_/g, " ")}*`);
      for (const it of its) {
        const pricing = linePricing(it, it.qty);
        const unit = withIva ? pricing.unitGross : pricing.unitNet;
        const subtotal = withIva ? pricing.gross : pricing.net;
        const nameTrim = it.name.length > 70 ? it.name.slice(0, 67) + "..." : it.name;
        const qtyBit = it.qty > 1 ? ` x${it.qty}` : "";
        lines.push(`• ${nameTrim}${qtyBit}`);
        const taxes = extractTaxLines(it)
          .filter((l) => l.unitAmount > 0)
          .map((l) => `${l.label} ${formatAlicuota(l.percent)} ${fmt(l.unitAmount * it.qty, 2)}`)
          .join(" · ");
        lines.push(`  ${fmt(unit, 2)} c/u  →  *${fmt(subtotal, 2)}*`);
        if (taxes) lines.push(`  ${taxes}`);
      }
      lines.push(`Subtotal ${prov.replace(/_/g, " ")}: *${fmt(pt.totalUSD)}*`);
      lines.push("");
    }

    lines.push(`*TOTAL*`);
    lines.push(`Neto: ${fmt(tot.subtotalUSD)}`);
    if (withIva) {
      if (tot.ivaUSD > 0) lines.push(`IVA: ${fmt(tot.ivaUSD, 2)}`);
      if (tot.internosUSD > 0) lines.push(`Imp. internos: ${fmt(tot.internosUSD, 2)}`);
      if (tot.iibbUSD > 0) lines.push(`IIBB: ${fmt(tot.iibbUSD, 2)}`);
    }
    lines.push(`*TOTAL: ${fmt(tot.totalUSD)}*${withIva ? "" : " (sin impuestos)"}`);
    if (currency === "ARS") lines.push(`(${formatUSD(tot.totalUSD)} USD)`);
    return lines.join("\n");
  }

  async function copyForWhatsApp() {
    const txt = buildWhatsAppText(activeTab);
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setExportOpen(false);
      setTimeout(() => setCopied(false), 2500);
    } catch {
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
    window.open(`https://wa.me/?text=${encodeURIComponent(buildWhatsAppText(activeTab))}`, "_blank");
    setExportOpen(false);
  }

  function exportCSV() {
    const rows = [
      ["Proveedor", "ID", "Producto", "Cantidad", "Neto USD", "IVA %", "IVA USD", "Internos %", "Internos USD", "IIBB %", "IIBB USD", "Final USD"],
      ...items.map((it) => {
        const pricing = linePricing(it, it.qty);
        const taxLines = extractTaxLines(it);
        const iva = taxByKind(taxLines, "iva");
        const internos = taxByKind(taxLines, "internos");
        const iibb = taxByKind(taxLines, "iibb");
        return [
          it.provider, it.externalId, `"${it.name.replace(/"/g, '""')}"`,
          String(it.qty),
          pricing.net.toFixed(2),
          iva?.percent ?? "",
          ((iva?.unitAmount ?? 0) * it.qty).toFixed(2),
          internos?.percent ?? "",
          ((internos?.unitAmount ?? 0) * it.qty).toFixed(2),
          iibb?.percent ?? "",
          ((iibb?.unitAmount ?? 0) * it.qty).toFixed(2),
          pricing.gross.toFixed(2),
        ];
      }),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cotizacion-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }

  function exportJSON() {
    const data = {
      generatedAt: new Date().toISOString(),
      currency,
      withIva,
      dollarRate: currentRate?.venta,
      dollarType,
      items: items.map((it) => {
        const pricing = linePricing(it, it.qty);
        return {
          provider: it.provider,
          externalId: it.externalId,
          name: it.name,
          qty: it.qty,
          unitNetUSD: pricing.unitNet,
          taxes: extractTaxLines(it),
          lineGrossUSD: pricing.gross,
        };
      }),
      totals: grand,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cotizacion-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }

  const tabsToShow: Array<{ key: string; label: string; count: number }> = [
    { key: "all", label: "Todos", count: totalCount },
    ...sortedProviders.map((p) => ({
      key: p,
      label: p.replace(/_/g, " "),
      count: byProvider[p].reduce((s, it) => s + it.qty, 0),
    })),
  ];

  const shownItems = activeTab === "all" ? items : byProvider[activeTab] || [];
  const shownTotals = activeTab === "all" ? grand : providerTotals[activeTab];

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Navbar />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0 pt-12 lg:pt-0">
          <header className="flex-shrink-0 border-b border-surface-800 px-5 lg:px-8 py-3.5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold tracking-tight text-white">Cotización</h1>
              <p className="text-[11px] text-surface-500 mt-0.5 tabular-nums">
                {items.length === 0
                  ? "Sin productos"
                  : `${items.length} ${items.length === 1 ? "línea" : "líneas"} · ${totalCount} ${totalCount === 1 ? "unidad" : "unidades"} · ${sortedProviders.length} ${sortedProviders.length === 1 ? "proveedor" : "proveedores"}`}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <PrefsPanel />
              {items.length > 0 && (
                <>
                  <div className="relative" ref={exportRef}>
                    <button
                      onClick={() => setExportOpen((v) => !v)}
                      className="flex items-center gap-1.5 text-xs text-surface-300 hover:text-white border border-surface-700 hover:border-surface-500 rounded-md px-2.5 py-1.5 transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5" />}
                      {copied ? "Copiado" : "Exportar"}
                      <ChevronDown className="w-3 h-3 text-surface-500" />
                    </button>
                    {exportOpen && (
                      <div className="absolute right-0 top-full mt-1.5 w-48 bg-surface-900 border border-surface-700 rounded-md shadow-xl z-30 py-1">
                        <button onClick={copyForWhatsApp} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-surface-200 hover:bg-surface-800">
                          <Copy className="w-3.5 h-3.5 text-surface-500" /> Copiar para WhatsApp
                        </button>
                        <button onClick={shareWhatsApp} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-surface-200 hover:bg-surface-800">
                          <MessageCircle className="w-3.5 h-3.5 text-surface-500" /> Abrir WhatsApp
                        </button>
                        <div className="h-px bg-surface-800 my-1" />
                        <button onClick={exportCSV} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-surface-200 hover:bg-surface-800">
                          <FileText className="w-3.5 h-3.5 text-surface-500" /> CSV
                        </button>
                        <button onClick={exportJSON} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-surface-200 hover:bg-surface-800">
                          <Download className="w-3.5 h-3.5 text-surface-500" /> JSON
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setConfirmClear("all")}
                    className="text-xs text-surface-500 hover:text-red-400 border border-transparent hover:border-red-500/30 rounded-md px-2.5 py-1.5 transition-colors"
                  >
                    Vaciar
                  </button>
                </>
              )}
            </div>
          </header>

          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <p className="text-sm text-surface-200">No hay productos en esta cotización</p>
              <p className="text-xs text-surface-500 mt-1.5 max-w-sm">
                Agregá ítems desde la búsqueda. Cada línea muestra neto, IVA, imp. internos e IIBB según lo que informe el proveedor.
              </p>
              <Link href="/search" className="mt-5 text-xs font-medium text-brand-400 hover:text-brand-300 border-b border-brand-400/40 pb-0.5">
                Ir a buscar
              </Link>
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] overflow-hidden">
              <div className="overflow-y-auto">
                <div className="sticky top-0 z-10 bg-surface-950/95 backdrop-blur-sm border-b border-surface-800 px-5 lg:px-8">
                  <div className="flex gap-0 overflow-x-auto">
                    {tabsToShow.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`relative whitespace-nowrap text-[12px] px-3 py-2.5 transition-colors ${
                          activeTab === tab.key
                            ? "text-white"
                            : "text-surface-500 hover:text-surface-200"
                        }`}
                      >
                        {tab.label}
                        <span className="ml-1.5 text-[10px] tabular-nums text-surface-500">{tab.count}</span>
                        {activeTab === tab.key && (
                          <span className="absolute inset-x-3 -bottom-px h-px bg-brand-500" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-5 lg:px-8 py-5 flex flex-col gap-8">
                  {activeTab === "all" ? (
                    sortedProviders.map((prov) => (
                      <ProviderSection
                        key={prov}
                        provider={prov}
                        items={byProvider[prov]}
                        totals={providerTotals[prov]}
                        fmt={fmt}
                        withIva={withIva}
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
                      withIva={withIva}
                      setQty={setQty}
                      remove={remove}
                      onClearProvider={() => setConfirmClear(activeTab)}
                    />
                  )}
                </div>
              </div>

              <aside className="border-t lg:border-t-0 lg:border-l border-surface-800 overflow-y-auto">
                <div className="p-5 lg:p-6 flex flex-col gap-6">
                  <SummaryCard
                    title={activeTab === "all" ? "Resumen" : activeTab.replace(/_/g, " ")}
                    totals={shownTotals}
                    fmt={fmt}
                    withIva={withIva}
                    currency={currency}
                    showInvidNote={Boolean(byProvider.INVID?.length)}
                  />

                  {byProvider.INVID?.length > 0 && (
                    <InvidDraftPanel
                      items={byProvider.INVID}
                      onCreated={() => clearProvider("INVID")}
                    />
                  )}

                  {activeTab === "all" && sortedProviders.length > 1 && (
                    <div>
                      <h2 className="text-[10px] font-semibold text-surface-500 uppercase tracking-[0.14em] mb-2">
                        Por proveedor
                      </h2>
                      <div className="flex flex-col">
                        {sortedProviders.map((p) => {
                          const t = providerTotals[p];
                          return (
                            <button
                              key={p}
                              onClick={() => setActiveTab(p)}
                              className="flex items-center justify-between gap-2 py-2 border-b border-surface-800 last:border-0 text-left hover:bg-surface-900/60 -mx-1 px-1 transition-colors"
                            >
                              <span className={`text-[11px] font-medium ${PROVIDER_TEXT_COLOR[p] || "text-surface-300"}`}>
                                {p.replace(/_/g, " ")}
                              </span>
                              <span className="text-[11px] tabular-nums text-surface-200">{fmt(t.totalUSD)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {currentRate && currency === "ARS" && (
                    <p className="text-[10px] text-surface-500 leading-relaxed">
                      Convertido al dólar {dollarLabel(dollarType)} (${currentRate.venta.toLocaleString("es-AR")}) · {new Date(currentRate.fechaActualizacion).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      </div>

      {confirmClear && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-surface-900 border border-surface-700 rounded-lg max-w-sm w-full p-5">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {confirmClear === "all" ? "Vaciar cotización" : `Quitar ${confirmClear.replace(/_/g, " ")}`}
                </h3>
                <p className="text-xs text-surface-400 mt-1">
                  {confirmClear === "all"
                    ? "Se eliminan todas las líneas. No se puede deshacer."
                    : `Se eliminan las líneas de ${confirmClear.replace(/_/g, " ")}.`}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmClear(null)} className="flex-1 border border-surface-700 text-surface-300 hover:text-white rounded-md py-2 text-sm">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (confirmClear === "all") clear();
                  else clearProvider(confirmClear);
                  setConfirmClear(null);
                  if (confirmClear !== "all") setActiveTab("all");
                }}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-md py-2 text-sm font-medium"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}

function SummaryCard({
  title, totals, fmt, withIva, currency, showInvidNote,
}: {
  title: string;
  totals: Totals;
  fmt: (n: number, digits?: number) => string;
  withIva: boolean;
  currency: string;
  showInvidNote: boolean;
}) {
  return (
    <div>
      <h2 className="text-[10px] font-semibold text-surface-500 uppercase tracking-[0.14em] mb-3">{title}</h2>
      <dl className="flex flex-col gap-1.5 text-[12px]">
        <SummaryRow label="Líneas" value={String(totals.productCount)} />
        <SummaryRow label="Unidades" value={String(totals.itemCount)} />
        <div className="h-px bg-surface-800 my-1.5" />
        <SummaryRow label="Neto" value={fmt(totals.subtotalUSD)} />
        {withIva && (
          <>
            <SummaryRow label="IVA" value={fmt(totals.ivaUSD, 2)} muted={totals.ivaUSD === 0} />
            <SummaryRow label="Imp. internos" value={fmt(totals.internosUSD, 2)} muted={totals.internosUSD === 0} />
            <SummaryRow label="IIBB" value={fmt(totals.iibbUSD, 2)} muted={totals.iibbUSD === 0} />
            {totals.otherUSD > 0.004 && <SummaryRow label="Otros" value={fmt(totals.otherUSD, 2)} />}
          </>
        )}
        <div className="h-px bg-surface-800 my-1.5" />
        <div className="flex items-baseline justify-between pt-0.5">
          <dt className="text-[12px] font-medium text-surface-300">Total</dt>
          <dd className="text-right">
            <p className="text-lg font-semibold text-white tabular-nums leading-none">{fmt(totals.totalUSD)}</p>
            {currency === "ARS" && (
              <p className="text-[10px] text-surface-500 tabular-nums mt-1">{formatUSD(totals.totalUSD)}</p>
            )}
            {!withIva && <p className="text-[10px] text-surface-500 mt-1">sin impuestos</p>}
          </dd>
        </div>
      </dl>
      {withIva && showInvidNote && (
        <p className="text-[10px] text-surface-500 leading-relaxed mt-3">
          IIBB / percepciones de Invid se confirman al validar stock en el portal. El total de lista es neto + IVA + internos.
        </p>
      )}
    </div>
  );
}

function SummaryRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={`text-surface-500 ${muted ? "opacity-60" : ""}`}>{label}</dt>
      <dd className={`tabular-nums ${muted ? "text-surface-600" : "text-surface-200"}`}>{value}</dd>
    </div>
  );
}

function ProviderSection({
  provider, items, totals, fmt, withIva, setQty, remove, onClearProvider,
}: {
  provider: string;
  items: CartItem[];
  totals: Totals;
  fmt: (n: number, digits?: number) => string;
  withIva: boolean;
  setQty: (p: string, e: string, q: number) => void;
  remove: (p: string, e: string) => void;
  onClearProvider: () => void;
}) {
  const display = useProviderDisplay();
  if (!items || items.length === 0) return null;
  const color = PROVIDER_COLOR[provider] || "text-surface-400 bg-surface-400/10 border-surface-400/30";
  const logoUrl = display.logoUrl(provider);

  return (
    <section>
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-surface-800">
        <div className="flex items-center gap-2 min-w-0">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="w-4 h-4 object-contain rounded-sm" />
          ) : (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${color}`}>
              {provider.replace(/_/g, " ")}
            </span>
          )}
          {logoUrl && (
            <span className={`text-[12px] font-semibold tracking-wide ${PROVIDER_TEXT_COLOR[provider] || "text-white"}`}>
              {provider.replace(/_/g, " ")}
            </span>
          )}
          <span className="text-[11px] text-surface-500 tabular-nums">
            {totals.productCount} {totals.productCount === 1 ? "línea" : "líneas"} · {totals.itemCount} u.
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[13px] font-medium text-white tabular-nums">{fmt(totals.totalUSD)}</span>
          <button onClick={onClearProvider} className="text-surface-600 hover:text-red-400 transition-colors" title="Quitar proveedor">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="hidden md:grid grid-cols-[minmax(0,1.4fr)_72px_88px_88px_88px_88px_96px_28px] gap-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-surface-500">
        <span>Producto</span>
        <span className="text-center">Cant.</span>
        <span className="text-right">Neto</span>
        <span className="text-right">IVA</span>
        <span className="text-right">Internos</span>
        <span className="text-right">IIBB</span>
        <span className="text-right">Total</span>
        <span />
      </div>

      <div className="divide-y divide-surface-800/80">
        {items.map((it) => (
          <CartLine
            key={`${it.provider}-${it.externalId}`}
            item={it}
            fmt={fmt}
            withIva={withIva}
            setQty={setQty}
            remove={remove}
          />
        ))}
      </div>

      {provider === "INVID" && (
        <p className="text-[10px] text-surface-500 mt-2">
          Invid no informa IIBB en lista de precios. Aparece al validar stock (percepciones).
        </p>
      )}
    </section>
  );
}

function CartLine({
  item, fmt, withIva, setQty, remove,
}: {
  item: CartItem;
  fmt: (n: number, digits?: number) => string;
  withIva: boolean;
  setQty: (p: string, e: string, q: number) => void;
  remove: (p: string, e: string) => void;
}) {
  const pricing = linePricing(item, item.qty);
  const taxLines = extractTaxLines(item);
  const iva = taxByKind(taxLines, "iva");
  const internos = taxByKind(taxLines, "internos");
  const iibb = taxByKind(taxLines, "iibb");
  const others = taxLines.filter((l) => l.kind === "other" && l.unitAmount > 0);
  const href = `/product/${encodeURIComponent(item.provider)}/${encodeURIComponent(item.externalId)}`;
  const sku = item.sku || item.partNumber || item.externalId;

  return (
    <div className="py-3 md:grid md:grid-cols-[minmax(0,1.4fr)_72px_88px_88px_88px_88px_96px_28px] md:gap-2 md:items-center">
      <div className="flex items-start gap-3 min-w-0">
        <Link href={href} className="w-12 h-12 relative flex-shrink-0 bg-white rounded overflow-hidden border border-surface-800">
          {item.imageUrl ? (
            <Image src={proxyImg(item.imageUrl)} alt="" fill className="object-contain p-0.5" unoptimized />
          ) : (
            <ImageOff className="w-3.5 h-3.5 text-surface-400 absolute inset-0 m-auto" />
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={href} className="text-[13px] text-surface-100 leading-snug line-clamp-2 hover:text-white">
            {item.name}
          </Link>
          <p className="text-[10px] text-surface-500 font-mono mt-0.5 truncate">
            {item.brand ? `${item.brand} · ` : ""}#{sku}
          </p>
          {item.stockStatus?.toLowerCase().includes("bajo") && (
            <p className="text-[10px] text-amber-400/90 mt-0.5">Stock bajo</p>
          )}
          {others.length > 0 && (
            <p className="text-[10px] text-surface-500 mt-0.5">
              {others.map((o) => `${o.label} ${formatAlicuota(o.percent)} ${fmt(o.unitAmount * item.qty, 2)}`).join(" · ")}
            </p>
          )}
          <div className="md:hidden mt-2 grid grid-cols-3 gap-x-3 gap-y-1">
            <TaxCell label="IVA" line={iva} qty={item.qty} fmt={fmt} />
            <TaxCell label="Internos" line={internos} qty={item.qty} fmt={fmt} />
            <TaxCell label="IIBB" line={iibb} qty={item.qty} fmt={fmt} />
          </div>
        </div>
      </div>

      <div className="mt-3 md:mt-0 flex md:justify-center">
        <QtyControl
          qty={item.qty}
          onDec={() => item.qty <= 1 ? remove(item.provider, item.externalId) : setQty(item.provider, item.externalId, item.qty - 1)}
          onInc={() => setQty(item.provider, item.externalId, item.qty + 1)}
          onSet={(q) => setQty(item.provider, item.externalId, q)}
        />
      </div>

      <MoneyCell className="hidden md:block" primary={fmt(pricing.net, 2)} secondary={item.qty > 1 ? `${fmt(pricing.unitNet, 2)} c/u` : undefined} />
      <div className="hidden md:block"><TaxCell line={iva} qty={item.qty} fmt={fmt} align="right" /></div>
      <div className="hidden md:block"><TaxCell line={internos} qty={item.qty} fmt={fmt} align="right" /></div>
      <div className="hidden md:block"><TaxCell line={iibb} qty={item.qty} fmt={fmt} align="right" /></div>
      <MoneyCell
        className="hidden md:block"
        primary={fmt(withIva ? pricing.gross : pricing.net, 2)}
        emphasize
      />

      <div className="hidden md:flex justify-end">
        <button onClick={() => remove(item.provider, item.externalId)} className="text-surface-600 hover:text-red-400 p-1" title="Quitar">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="md:hidden flex items-center justify-between mt-2 pt-2 border-t border-surface-800/60">
        <span className="text-[11px] text-surface-500">Total línea</span>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-white tabular-nums">{fmt(withIva ? pricing.gross : pricing.net, 2)}</span>
          <button onClick={() => remove(item.provider, item.externalId)} className="text-surface-600 hover:text-red-400">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TaxCell({
  label, line, qty, fmt, align = "left",
}: {
  label?: string;
  line: ReturnType<typeof taxByKind>;
  qty: number;
  fmt: (n: number, digits?: number) => string;
  align?: "left" | "right";
}) {
  const empty = !line;
  return (
    <div className={align === "right" ? "text-right" : ""}>
      {label && <p className="text-[9px] uppercase tracking-wider text-surface-500 mb-0.5">{label}</p>}
      {empty ? (
        <p className="text-[12px] text-surface-600 tabular-nums">—</p>
      ) : (
        <>
          <p className="text-[10px] text-surface-500 tabular-nums">{formatAlicuota(line.percent)}</p>
          <p className="text-[12px] text-surface-200 tabular-nums leading-tight">{fmt(line.unitAmount * qty, 2)}</p>
        </>
      )}
    </div>
  );
}

function MoneyCell({
  primary, secondary, emphasize, className = "",
}: {
  primary: string;
  secondary?: string;
  emphasize?: boolean;
  className?: string;
}) {
  return (
    <div className={`text-right ${className}`}>
      <p className={`tabular-nums leading-tight ${emphasize ? "text-[13px] font-semibold text-white" : "text-[12px] text-surface-200"}`}>
        {primary}
      </p>
      {secondary && <p className="text-[10px] text-surface-500 tabular-nums mt-0.5">{secondary}</p>}
    </div>
  );
}

function QtyControl({
  qty, onDec, onInc, onSet,
}: {
  qty: number;
  onDec: () => void;
  onInc: () => void;
  onSet: (q: number) => void;
}) {
  return (
    <div className="inline-flex items-center border border-surface-700 rounded-md h-7">
      <button onClick={onDec} className="w-7 h-7 flex items-center justify-center text-surface-400 hover:text-white" aria-label="Restar">
        <Minus className="w-3 h-3" />
      </button>
      <input
        type="number"
        min={1}
        value={qty}
        onChange={(e) => onSet(Math.max(1, parseInt(e.target.value) || 1))}
        className="w-8 bg-transparent text-white text-[12px] font-medium text-center focus:outline-none tabular-nums"
      />
      <button onClick={onInc} className="w-7 h-7 flex items-center justify-center text-surface-400 hover:text-white" aria-label="Sumar">
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}
