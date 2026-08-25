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
import { useCart, CartItem, cartItemKey, type CartRef, type CartScheme } from "@/lib/cart";
import { usePrefs } from "@/lib/prefs";
import { useIsRetailer, usePurchasePolicies, usePurchasePolicy } from "@/lib/purchase";
import { purchaseLinePricing, priceModeForCartItem } from "@/lib/purchase-price";
import { buildSellerMessage } from "@/lib/seller-message";
import { offlineOrdersFromCart } from "@/lib/offline-order";
import { proxyImg, formatUSD } from "@/lib/format";
import { getTenant } from "@/lib/auth";
import { useMyProviders } from "@/lib/myProviders";
import ProviderBadge from "@/components/ProviderBadge";
import {
  taxByKind,
  formatAlicuota,
  perceptionGroupLabel,
  linePerceptionFromOrder,
} from "@/lib/tax";
import { cartLinesFromItems, useCheckoutWarmup } from "@/lib/checkoutWarmup";
import { rememberIibbRate, getIibbRatePercent, useIibbRatesEpoch } from "@/lib/iibb-rates";
import {
  ALL_PROVIDERS,
  ElitCheckoutPreview,
  InvidCheckoutPreview,
  NewBytesCartSnapshot,
  AirCheckoutPreview,
  ordersApi,
} from "@/lib/api";
import {
  Trash2, Minus, Plus, Download, AlertTriangle, ImageOff,
  FileText, MessageCircle, Check, Copy, ChevronDown, History, StickyNote, ShoppingCart, Layers, ArrowRightLeft, Loader2,
} from "lucide-react";
import { providerHasOrderHistory, providerOrdersHref } from "@/lib/providerOrders";
import { SchemePicker } from "@/components/SchemePicker";
import { providerHasIvaRate } from "@/lib/purchase-pricing";
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

function cartPerception(item: CartItem, siblings: CartItem[], extra?: TaxExtra) {
  if (item.channel === "offline") return null;
  return linePerceptionFromOrder(item, siblings, extra);
}

