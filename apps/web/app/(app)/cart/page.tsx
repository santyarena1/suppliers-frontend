"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import InvidDraftPanel from "@/components/InvidDraftPanel";
import NewBytesDraftPanel from "@/components/NewBytesDraftPanel";
import ElitCheckoutPanel from "@/components/ElitCheckoutPanel";
import GrupoNucleoCheckoutPanel from "@/components/GrupoNucleoCheckoutPanel";
import AirCheckoutPanel from "@/components/AirCheckoutPanel";
import PendingOrdersBanner from "@/components/checkout/PendingOrdersBanner";
import { useCart, CartItem } from "@/lib/cart";
import { usePrefs } from "@/lib/prefs";
import { proxyImg, formatUSD } from "@/lib/format";
import ProviderBadge from "@/components/ProviderBadge";
import {
  linePricing,
  extractTaxLines,
  taxByKind,
  formatAlicuota,
  perceptionGroupLabel,
  linePerceptionFromOrder,
} from "@/lib/tax";
import { cartLinesFromItems, useCheckoutWarmup } from "@/lib/checkoutWarmup";
import {
  ALL_PROVIDERS,
  ElitCheckoutPreview,
  InvidCheckoutPreview,
  NewBytesCartSnapshot,
} from "@/lib/api";
import {
  Trash2, Minus, Plus, Download, AlertTriangle, ImageOff,
  FileText, MessageCircle, Check, Copy, ChevronDown, History,
} from "lucide-react";
import { providerHasOrderHistory, providerOrdersHref } from "@/lib/providerOrders";
import type { PendingOrderProvider } from "@/lib/pendingOrders";

type PerceptionLine = { label: string; amount: number };

type Totals = {
  subtotalUSD: number;
  ivaUSD: number;
  internosUSD: number;
  iibbUSD: number;
  otherUSD: number;
  shippingUSD: number;
  quotedShipping: boolean;
  taxUSD: number;
  totalUSD: number;
  itemCount: number;
  productCount: number;
  perceptionLines: PerceptionLine[];
};

type TaxExtra = {
  shippingUSD?: number;
  percepcionPercent?: number;
  perceptionsUSD?: number;
  perceptionLines?: PerceptionLine[];
  totalUSD?: number;
};

const EMPTY_TOTALS: Totals = {
  subtotalUSD: 0,
  ivaUSD: 0,
  internosUSD: 0,
  iibbUSD: 0,
  otherUSD: 0,
  shippingUSD: 0,
  quotedShipping: false,
  taxUSD: 0,
  totalUSD: 0,
  itemCount: 0,
  productCount: 0,
  perceptionLines: [],
};