export default function CartPage() {
  const {
    items, schemes, onlineByProvider, offlineByProvider,
    setQty, remove, clear, clearProvider, onlineCount, offlineCount,
  } = useCart();
  const { currency, withIva, convert, currentRate, dollarLabel, dollarType } = usePrefs();
  const iibbEpoch = useIibbRatesEpoch();
  const retailer = useIsRetailer();
  const policies = usePurchasePolicies();
  const { providers: myProviders } = useMyProviders();
  const [channelTab, setChannelTab] = useState<"online" | "offline">("online");
  const [invidPreview, setInvidPreview] = useState<InvidCheckoutPreview | null>(null);
  const [elitPreview, setElitPreview] = useState<ElitCheckoutPreview | null>(null);
  const [nbSnapshot, setNbSnapshot] = useState<NewBytesCartSnapshot | null>(null);

  const [confirmClear, setConfirmClear] = useState<"all" | string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [pedidosOpen, setPedidosOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingOffline, setConfirmingOffline] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const pedidosRef = useRef<HTMLDivElement>(null);

  const viewByProvider = channelTab === "offline" ? offlineByProvider : onlineByProvider;
  const viewItems = useMemo(
    () => (channelTab === "offline" ? items.filter((it) => it.channel === "offline") : items.filter((it) => it.channel !== "offline")),
    [items, channelTab]
  );
  const anyOfflinePolicy = Object.values(policies).some((p) => p.acceptsOffline);
  const showOfflineTab = retailer;

  useEffect(() => {
    if (activeTab !== "all" && !viewByProvider[activeTab]?.length) setActiveTab("all");
  }, [activeTab, viewByProvider]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const onBackgroundOrderCreated = useCallback((provider: PendingOrderProvider, message: string) => {
    setNotice(message);
    if (provider === "INVID") setInvidPreview(null);
    setActiveTab("all");
    clearProvider(provider, "online");
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
    () => Object.keys(viewByProvider).sort(),
    [viewByProvider]
  );

  function totalsFor(its: CartItem[], extra?: TaxExtra): Totals {
    let subtotalUSD = 0, ivaUSD = 0, internosUSD = 0, iibbUSD = 0, otherUSD = 0;
    const perceptionLines: PerceptionLine[] = [...(extra?.perceptionLines ?? [])];
    for (const it of its) {
      const pricing = purchaseLinePricing(it, policies[it.provider], priceModeForCartItem(it), it.qty);
      subtotalUSD += pricing.net;
      for (const line of pricing.lines) {
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
    if (channelTab !== "offline" && iibbUSD <= 0.0005) {
      void iibbEpoch;
      for (const it of its) {
        if (priceModeForCartItem(it) === "offline") continue;
        const pct = getIibbRatePercent(it.provider);
        if (pct == null || pct <= 0) continue;
        const pricing = purchaseLinePricing(it, policies[it.provider], priceModeForCartItem(it), it.qty);
        iibbUSD += pricing.net * (pct / 100);
      }
    }
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

  const invidLines = useMemo(() => cartLinesFromItems(onlineByProvider.INVID ?? []), [onlineByProvider.INVID]);
  const elitLines = useMemo(() => cartLinesFromItems(onlineByProvider.ELIT ?? []), [onlineByProvider.ELIT]);
  const nbLines = useMemo(() => cartLinesFromItems(onlineByProvider.NEW_BYTES ?? []), [onlineByProvider.NEW_BYTES]);
  const airLines = useMemo(() => cartLinesFromItems(onlineByProvider.AIR ?? []), [onlineByProvider.AIR]);
  const invidWarm = useCheckoutWarmup("INVID", invidLines);
  const elitWarm = useCheckoutWarmup("ELIT", elitLines);
  const nbWarm = useCheckoutWarmup("NEW_BYTES", nbLines);
  const airWarm = useCheckoutWarmup("AIR", airLines);

  const invidQuoted = invidPreview ?? (invidWarm.status === "ready" ? invidWarm.data?.preview ?? null : null);
  const elitQuoted = elitPreview ?? (elitWarm.status === "ready" ? elitWarm.data?.preview ?? null : null);
  const nbQuoted = nbSnapshot ?? (nbWarm.status === "ready" ? nbWarm.data?.preview ?? null : null);
  const airQuoted: AirCheckoutPreview | null =
    airWarm.status === "ready" ? airWarm.data?.preview ?? null : null;

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
  const airPerc =
    airQuoted == null
      ? 0
      : typeof airQuoted.perceptions === "number" && airQuoted.perceptions > 0.0005
        ? airQuoted.perceptions
        : Math.max(
            0,
            (airQuoted.total ?? 0) -
              (airQuoted.subtotal ?? 0) -
              (airQuoted.iva21 ?? 0) -
              (airQuoted.iva105 ?? 0) -
              (airQuoted.ii ?? 0)
          );
  const airExtra: TaxExtra | undefined = airQuoted
    ? {
        perceptionsUSD: airPerc > 0.0005 ? airPerc : 0,
        perceptionLines:
          airPerc > 0.0005 ? [{ label: "Percepciones", amount: airPerc }] : [],
        totalUSD: airQuoted.total,
      }
    : undefined;

  // Aprender alícuotas IIBB de cotizaciones reales para usarlas en búsqueda.
  useEffect(() => {
    if (invidQuoted?.stockOk && (invidQuoted.percepcionPercent ?? 0) > 0) {
      rememberIibbRate("INVID", invidQuoted.percepcionPercent!);
    }
  }, [invidQuoted]);
  useEffect(() => {
    if (!elitQuoted) return;
    const perc = elitQuoted.perceptions ?? 0;
    const net = elitQuoted.subtotal ?? 0;
    if (perc > 0.0005 && net > 0) {
      rememberIibbRate("ELIT", (perc / net) * 100);
    }
  }, [elitQuoted]);
  useEffect(() => {
    if (!nbQuoted) return;
    const perc = nbQuoted.perceptions ?? 0;
    const net = nbQuoted.subtotal ?? 0;
    if (perc > 0.0005 && net > 0) {
      rememberIibbRate("NEW_BYTES", (perc / net) * 100);
    }
  }, [nbQuoted]);
  useEffect(() => {
    if (!airQuoted) return;
    const perc = airPerc;
    const net = airQuoted.subtotal ?? 0;
    if (perc > 0.0005 && net > 0) {
      rememberIibbRate("AIR", (perc / net) * 100);
    }
  }, [airQuoted, airPerc]);

  function extraFor(provider: string): TaxExtra | undefined {
    if (channelTab === "offline") return undefined;
    const its = onlineByProvider[provider] ?? [];
    if (its.some((it) => it.schemeId)) return undefined;
    if (provider === "INVID") return invidExtra;
    if (provider === "ELIT") return elitExtra;
    if (provider === "NEW_BYTES") return nbExtra;
    if (provider === "AIR") return airExtra;
    return undefined;
  }

  const grand = useMemo(() => {
    const tot = totalsFor(viewItems);
    const parts = Object.entries(viewByProvider).map(([p, its]) => totalsFor(its, extraFor(p)));
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
  }, [viewItems, viewByProvider, withIva, invidQuoted, elitQuoted, nbQuoted, airQuoted, channelTab, policies, iibbEpoch]);
  const providerTotals = useMemo(() => {
    const m: Record<string, Totals> = {};
    for (const [p, its] of Object.entries(viewByProvider)) {
      m[p] = totalsFor(its, extraFor(p));
    }
    return m;
  }, [viewByProvider, withIva, invidQuoted, elitQuoted, nbQuoted, channelTab, policies]);

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
      const its = viewByProvider[prov];
      if (!its || its.length === 0) continue;
      const pt = providerTotals[prov];
      lines.push(`*${prov.replace(/_/g, " ")}*`);
      for (const it of its) {
        const extra = extraFor(prov);
        const pricing = purchaseLinePricing(it, policies[it.provider], priceModeForCartItem(it), it.qty);
        const perc = cartPerception(it, its, extra);
        const onProduct = (taxByKind(pricing.lines, "iibb")?.unitAmount ?? 0) > 0.0001;
        const gross = pricing.gross + (!onProduct && perc ? perc.unitAmount * it.qty : 0);
        const unit = withIva ? gross / it.qty : pricing.unitNet;
        const subtotal = withIva ? gross : pricing.net;
        const nameTrim = it.name.length > 70 ? it.name.slice(0, 67) + "..." : it.name;
        const qtyBit = it.qty > 1 ? ` x${it.qty}` : "";
        lines.push(`• ${nameTrim}${qtyBit}`);
        const taxes = [
          ...pricing.lines.filter((l) => l.kind !== "iibb" && l.unitAmount > 0),
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

  async function copySellerMessage() {
    const sellers: Record<string, string | null> = {};
    for (const p of myProviders) {
      sellers[p.provider] = p.accountManager?.name ?? null;
    }
    const txt = buildSellerMessage({
      scopeProvider: activeTab === "all" ? undefined : activeTab,
      items: viewItems,
      policies,
      clientName: getTenant()?.name ?? null,
      sellers,
      quoteRate: currentRate?.venta ?? null,
    });
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setExportOpen(false);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* ignore */ }
  }

  async function confirmOfflineOrder() {
    const groups = offlineOrdersFromCart(viewItems, policies, currentRate?.venta);
    if (groups.length === 0) return;
    setConfirmingOffline(true);
    setNotice(null);
    try {
      await ordersApi.createOffline(groups);
      await copySellerMessage();
      if (activeTab === "all") clear("offline");
      else clearProvider(activeTab, "offline");
      setActiveTab("all");
      setNotice("Pedido guardado en Nodo como aprobado. El mensaje quedó copiado para el vendedor. Si cambia algo, lo editás en Pedidos.");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setNotice(msg || "No se pudo guardar el pedido offline");
    } finally {
      setConfirmingOffline(false);
    }
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
      ...viewItems.map((it) => {
        const siblings = viewByProvider[it.provider] ?? [it];
        const extra = extraFor(it.provider);
        const pricing = purchaseLinePricing(it, policies[it.provider], priceModeForCartItem(it), it.qty);
        const taxLines = pricing.lines;
        const iva = taxByKind(taxLines, "iva");
        const internos = taxByKind(taxLines, "internos");
        const iibb = cartPerception(it, siblings, extra);
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
      items: viewItems.map((it) => {
        const siblings = viewByProvider[it.provider] ?? [it];
        const extra = extraFor(it.provider);
        const pricing = purchaseLinePricing(it, policies[it.provider], priceModeForCartItem(it), it.qty);
        const perc = cartPerception(it, siblings, extra);
        const onProduct = (taxByKind(pricing.lines, "iibb")?.unitAmount ?? 0) > 0.0001;
        return {
          provider: it.provider,
          externalId: it.externalId,
          name: it.name,
          qty: it.qty,
          channel: it.channel,
          schemeId: it.schemeId,
          unitNetUSD: pricing.unitNet,
          taxes: pricing.lines,
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
    { key: "all", label: "Todos", count: channelTab === "offline" ? offlineCount : onlineCount },
    ...sortedProviders.map((p) => ({
      key: p,
      label: p.replace(/_/g, " "),
      count: viewByProvider[p].reduce((s, it) => s + it.qty, 0),
    })),
  ];

  const shownItems = activeTab === "all" ? viewItems : viewByProvider[activeTab] || [];
  const shownTotals = (activeTab === "all" ? grand : providerTotals[activeTab]) ?? EMPTY_TOTALS;

  return (
    <>
          <header className="flex-shrink-0 border-b border-surface-800 px-5 lg:px-8 py-3.5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-white">
                {channelTab === "offline" ? "Pedido offline" : "Cotización"}
              </h1>
              <p className="text-xs text-surface-500 mt-0.5 tabular-nums">
                {viewItems.length === 0
                  ? channelTab === "offline" ? "Sin productos offline" : "Sin productos"
                  : `${viewItems.length} ${viewItems.length === 1 ? "línea" : "líneas"} · ${shownTotals.itemCount} ${shownTotals.itemCount === 1 ? "unidad" : "unidades"} · ${sortedProviders.length} ${sortedProviders.length === 1 ? "proveedor" : "proveedores"}`}
              </p>
              {showOfflineTab && (
                <div className="flex gap-1 mt-2">
                  <button
                    type="button"
                    onClick={() => { setChannelTab("online"); setActiveTab("all"); }}
                    className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border ${
                      channelTab === "online"
                        ? "border-brand-500 text-brand-300 bg-brand-500/10"
                        : "border-surface-700 text-surface-500 hover:text-surface-200"
                    }`}
                  >
                    <ShoppingCart className="w-3 h-3" />
                    Online
                    <span className="tabular-nums">{onlineCount}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setChannelTab("offline"); setActiveTab("all"); }}
                    className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border ${
                      channelTab === "offline"
                        ? "border-amber-500 text-amber-300 bg-amber-500/10"
                        : "border-surface-700 text-surface-500 hover:text-surface-200"
                    }`}
                  >
                    <StickyNote className="w-3 h-3" />
                    Offline
                    <span className="tabular-nums">{offlineCount}</span>
                  </button>
                </div>
              )}
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
              {viewItems.length > 0 && (
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
                      <div className="absolute right-0 top-full mt-1.5 w-56 bg-surface-900 border border-surface-700 rounded-md shadow-xl z-30 py-1">
                        <button onClick={() => void copySellerMessage()} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-200 hover:bg-surface-800">
                          <Copy className="w-3.5 h-3.5 text-surface-500" /> Mensaje para el vendedor
                        </button>
                        <button onClick={copyForWhatsApp} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-200 hover:bg-surface-800">
                          <Copy className="w-3.5 h-3.5 text-surface-500" /> Copiar cotización
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
            <div className={`flex-shrink-0 px-5 lg:px-8 py-2.5 text-sm border-b ${
              notice.startsWith("No se pudo")
                ? "text-red-300 bg-red-500/10 border-red-500/20"
                : "text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
            }`}>
              {notice}
              {notice.includes("Pedidos") && (
                <>
                  {" "}
                  <Link href="/pedidos" className="underline underline-offset-2 text-white">Ir a Pedidos</Link>
                </>
              )}
            </div>
          )}

          <div className="flex-shrink-0 px-5 lg:px-8 pt-3 empty:hidden">
            <PendingOrdersBanner onCreated={onBackgroundOrderCreated} />
          </div>

          {items.length === 0 && channelTab === "online" ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <p className="text-base text-surface-200">No hay productos en esta cotización</p>
              <p className="text-sm text-surface-500 mt-2 max-w-md">
                Agregá ítems desde la búsqueda. Cada línea muestra neto, IVA, imp. internos y percepciones.
              </p>
              <Link href="/search" className="mt-5 text-sm font-medium text-brand-400 hover:text-brand-300 border-b border-brand-400/40 pb-0.5">
                Ir a buscar
              </Link>
            </div>
          ) : viewItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <p className="text-base text-surface-200">
                {channelTab === "offline" ? "No hay productos en el pedido offline" : "No hay productos en el carrito online"}
              </p>
              <p className="text-sm text-surface-500 mt-2 max-w-md">
                {channelTab === "offline"
                  ? anyOfflinePolicy
                    ? "El pedido offline no se carga en el portal: se copia un mensaje para el vendedor."
                    : "Todavía no activaste el pedido offline. Entrá a un distribuidor → Configuración, marcá “Acepta pedidos offline” y elegí el IVA."
                  : "Los ítems offline están en la otra pestaña."}
              </p>
              {channelTab === "offline" && !anyOfflinePolicy && (
                <Link href="/proveedores" className="mt-5 text-sm font-medium text-amber-300 hover:text-amber-200 border-b border-amber-400/40 pb-0.5">
                  Ir a Proveedores
                </Link>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              <div className="flex-shrink-0 border-b border-surface-800 px-5 lg:px-8 bg-surface-950">
                <div className="flex gap-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:thin]">
                  {tabsToShow.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`relative flex-shrink-0 whitespace-nowrap text-sm px-3.5 py-3 transition-colors ${
                        activeTab === tab.key
                          ? "text-white"
                          : "text-surface-500 hover:text-surface-200"
                      }`}
                    >
                      {tab.label}
                      <span className="ml-1.5 text-xs tabular-nums text-surface-500">{tab.count}</span>
                      {activeTab === tab.key && (
                        <span className="pointer-events-none absolute inset-x-3 bottom-0 h-0.5 bg-brand-500" />
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
                      channel={channelTab}
                      items={viewByProvider[prov]}
                      schemes={schemes.filter((s) => s.provider === prov)}
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
                    channel={channelTab}
                    items={shownItems}
                    schemes={schemes.filter((s) => s.provider === activeTab)}
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

                  {channelTab === "online" && activeTab === "INVID" && onlineByProvider.INVID?.length > 0 && (
                    <InvidDraftPanel
                      compact
                      items={onlineByProvider.INVID}
                      onCreated={(message) => {
                        setInvidPreview(null);
                        setNotice(message || "Borrador creado en Invid");
                        setActiveTab("all");
                        clearProvider("INVID", "online");
                      }}
                      onPreviewed={setInvidPreview}
                    />
                  )}

                  {channelTab === "online" && activeTab === "NEW_BYTES" && onlineByProvider.NEW_BYTES?.length > 0 && (
                    <NewBytesDraftPanel
                      compact
                      items={onlineByProvider.NEW_BYTES}
                      onCreated={(message) => {
                        setNbSnapshot(null);
                        setNotice(message || "Pedido creado en NewBytes");
                        setActiveTab("all");
                        clearProvider("NEW_BYTES", "online");
                      }}
                      onPreviewed={setNbSnapshot}
                    />
                  )}

                  {channelTab === "online" && activeTab === "ELIT" && onlineByProvider.ELIT?.length > 0 && (
                    <ElitCheckoutPanel
                      items={onlineByProvider.ELIT}
                      onCreated={(message) => {
                        setElitPreview(null);
                        setNotice(message || "Pedido creado en Elit");
                        setActiveTab("all");
                        clearProvider("ELIT", "online");
                      }}
                      onPreviewed={setElitPreview}
                    />
                  )}

                  {channelTab === "online" && activeTab === "GRUPO_NUCLEO" && onlineByProvider.GRUPO_NUCLEO?.length > 0 && (
                    <GrupoNucleoCheckoutPanel
                      items={onlineByProvider.GRUPO_NUCLEO}
                      onCreated={(message) => {
                        setNotice(message || "Pedido creado en Grupo Núcleo");
                        setActiveTab("all");
                        clearProvider("GRUPO_NUCLEO", "online");
                      }}
                    />
                  )}

                  {channelTab === "online" && activeTab === "AIR" && onlineByProvider.AIR?.length > 0 && (
                    <AirCheckoutPanel
                      items={onlineByProvider.AIR}
                      onCreated={(message) => {
                        setNotice(message || "Canasto enviado a Air");
                        setActiveTab("all");
                        clearProvider("AIR", "online");
                      }}
                    />
                  )}
                  {channelTab === "offline" && viewItems.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-amber-200/80">
                        Se guarda en Nodo como pedido aprobado. No se carga en el portal: el mensaje es para el vendedor. Si después cambia, lo editás en Pedidos.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void confirmOfflineOrder()}
                          disabled={confirmingOffline}
                          className="self-start flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-semibold rounded-lg px-3 py-2"
                        >
                          {confirmingOffline ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          {confirmingOffline ? "Guardando…" : "Confirmar pedido"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void copySellerMessage()}
                          className="self-start flex items-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-100 text-sm font-medium rounded-lg px-3 py-2"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copiar mensaje
                        </button>
                      </div>
                    </div>
                  )}
                  {channelTab === "online" && viewItems.some((it) => it.schemeId) && (
                    <p className="text-xs text-violet-300/80">
                      El portal recibe los ítems sueltos, sin agrupar. El esquema es para el vendedor: usá “Mensaje para el vendedor”.
                    </p>
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
                    ? channelTab === "offline"
                      ? "Se eliminan las líneas del pedido offline. El carrito online no se toca."
                      : "Se eliminan las líneas del carrito online. El pedido offline no se toca."
                    : `Se eliminan las líneas de ${confirmClear.replace(/_/g, " ")} en este carrito.`}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmClear(null)} className="flex-1 border border-surface-700 text-surface-300 hover:text-white rounded-md py-2 text-sm">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (confirmClear === "all") clear(channelTab);
                  else clearProvider(confirmClear, channelTab);
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
  provider, channel, items, schemes, totals, extra, fmt, withIva, setQty, remove, onClearProvider,
}: {
  provider: string;
  channel: "online" | "offline";
  items: CartItem[];
  schemes: CartScheme[];
  totals: Totals;
  extra?: TaxExtra;
  fmt: (n: number, digits?: number) => string;
  withIva: boolean;
  setQty: (ref: CartRef, qty: number) => void;
  remove: (ref: CartRef) => void;
  onClearProvider: () => void;
}) {
  const policy = usePurchasePolicy(provider);
  const [createOpen, setCreateOpen] = useState(false);
  if (!items || items.length === 0) return null;
  const canCreateScheme = channel === "online" && policy.acceptsScheme && providerHasIvaRate(provider);
  const loose = items.filter((it) => !it.schemeId);
  const schemeGroups = schemes
    .map((s) => ({ scheme: s, items: items.filter((it) => it.schemeId === s.id) }))
    .filter((g) => g.items.length > 0);
  const orphanSchemeItems = items.filter((it) => it.schemeId && !schemes.some((s) => s.id === it.schemeId));

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
          {canCreateScheme && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1 text-xs font-medium text-violet-300 hover:text-white border border-violet-500/30 hover:border-violet-400/50 rounded-md px-2 py-1"
            >
              <Layers className="w-3 h-3" />
              Crear esquema
            </button>
          )}
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
        {loose.length > 0 && schemeGroups.length > 0 && (
          <p className="pt-3 pb-1 text-[11px] uppercase tracking-wider text-surface-500">Sin esquema</p>
        )}
        {loose.map((it) => (
          <CartLine key={cartItemKey(it)} item={it} siblings={items} extra={extra} fmt={fmt} withIva={withIva} setQty={setQty} remove={remove} />
        ))}
        {schemeGroups.map(({ scheme, items: grouped }) => (
          <div key={scheme.id} className="pt-3">
            <SchemeGroupHeader scheme={scheme} />
            {grouped.map((it) => (
              <CartLine key={cartItemKey(it)} item={it} siblings={items} extra={extra} fmt={fmt} withIva={withIva} setQty={setQty} remove={remove} />
            ))}
          </div>
        ))}
        {orphanSchemeItems.map((it) => (
          <CartLine key={cartItemKey(it)} item={it} siblings={items} extra={extra} fmt={fmt} withIva={withIva} setQty={setQty} remove={remove} />
        ))}
      </div>

      {channel === "online" && provider === "INVID" && items.every((it) => !cartPerception(it, items, extra)) && (
        <p className="text-xs text-surface-500 mt-2">
          Las percepciones de Invid aparecen al validar stock.
        </p>
      )}

      {createOpen && (
        <CreateSchemeFromCart provider={provider} items={items} onClose={() => setCreateOpen(false)} />
      )}
    </section>
  );
}

function SchemeGroupHeader({ scheme }: { scheme: CartScheme }) {
  const { renameScheme, deleteScheme } = useCart();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(scheme.name);

  function save() {
    renameScheme(scheme.id, name);
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-2 mb-1">
      {editing ? (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setName(scheme.name);
              setEditing(false);
            }
          }}
          autoFocus
          className="bg-surface-800 border border-violet-500/40 rounded px-2 py-0.5 text-[11px] text-violet-100 uppercase tracking-wider focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[11px] uppercase tracking-wider text-violet-300/80 hover:text-violet-100"
          title="Renombrar esquema"
        >
          {scheme.name}
        </button>
      )}
      <button
        type="button"
        onClick={() => deleteScheme(scheme.id)}
        className="text-surface-600 hover:text-red-400"
        title="Desarmar esquema (los productos quedan sueltos)"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

function CreateSchemeFromCart({
  provider, items, onClose,
}: {
  provider: string;
  items: CartItem[];
  onClose: () => void;
}) {
  const { createScheme, move } = useCart();
  const loose = items.filter((it) => !it.schemeId);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(loose.map((it) => cartItemKey(it))));

  function toggle(k: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function submit() {
    const scheme = createScheme(provider, name.trim() || undefined);
    for (const it of items) {
      if (selected.has(cartItemKey(it))) {
        move(it, { channel: "online", schemeId: scheme.id });
      }
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-surface-900 border border-surface-700 rounded-xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-white">Crear esquema</h3>
        <p className="text-xs text-surface-500 mt-1 mb-3">
          Agrupa ítems de este distribuidor. Al portal van sueltos; el vendedor ve el esquema en el mensaje.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del esquema"
          className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500 mb-3"
        />
        {loose.length > 0 ? (
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto mb-4">
            {loose.map((it) => {
              const k = cartItemKey(it);
              return (
                <label key={k} className="flex items-start gap-2 text-sm text-surface-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(k)}
                    onChange={() => toggle(k)}
                    className="mt-0.5"
                  />
                  <span className="line-clamp-2">{it.name}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-surface-500 mb-4">No hay ítems sueltos. Creá el esquema y después mové productos con “A esquema”.</p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 border border-surface-700 text-surface-300 rounded-md py-2 text-sm">
            Cancelar
          </button>
          <button type="button" onClick={submit} className="flex-1 bg-violet-600 hover:bg-violet-500 text-white rounded-md py-2 text-sm font-medium">
            Crear
          </button>
        </div>
      </div>
    </div>
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
  setQty: (ref: CartRef, qty: number) => void;
  remove: (ref: CartRef) => void;
}) {
  const { move } = useCart();
  const policy = usePurchasePolicy(item.provider);
  const [pickOpen, setPickOpen] = useState(false);
  const pricing = purchaseLinePricing(item, policy, priceModeForCartItem(item), item.qty);
  const taxLines = pricing.lines;
  const iva = taxByKind(taxLines, "iva");
  const internos = taxByKind(taxLines, "internos");
  const iibb = cartPerception(item, siblings, extra);
  const others = taxLines.filter((l) => l.kind === "other" && l.unitAmount > 0);
  const onProduct = (taxByKind(taxLines, "iibb")?.unitAmount ?? 0) > 0.0001;
  const percExtra = !onProduct && iibb ? iibb.unitAmount * item.qty : 0;
  const lineGross = pricing.gross + percExtra;
  const href = `/product/${encodeURIComponent(item.provider)}/${encodeURIComponent(item.externalId)}`;
  const sku = item.sku || item.partNumber || item.externalId;
  const ref: CartRef = { provider: item.provider, externalId: item.externalId, channel: item.channel, schemeId: item.schemeId };
  const hasIva = providerHasIvaRate(item.provider);
  const canMoveOffline = item.channel !== "offline" && hasIva && policy.acceptsOffline;
  const canMoveOnline = item.channel === "offline";
  const canScheme = item.channel !== "offline" && hasIva && policy.acceptsScheme;

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
          {pricing.missingIva && (
            <p className="text-xs text-amber-400/90 mt-0.5">Este producto no trajo alícuota de IVA</p>
          )}
          {others.length > 0 && (
            <p className="text-xs text-surface-500 mt-0.5">
              {others.map((o) => `${o.label} ${formatAlicuota(o.percent)} ${fmt(o.unitAmount * item.qty, 2)}`).join(" · ")}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {canMoveOffline && (
              <button
                type="button"
                onClick={() => move(ref, { channel: "offline" })}
                className="inline-flex items-center gap-1 text-[11px] text-amber-200/90 hover:text-white border border-amber-500/30 hover:border-amber-400/50 rounded px-1.5 py-0.5"
              >
                <ArrowRightLeft className="w-3 h-3" />
                Pasar a offline
              </button>
            )}
            {canMoveOnline && (
              <button
                type="button"
                onClick={() => move(ref, { channel: "online", schemeId: null })}
                className="inline-flex items-center gap-1 text-[11px] text-brand-300 hover:text-white border border-brand-500/30 hover:border-brand-400/50 rounded px-1.5 py-0.5"
              >
                <ArrowRightLeft className="w-3 h-3" />
                Pasar a online
              </button>
            )}
            {canScheme && (
              <button
                type="button"
                onClick={() => setPickOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] text-violet-300 hover:text-white border border-violet-500/30 hover:border-violet-400/50 rounded px-1.5 py-0.5"
              >
                <Layers className="w-3 h-3" />
                {item.schemeId ? "Cambiar esquema" : "A esquema"}
              </button>
            )}
            {canScheme && item.schemeId && (
              <button
                type="button"
                onClick={() => move(ref, { channel: "online", schemeId: null })}
                className="text-[11px] text-surface-500 hover:text-white border border-surface-700 rounded px-1.5 py-0.5"
              >
                Sacar del esquema
              </button>
            )}
          </div>
          {pickOpen && (
            <SchemePicker
              provider={item.provider}
              title="Mover a un esquema"
              hint="El descuento de esquema de este distribuidor se aplica a estos ítems. Al portal van sueltos."
              onPick={(s) => {
                move(ref, { channel: "online", schemeId: s.id });
                setPickOpen(false);
              }}
              onClose={() => setPickOpen(false)}
            />
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
          onDec={() => item.qty <= 1 ? remove(ref) : setQty(ref, item.qty - 1)}
          onInc={() => setQty(ref, item.qty + 1)}
          onSet={(q) => setQty(ref, q)}
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
        <button onClick={() => remove(ref)} className="text-surface-600 hover:text-red-400 p-1" title="Quitar">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="md:hidden flex items-center justify-between mt-2 pt-2 border-t border-surface-800/60">
        <span className="text-xs text-surface-500">Total línea</span>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-white tabular-nums">{fmt(withIva ? lineGross : pricing.net, 2)}</span>
          <button onClick={() => remove(ref)} className="text-surface-600 hover:text-red-400">
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