export default function CartPage() {
  const { items, byProvider, setQty, remove, clear, clearProvider, totalCount } = useCart();
  const { currency, withIva, convert, currentRate, dollarLabel, dollarType } = usePrefs();
  const [invidPreview, setInvidPreview] = useState<InvidCheckoutPreview | null>(null);
  const [elitPreview, setElitPreview] = useState<ElitCheckoutPreview | null>(null);
  const [nbSnapshot, setNbSnapshot] = useState<NewBytesCartSnapshot | null>(null);

  const [confirmClear, setConfirmClear] = useState<"all" | string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [pedidosOpen, setPedidosOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const pedidosRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab !== "all" && !byProvider[activeTab]?.length) setActiveTab("all");
  }, [activeTab, byProvider]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const onBackgroundOrderCreated = useCallback((provider: PendingOrderProvider, message: string) => {
    setNotice(message);
    if (provider === "INVID") setInvidPreview(null);
    setActiveTab("all");
    clearProvider(provider);
  }, [clearProvider]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
      if (pedidosRef.current && !pedidosRef.current.contains(e.target as Node)) setPedidosOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const sortedProviders = useMemo(
    () => Object.keys(byProvider).sort(),
    [byProvider]
  );

  function totalsFor(its: CartItem[], extra?: TaxExtra): Totals {
    let subtotalUSD = 0, ivaUSD = 0, internosUSD = 0, iibbUSD = 0, otherUSD = 0;
    const perceptionLines: PerceptionLine[] = [...(extra?.perceptionLines ?? [])];
    for (const it of its) {
      const pricing = linePricing(it, it.qty);
      subtotalUSD += pricing.net;
      for (const line of extractTaxLines(it)) {
        const amt = line.unitAmount * it.qty;
        if (line.kind === "iva") ivaUSD += amt;
        else if (line.kind === "internos") internosUSD += amt;
        else if (line.kind === "iibb") {
          iibbUSD += amt;
          if (amt > 0.0005 && !extra?.perceptionLines?.length) {
            perceptionLines.push({ label: line.label || "Percepciones", amount: amt });
          }
        } else otherUSD += amt;
      }
    }
    const shippingUSD = extra?.shippingUSD ?? 0;
    const shippingIva = shippingUSD * 0.21;
    const shippingIibb = shippingUSD * ((extra?.percepcionPercent ?? 0) / 100);
    ivaUSD += shippingIva;
    iibbUSD += shippingIibb;
    if (extra?.perceptionsUSD) iibbUSD += extra.perceptionsUSD;
    const taxUSD = ivaUSD + internosUSD + iibbUSD + otherUSD;
    let totalUSD = withIva ? subtotalUSD + taxUSD + shippingUSD : subtotalUSD + shippingUSD;
    if (withIva && extra?.totalUSD != null) totalUSD = Math.max(totalUSD, extra.totalUSD);
    return {
      subtotalUSD,
      ivaUSD,
      internosUSD,
      iibbUSD,
      otherUSD,
      shippingUSD,
      quotedShipping: extra != null,
      taxUSD,
      totalUSD,
      itemCount: its.reduce((s, it) => s + it.qty, 0),
      productCount: its.length,
      perceptionLines,
    };
  }

  const invidLines = useMemo(() => cartLinesFromItems(byProvider.INVID ?? []), [byProvider.INVID]);
  const elitLines = useMemo(() => cartLinesFromItems(byProvider.ELIT ?? []), [byProvider.ELIT]);
  const nbLines = useMemo(() => cartLinesFromItems(byProvider.NEW_BYTES ?? []), [byProvider.NEW_BYTES]);
  const invidWarm = useCheckoutWarmup("INVID", invidLines);
  const elitWarm = useCheckoutWarmup("ELIT", elitLines);
  const nbWarm = useCheckoutWarmup("NEW_BYTES", nbLines);

  const invidQuoted = invidPreview ?? (invidWarm.status === "ready" ? invidWarm.data?.preview ?? null : null);
  const elitQuoted = elitPreview ?? (elitWarm.status === "ready" ? elitWarm.data?.preview ?? null : null);
  const nbQuoted = nbSnapshot ?? (nbWarm.status === "ready" ? nbWarm.data?.preview ?? null : null);

  const invidExtra: TaxExtra | undefined = invidQuoted?.stockOk
    ? { shippingUSD: invidQuoted.shippingCost ?? 0, percepcionPercent: invidQuoted.percepcionPercent ?? 0 }
    : undefined;
  const elitExtra: TaxExtra | undefined = elitQuoted
    ? {
        shippingUSD: elitQuoted.shippingCost ?? 0,
        perceptionsUSD: elitQuoted.perceptions ?? 0,
        perceptionLines: elitQuoted.perceptionLines ?? [],
        totalUSD: elitQuoted.total,
      }
    : undefined;
  const nbExtra: TaxExtra | undefined = nbQuoted
    ? {
        perceptionsUSD: nbQuoted.perceptions ?? 0,
        perceptionLines: nbQuoted.perceptionLines ?? [],
        totalUSD: nbQuoted.total,
      }
    : undefined;

  function extraFor(provider: string): TaxExtra | undefined {
    if (provider === "INVID") return invidExtra;
    if (provider === "ELIT") return elitExtra;
    if (provider === "NEW_BYTES") return nbExtra;
    return undefined;
  }

  const grand = useMemo(() => {
    const tot = totalsFor(items);
    const parts = Object.entries(byProvider).map(([p, its]) => totalsFor(its, extraFor(p)));
    if (parts.length === 0) return tot;
    return parts.reduce((acc, t) => ({
      subtotalUSD: acc.subtotalUSD + t.subtotalUSD,
      ivaUSD: acc.ivaUSD + t.ivaUSD,
      internosUSD: acc.internosUSD + t.internosUSD,
      iibbUSD: acc.iibbUSD + t.iibbUSD,
      otherUSD: acc.otherUSD + t.otherUSD,
      shippingUSD: acc.shippingUSD + t.shippingUSD,
      quotedShipping: acc.quotedShipping || t.quotedShipping,
      taxUSD: acc.taxUSD + t.taxUSD,
      totalUSD: acc.totalUSD + t.totalUSD,
      itemCount: acc.itemCount + t.itemCount,
      productCount: acc.productCount + t.productCount,
      perceptionLines: [...acc.perceptionLines, ...t.perceptionLines],
    }), { ...EMPTY_TOTALS });
  }, [items, byProvider, withIva, invidQuoted, elitQuoted, nbQuoted]);
  const providerTotals = useMemo(() => {
    const m: Record<string, Totals> = {};
    for (const [p, its] of Object.entries(byProvider)) {
      m[p] = totalsFor(its, extraFor(p));
    }
    return m;
  }, [byProvider, withIva, invidQuoted, elitQuoted, nbQuoted]);

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
        const extra = extraFor(prov);
        const pricing = linePricing(it, it.qty);
        const perc = linePerceptionFromOrder(it, its, extra);
        const onProduct = (taxByKind(extractTaxLines(it), "iibb")?.unitAmount ?? 0) > 0.0001;
        const gross = pricing.gross + (!onProduct && perc ? perc.unitAmount * it.qty : 0);
        const unit = withIva ? gross / it.qty : pricing.unitNet;
        const subtotal = withIva ? gross : pricing.net;
        const nameTrim = it.name.length > 70 ? it.name.slice(0, 67) + "..." : it.name;
        const qtyBit = it.qty > 1 ? ` x${it.qty}` : "";
        lines.push(`• ${nameTrim}${qtyBit}`);
        const taxes = [
          ...extractTaxLines(it).filter((l) => l.kind !== "iibb" && l.unitAmount > 0),
          ...(perc && perc.unitAmount > 0 ? [perc] : []),
        ]
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
    if (tot.shippingUSD > 0.004) lines.push(`Envío: ${fmt(tot.shippingUSD, 2)}`);
    if (withIva) {
      if (tot.ivaUSD > 0) lines.push(`IVA: ${fmt(tot.ivaUSD, 2)}`);
      if (tot.internosUSD > 0) lines.push(`Imp. internos: ${fmt(tot.internosUSD, 2)}`);
      if (tot.iibbUSD > 0) {
        const percLabel = perceptionGroupLabel(tot.perceptionLines.length ? tot.perceptionLines : [{ label: "Percepciones", amount: tot.iibbUSD }]);
        lines.push(`${percLabel}: ${fmt(tot.iibbUSD, 2)}`);
      }
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
      ["Proveedor", "ID", "Producto", "Cantidad", "Neto USD", "IVA %", "IVA USD", "Internos %", "Internos USD", "Perc. %", "Perc. USD", "Final USD"],
      ...items.map((it) => {
        const siblings = byProvider[it.provider] ?? [it];
        const extra = extraFor(it.provider);
        const pricing = linePricing(it, it.qty);
        const taxLines = extractTaxLines(it);
        const iva = taxByKind(taxLines, "iva");
        const internos = taxByKind(taxLines, "internos");
        const iibb = linePerceptionFromOrder(it, siblings, extra);
        const onProduct = (taxByKind(taxLines, "iibb")?.unitAmount ?? 0) > 0.0001;
        const gross = pricing.gross + (!onProduct && iibb ? iibb.unitAmount * it.qty : 0);
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
          gross.toFixed(2),
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
        const siblings = byProvider[it.provider] ?? [it];
        const extra = extraFor(it.provider);
        const pricing = linePricing(it, it.qty);
        const perc = linePerceptionFromOrder(it, siblings, extra);
        const onProduct = (taxByKind(extractTaxLines(it), "iibb")?.unitAmount ?? 0) > 0.0001;
        return {
          provider: it.provider,
          externalId: it.externalId,
          name: it.name,
          qty: it.qty,
          unitNetUSD: pricing.unitNet,
          taxes: extractTaxLines(it),
          perception: perc,
          lineGrossUSD: pricing.gross + (!onProduct && perc ? perc.unitAmount * it.qty : 0),
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
  const shownTotals = (activeTab === "all" ? grand : providerTotals[activeTab]) ?? EMPTY_TOTALS;

  return (
    <>
          <header className="flex-shrink-0 border-b border-surface-800 px-5 lg:px-8 py-3.5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-white">Cotización</h1>
              <p className="text-xs text-surface-500 mt-0.5 tabular-nums">
                {items.length === 0
                  ? "Sin productos"
                  : `${items.length} ${items.length === 1 ? "línea" : "líneas"} · ${totalCount} ${totalCount === 1 ? "unidad" : "unidades"} · ${sortedProviders.length} ${sortedProviders.length === 1 ? "proveedor" : "proveedores"}`}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <PrefsPanel />
              <div className="relative" ref={pedidosRef}>
                <button
                  onClick={() => setPedidosOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-sm text-surface-300 hover:text-white border border-surface-700 hover:border-surface-500 rounded-sm px-3 py-1.5 transition-colors"
                >
                  <History className="w-3.5 h-3.5" />
                  Pedidos
                  <ChevronDown className="w-3 h-3 text-surface-500" />
                </button>
                {pedidosOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-64 bg-surface-950 border border-surface-800 shadow-xl z-30 py-1 max-h-80 overflow-y-auto">
                    <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.16em] text-surface-500">Historial</p>
                    {ALL_PROVIDERS.filter(providerHasOrderHistory).map((p) => (
                      <Link
                        key={p}
                        href={providerOrdersHref(p)}
                        onClick={() => setPedidosOpen(false)}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-surface-200 hover:bg-surface-900"
                      >
                        <ProviderBadge provider={p} variant="inline" size="sm" />
                        <span className="text-[11px] text-surface-500">Pedidos</span>
                      </Link>
                    ))}
                    <div className="h-px bg-surface-800 my-1" />
                    <p className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-[0.16em] text-surface-500">Distribuidores</p>
                    {ALL_PROVIDERS.filter((p) => !providerHasOrderHistory(p)).map((p) => (
                      <Link
                        key={p}
                        href={providerOrdersHref(p)}
                        onClick={() => setPedidosOpen(false)}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-surface-300 hover:bg-surface-900"
                      >
                        <ProviderBadge provider={p} variant="inline" size="sm" />
                        <span className="text-[11px] text-surface-600">Cuenta</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              {items.length > 0 && (
                <>
                  <div className="relative" ref={exportRef}>
                    <button
                      onClick={() => setExportOpen((v) => !v)}
                      className="flex items-center gap-1.5 text-sm text-surface-300 hover:text-white border border-surface-700 hover:border-surface-500 rounded-md px-3 py-1.5 transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5" />}
                      {copied ? "Copiado" : "Exportar"}
                      <ChevronDown className="w-3 h-3 text-surface-500" />
                    </button>
                    {exportOpen && (
                      <div className="absolute right-0 top-full mt-1.5 w-48 bg-surface-900 border border-surface-700 rounded-md shadow-xl z-30 py-1">
                        <button onClick={copyForWhatsApp} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-200 hover:bg-surface-800">
                          <Copy className="w-3.5 h-3.5 text-surface-500" /> Copiar para WhatsApp
                        </button>
                        <button onClick={shareWhatsApp} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-200 hover:bg-surface-800">
                          <MessageCircle className="w-3.5 h-3.5 text-surface-500" /> Abrir WhatsApp
                        </button>
                        <div className="h-px bg-surface-800 my-1" />
                        <button onClick={exportCSV} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-200 hover:bg-surface-800">
                          <FileText className="w-3.5 h-3.5 text-surface-500" /> CSV
                        </button>
                        <button onClick={exportJSON} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-200 hover:bg-surface-800">
                          <Download className="w-3.5 h-3.5 text-surface-500" /> JSON
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setConfirmClear("all")}
                    className="text-sm text-surface-500 hover:text-red-400 border border-transparent hover:border-red-500/30 rounded-md px-3 py-1.5 transition-colors"
                  >
                    Vaciar
                  </button>
                </>
              )}
            </div>
          </header>

          {notice && (
            <div className="flex-shrink-0 px-5 lg:px-8 py-2.5 text-sm text-emerald-300 bg-emerald-500/10 border-b border-emerald-500/20">
              {notice}
            </div>
          )}

          <div className="flex-shrink-0 px-5 lg:px-8 pt-3 empty:hidden">
            <PendingOrdersBanner onCreated={onBackgroundOrderCreated} />
          </div>

          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <p className="text-base text-surface-200">No hay productos en esta cotización</p>
              <p className="text-sm text-surface-500 mt-2 max-w-md">
                Agregá ítems desde la búsqueda. Cada línea muestra neto, IVA, imp. internos y percepciones.
              </p>
              <Link href="/search" className="mt-5 text-sm font-medium text-brand-400 hover:text-brand-300 border-b border-brand-400/40 pb-0.5">
                Ir a buscar
              </Link>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              <div className="flex-shrink-0 border-b border-surface-800 px-5 lg:px-8 bg-surface-950">
                <div className="flex gap-0 overflow-x-auto">
                  {tabsToShow.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`relative whitespace-nowrap text-sm px-3.5 py-3 transition-colors ${
                        activeTab === tab.key
                          ? "text-white"
                          : "text-surface-500 hover:text-surface-200"
                      }`}
                    >
                      {tab.label}
                      <span className="ml-1.5 text-xs tabular-nums text-surface-500">{tab.count}</span>
                      {activeTab === tab.key && (
                        <span className="absolute inset-x-3 -bottom-px h-px bg-brand-500" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 lg:px-8 py-6 flex flex-col gap-8">
                {activeTab === "all" ? (
                  sortedProviders.map((prov) => (
                    <ProviderSection
                      key={prov}
                      provider={prov}
                      items={byProvider[prov]}
                      totals={providerTotals[prov]}
                      extra={extraFor(prov)}
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
                    extra={extraFor(activeTab)}
                    fmt={fmt}
                    withIva={withIva}
                    setQty={setQty}
                    remove={remove}
                    onClearProvider={() => setConfirmClear(activeTab)}
                  />
                )}
              </div>

              <footer className="flex-shrink-0 border-t border-white/5 bg-surface-950">
                <div className="px-5 lg:px-8 py-4 flex flex-col gap-4">
                  <SummaryBar
                    title={activeTab === "all" ? "Resumen" : activeTab.replace(/_/g, " ")}
                    totals={shownTotals}
                    fmt={fmt}
                    withIva={withIva}
                    currency={currency}
                    showInvidNote={activeTab === "INVID"}
                    historyHref={activeTab !== "all" ? providerOrdersHref(activeTab) : undefined}
                    historyLabel={activeTab !== "all" && providerHasOrderHistory(activeTab) ? "Historial" : activeTab !== "all" ? "Cuenta" : undefined}
                  />

                  {currentRate && currency === "ARS" && (
                    <p className="text-[11px] text-surface-600 -mt-1">
                      Dólar {dollarLabel(dollarType)} (${currentRate.venta.toLocaleString("es-AR")})
                    </p>
                  )}

                  {activeTab === "all" && (
                    <div className="flex flex-wrap items-center gap-2 min-h-9">
                      {sortedProviders.map((p) => {
                        const t = providerTotals[p];
                        return (
                          <div key={p} className="inline-flex h-9 overflow-hidden border border-surface-700 rounded-sm">
                            <button
                              onClick={() => setActiveTab(p)}
                              className="h-9 px-2.5 inline-flex items-center gap-2 text-sm hover:bg-surface-900 transition-colors"
                            >
                              <ProviderBadge provider={p} variant="inline" size="sm" />
                              <span className="tabular-nums text-surface-300">{fmt(t.totalUSD)}</span>
                            </button>
                            <Link
                              href={providerOrdersHref(p)}
                              title={providerHasOrderHistory(p) ? "Ver historial de pedidos" : "Ir a la cuenta del proveedor"}
                              className="h-9 px-2 inline-flex items-center border-l border-surface-700 text-surface-500 hover:text-white"
                            >
                              <History className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        );
                      })}
                      <span className="text-sm text-surface-500">
                        Solo informativo. Confirmá en la pestaña del proveedor.
                      </span>
                    </div>
                  )}

                  {activeTab === "INVID" && byProvider.INVID?.length > 0 && (
                    <InvidDraftPanel
                      compact
                      items={byProvider.INVID}
                      onCreated={(message) => {
                        setInvidPreview(null);
                        setNotice(message || "Borrador creado en Invid");
                        setActiveTab("all");
                        clearProvider("INVID");
                      }}
                      onPreviewed={setInvidPreview}
                    />
                  )}

                  {activeTab === "NEW_BYTES" && byProvider.NEW_BYTES?.length > 0 && (
                    <NewBytesDraftPanel
                      compact
                      items={byProvider.NEW_BYTES}
                      onCreated={(message) => {
                        setNbSnapshot(null);
                        setNotice(message || "Pedido creado en NewBytes");
                        setActiveTab("all");
                        clearProvider("NEW_BYTES");
                      }}
                      onPreviewed={setNbSnapshot}
                    />
                  )}

                  {activeTab === "ELIT" && byProvider.ELIT?.length > 0 && (
                    <ElitCheckoutPanel
                      items={byProvider.ELIT}
                      onCreated={(message) => {
                        setElitPreview(null);
                        setNotice(message || "Pedido creado en Elit");
                        setActiveTab("all");
                        clearProvider("ELIT");
                      }}
                      onPreviewed={setElitPreview}
                    />
                  )}

                  {activeTab === "GRUPO_NUCLEO" && byProvider.GRUPO_NUCLEO?.length > 0 && (
                    <GrupoNucleoCheckoutPanel
                      items={byProvider.GRUPO_NUCLEO}
                      onCreated={(message) => {
                        setNotice(message || "Pedido creado en Grupo Núcleo");
                        setActiveTab("all");
                        clearProvider("GRUPO_NUCLEO");
                      }}
                    />
                  )}

                  {activeTab === "AIR" && byProvider.AIR?.length > 0 && (
                    <AirCheckoutPanel
                      items={byProvider.AIR}
                      onCreated={(message) => {
                        setNotice(message || "Canasto enviado a Air");
                        setActiveTab("all");
                        clearProvider("AIR");
                      }}
                    />
                  )}
                </div>
              </footer>
            </div>
          )}

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
    </>
  );
}

function SummaryBar({
  title, totals, fmt, withIva, currency, showInvidNote, historyHref, historyLabel,
}: {
  title: string;
  totals: Totals;
  fmt: (n: number, digits?: number) => string;
  withIva: boolean;
  currency: string;
  showInvidNote: boolean;
  historyHref?: string;
  historyLabel?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 min-h-8">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm min-w-0">
        <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider mr-1">{title}</span>
        {historyHref && historyLabel && (
          <Link href={historyHref} className="text-[11px] text-surface-500 hover:text-white underline underline-offset-2">
            {historyLabel}
          </Link>
        )}
        <span className="text-surface-500">
          Neto <span className="tabular-nums text-surface-200">{fmt(totals.subtotalUSD)}</span>
        </span>
        {(totals.quotedShipping || totals.shippingUSD > 0.004) && (
          <span className="text-surface-500">
            Envío <span className="tabular-nums text-surface-200">{fmt(totals.shippingUSD, 2)}</span>
          </span>
        )}
        {withIva && (
          <>
            <span className="text-surface-500">
              IVA <span className="tabular-nums text-surface-200">{fmt(totals.ivaUSD, 2)}</span>
            </span>
            {totals.internosUSD > 0.004 && (
              <span className="text-surface-500">
                Internos <span className="tabular-nums text-surface-200">{fmt(totals.internosUSD, 2)}</span>
              </span>
            )}
            {totals.iibbUSD > 0.004 && (
              <span className="text-surface-500">
                {perceptionGroupLabel(totals.perceptionLines.length ? totals.perceptionLines : [{ label: "Percepciones", amount: totals.iibbUSD }])}{" "}
                <span className="tabular-nums text-surface-200">{fmt(totals.iibbUSD, 2)}</span>
              </span>
            )}
            {totals.perceptionLines.length > 1 && totals.perceptionLines.map((line, i) => (
              <span key={`${line.label}-${i}`} className="text-surface-600 text-xs">
                {line.label} <span className="tabular-nums">{fmt(line.amount, 2)}</span>
              </span>
            ))}
          </>
        )}
        {withIva && showInvidNote && !totals.quotedShipping && (
          <span className="text-xs text-surface-600">Perc./envío al validar</span>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-lg font-semibold text-white tabular-nums leading-none">{fmt(totals.totalUSD)}</p>
        {currency === "ARS" && (
          <p className="text-[11px] text-surface-500 tabular-nums mt-0.5">{formatUSD(totals.totalUSD)}</p>
        )}
        {!withIva && <p className="text-[11px] text-surface-500 mt-0.5">sin impuestos</p>}
      </div>
    </div>
  );
}

function ProviderSection({
  provider, items, totals, extra, fmt, withIva, setQty, remove, onClearProvider,
}: {
  provider: string;
  items: CartItem[];
  totals: Totals;
  extra?: TaxExtra;
  fmt: (n: number, digits?: number) => string;
  withIva: boolean;
  setQty: (p: string, e: string, q: number) => void;
  remove: (p: string, e: string) => void;
  onClearProvider: () => void;
}) {
  if (!items || items.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-surface-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <ProviderBadge provider={provider} variant="inline" size="md" />
          <span className="text-xs text-surface-500 tabular-nums">
            {totals.productCount} {totals.productCount === 1 ? "línea" : "líneas"} · {totals.itemCount} u.
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[15px] font-medium text-white tabular-nums">{fmt(totals.totalUSD)}</span>
          <button onClick={onClearProvider} className="text-surface-600 hover:text-red-400 transition-colors" title="Quitar proveedor">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="hidden md:grid grid-cols-[minmax(0,1.5fr)_80px_100px_100px_100px_100px_110px_36px] gap-3 pt-3 pb-1.5 text-xs font-medium uppercase tracking-wider text-surface-500">
        <span>Producto</span>
        <span className="text-center">Cant.</span>
        <span className="text-right">Neto</span>
        <span className="text-right">IVA</span>
        <span className="text-right">Internos</span>
        <span className="text-right">Perc.</span>
        <span className="text-right">Total</span>
        <span />
      </div>

      <div className="divide-y divide-surface-800/80">
        {items.map((it) => (
          <CartLine
            key={`${it.provider}-${it.externalId}`}
            item={it}
            siblings={items}
            extra={extra}
            fmt={fmt}
            withIva={withIva}
            setQty={setQty}
            remove={remove}
          />
        ))}
      </div>

      {provider === "INVID" && items.every((it) => !linePerceptionFromOrder(it, items, extra)) && (
        <p className="text-xs text-surface-500 mt-2">
          Las percepciones de Invid aparecen al validar stock.
        </p>
      )}
    </section>
  );
}

function CartLine({
  item, siblings, extra, fmt, withIva, setQty, remove,
}: {
  item: CartItem;
  siblings: CartItem[];
  extra?: TaxExtra;
  fmt: (n: number, digits?: number) => string;
  withIva: boolean;
  setQty: (p: string, e: string, q: number) => void;
  remove: (p: string, e: string) => void;
}) {
  const pricing = linePricing(item, item.qty);
  const taxLines = extractTaxLines(item);
  const iva = taxByKind(taxLines, "iva");
  const internos = taxByKind(taxLines, "internos");
  const iibb = linePerceptionFromOrder(item, siblings, extra);
  const others = taxLines.filter((l) => l.kind === "other" && l.unitAmount > 0);
  const onProduct = (taxByKind(taxLines, "iibb")?.unitAmount ?? 0) > 0.0001;
  const percExtra = !onProduct && iibb ? iibb.unitAmount * item.qty : 0;
  const lineGross = pricing.gross + percExtra;
  const href = `/product/${encodeURIComponent(item.provider)}/${encodeURIComponent(item.externalId)}`;
  const sku = item.sku || item.partNumber || item.externalId;

  return (
    <div className="py-4 md:grid md:grid-cols-[minmax(0,1.5fr)_80px_100px_100px_100px_100px_110px_36px] md:gap-3 md:items-center">
      <div className="flex items-start gap-3.5 min-w-0">
        <Link href={href} className="w-16 h-16 relative flex-shrink-0 bg-white rounded-md overflow-hidden border border-surface-800">
          {item.imageUrl ? (
            <Image src={proxyImg(item.imageUrl)} alt="" fill className="object-contain p-1" unoptimized />
          ) : (
            <ImageOff className="w-4 h-4 text-surface-400 absolute inset-0 m-auto" />
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={href} className="text-[15px] text-surface-100 leading-snug line-clamp-2 hover:text-white">
            {item.name}
          </Link>
          <p className="text-xs text-surface-500 font-mono mt-1 truncate">
            {item.brand ? `${item.brand} · ` : ""}#{sku}
          </p>
          {item.stockStatus?.toLowerCase().includes("bajo") && (
            <p className="text-xs text-amber-400/90 mt-0.5">Stock bajo</p>
          )}
          {others.length > 0 && (
            <p className="text-xs text-surface-500 mt-0.5">
              {others.map((o) => `${o.label} ${formatAlicuota(o.percent)} ${fmt(o.unitAmount * item.qty, 2)}`).join(" · ")}
            </p>
          )}
          <div className="md:hidden mt-2.5 grid grid-cols-3 gap-x-3 gap-y-1">
            <TaxCell label="IVA" line={iva} qty={item.qty} fmt={fmt} />
            <TaxCell label="Internos" line={internos} qty={item.qty} fmt={fmt} />
            <TaxCell label={iibb?.label || "Perc."} line={iibb} qty={item.qty} fmt={fmt} />
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
        primary={fmt(withIva ? lineGross : pricing.net, 2)}
        emphasize
      />

      <div className="hidden md:flex justify-end">
        <button onClick={() => remove(item.provider, item.externalId)} className="text-surface-600 hover:text-red-400 p-1" title="Quitar">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="md:hidden flex items-center justify-between mt-2 pt-2 border-t border-surface-800/60">
        <span className="text-xs text-surface-500">Total línea</span>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-white tabular-nums">{fmt(withIva ? lineGross : pricing.net, 2)}</span>
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
      {label && <p className="text-[11px] uppercase tracking-wider text-surface-500 mb-0.5">{label}</p>}
      {empty ? (
        <p className="text-sm text-surface-600 tabular-nums">—</p>
      ) : (
        <>
          <p className="text-xs text-surface-500 tabular-nums">{formatAlicuota(line.percent)}</p>
          <p className="text-sm text-surface-200 tabular-nums leading-tight">{fmt(line.unitAmount * qty, 2)}</p>
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
      <p className={`tabular-nums leading-tight ${emphasize ? "text-[15px] font-semibold text-white" : "text-sm text-surface-200"}`}>
        {primary}
      </p>
      {secondary && <p className="text-xs text-surface-500 tabular-nums mt-0.5">{secondary}</p>}
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
    <div className="inline-flex items-center border border-surface-700 rounded-md h-8">
      <button onClick={onDec} className="w-8 h-8 flex items-center justify-center text-surface-400 hover:text-white" aria-label="Restar">
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        type="number"
        min={1}
        value={qty}
        onChange={(e) => onSet(Math.max(1, parseInt(e.target.value) || 1))}
        className="w-9 bg-transparent text-white text-sm font-medium text-center focus:outline-none tabular-nums"
      />
      <button onClick={onInc} className="w-8 h-8 flex items-center justify-center text-surface-400 hover:text-white" aria-label="Sumar">
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
