"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import PrefsPanel from "@/components/PrefsPanel";
import PriceTag from "@/components/PriceTag";
import SalePricePanel from "@/components/SalePricePanel";
import { useResults } from "@/lib/results";
import { usePrefs } from "@/lib/prefs";
import { ProductDTO, Provider, searchApi, catalogApi, PricePoint, productDisplayBrand, productDisplayCategory, productDisplaySubcategory } from "@/lib/api";
import { proxyImg, formatARS, formatUSD, hasOwnPrice } from "@/lib/format";
import { ProductRichDescription, ProductSpecsTable } from "@/components/product/ProductRichContent";
import ProviderBadge, { providerLabel } from "@/components/ProviderBadge";
import ProductProviderLinks from "@/components/ProductProviderLinks";
import StorefrontProductInfo, { useStorefrontItem } from "@/components/storefront/StorefrontProductInfo";
import { safeHttpUrl } from "@/lib/providerLinks";
import ProductSyncedAt from "@/components/ProductSyncedAt";
import AiImageDisclaimer from "@/components/AiImageDisclaimer";
import {
  taxLabel,
  formatAlicuota,
} from "@/lib/tax";
import { displayAmountFromPricing, displayTaxTitle } from "@/lib/display-price";
import { getIibbRatePercent, useIibbRatesEpoch } from "@/lib/iibb-rates";
import { purchaseLinePricing, type PriceMode } from "@/lib/purchase-price";
import { usePurchasePolicy } from "@/lib/purchase";
import { applyPaymentOption, pricedPaymentOptions } from "@/lib/payment-options";
import { productShipping, useShippingContext } from "@/lib/product-shipping";
import { SHIPPING_DISCLAIMER, freeShippingLabel, SHIPPING_SPLIT_LABELS } from "@/lib/shipping";
import {
  ArrowLeft,
  Package,
  ImageOff,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  X,
  Copy,
  ExternalLink,
  Sparkles,
  TrendingUp,
  Check,
  ChevronDown,
  Store,
  Truck,
} from "lucide-react";
import ProductBuyActions, { EnableChannelsHint, useBuyChannels } from "@/components/ProductBuyActions";
import ProductKeySpecs from "@/components/product/ProductKeySpecs";
import SameProductElsewhere from "@/components/product/SameProductElsewhere";
import AddToQuoteButton from "@/components/quotes/AddToQuoteButton";
import { useQuotes } from "@/lib/quotes";
import { OwnStoreProductCompare } from "@/components/OwnStoreCompare";
import { salePresentation, useSellerSession } from "@/lib/sale-price";
import { signedMargin } from "@/lib/sale-margins";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import ArsPriceHint from "@/components/ArsPriceHint";
import { useActiveTourStep } from "@/lib/onboarding";

/** Miniaturas visibles al lado de la foto (la última muestra "+N" si hay más). */
const MAX_THUMBS = 5;

const CHANNEL_TABS: { mode: PriceMode; label: string }[] = [
  { mode: "list", label: "Online" },
  { mode: "offline", label: "Offline" },
  { mode: "scheme", label: "Esquema" },
];

export default function ProductPage({ params }: { params: Promise<{ provider: string; externalId: string }> }) {
  const { provider, externalId } = use(params);
  const router = useRouter();
  const { find, query } = useResults();
  const { currency, withIva, withIibb, convert, currentRate, dollarLabel, dollarType } = usePrefs();
  useIibbRatesEpoch();

  const dec = (s: string) => decodeURIComponent(s);
  const providerName = dec(provider);
  const extId = dec(externalId);
  const policy = usePurchasePolicy(providerName);
  const sellerSession = useSellerSession();

  const [product, setProduct] = useState<ProductDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState<ProductDTO[]>([]);
  const [imgErr, setImgErr] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [qty, setQty] = useState(1);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [copied, setCopied] = useState(false);
  // Tienda de un local: todas sus fotos y sus condiciones.
  const storefrontItem = useStorefrontItem(providerName, extId);
  const [imgIdx, setImgIdx] = useState(0);
  // Forma de compra elegida: cambia precio, desglose y botón.
  const [channel, setChannel] = useState<PriceMode>("list");

  useEffect(() => {
    setImgErr(false);
    setImgIdx(0);
    let cancelled = false;
    const found = find(providerName, extId);
    if (found) {
      setProduct(found);
      setLoading(false);
    } else {
      setLoading(true);
    }
    // Siempre pedimos la ficha completa: la búsqueda puede venir incompleta
    // o desactualizada respecto a marca/categoría/stock/etc.
    catalogApi
      .getProduct(providerName as Provider, extId)
      .then((res) => {
        if (!cancelled && res.data) setProduct(res.data);
      })
      .catch(() => {
        if (!cancelled && !found) setProduct(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerName, extId, find]);

  useEffect(() => {
    if (!product) return;
    catalogApi
      .priceHistory(providerName as Provider, extId)
      .then((res) => setPriceHistory(Array.isArray(res.data) ? res.data : []))
      .catch(() => setPriceHistory([]));
  }, [product, providerName, extId]);

  useEffect(() => {
    if (!query || !product) return;
    try {
      const raw = sessionStorage.getItem("tgs_last_results");
      if (raw) {
        const { r } = JSON.parse(raw);
        const sameProvider = (r as ProductDTO[])
          .filter((p) => p.provider === providerName && p.externalId !== extId)
          .slice(0, 6);
        setRelated(sameProvider);
      }
    } catch { /**/ }
  }, [query, product, providerName, extId]);

  async function searchSameName() {
    if (!product) return;
    try {
      const res = await searchApi.all(product.name.split(" ").slice(0, 3).join(" "));
      const others = res.data.filter((p) => p.externalId !== extId).slice(0, 8);
      setRelated(others);
    } catch { /**/ }
  }

  // Modo vendedor: el vendedor ve solo la venta; quien ve costos, la venta en el desglose.
  const present = product ? salePresentation(product, sellerSession, withIva) : ({ mode: "cost" } as const);
  const sellerView = present.mode === "sale";
  // Fotos: las de tu tienda; si no, las de la ficha enriquecida (con la del distribuidor al final); si no, la del distribuidor.
  const richImages = product?.platformContent?.images.map((i) => i.url) ?? [];
  const gallery = storefrontItem?.item.images.length
    ? storefrontItem.item.images
    : richImages.length
      ? [...richImages, ...(product?.imageUrl && !richImages.includes(product.imageUrl) ? [product.imageUrl] : [])]
      : product?.imageUrl
        ? [product.imageUrl]
        : [];
  const mainImage = gallery[imgIdx] ?? product?.imageUrl ?? null;
  const quotesEnabled = useQuotes().enabled;
  const saleUnitUsd = present.mode === "sale" || present.mode === "cost+sale" ? present.saleUsd : null;
  const unpriced = Boolean(product && (sellerView ? saleUnitUsd == null || saleUnitUsd <= 0 : !hasOwnPrice(product)));
  const channels = useBuyChannels(product);
  const activeChannel: PriceMode =
    channel === "offline" && !channels.offline ? "list" : channel === "scheme" && !channels.scheme ? "list" : channel;
  // En offline no hay percepciones.
  const effectiveIibb = withIibb && activeChannel !== "offline";
  const pricing = product ? purchaseLinePricing(product, policy, activeChannel, qty) : null;
  const taxLines = pricing?.lines ?? [];
  const shown = pricing
    ? displayAmountFromPricing(
        pricing,
        { withIva, withIibb: effectiveIibb, provider: providerName },
        qty
      )
    : null;
  const displayUSD = shown?.displayUsd ?? 0;
  const unitDisplayUsd = shown?.unitDisplayUsd ?? 0;
  const estimatedIibbLine =
    shown?.estimatedIibb && shown.iibbUnitUsd > 0.0001
      ? {
          label: "IIBB (est.)",
          percent: shown.iibbPercent,
          unitAmount: shown.iibbUnitUsd,
        }
      : null;
  const visibleTaxLines = taxLines.filter((l) => {
    if (l.kind === "iibb") return effectiveIibb;
    if (l.kind === "iva" || l.kind === "internos" || l.kind === "other") return withIva;
    return true;
  });
  const knownIibbPct = getIibbRatePercent(providerName);

  /**
   * Precio unitario según la forma de pago. Es otra opción de precio, no un
   * reemplazo: el costo final de arriba no se tacha ni cuando hay recargo.
   */
  const payPrices = pricedPaymentOptions(policy?.paymentOptions).map((o) => ({
    ...o,
    unitUsd: applyPaymentOption(unitDisplayUsd, o),
  }));

  /** Unitario final de una forma de compra, para comparar contra online. */
  const unitFor = (mode: PriceMode) =>
    product
      ? displayAmountFromPricing(
          purchaseLinePricing(product, policy, mode, 1),
          { withIva, withIibb: withIibb && mode !== "offline", provider: providerName },
          1
        ).unitDisplayUsd
      : 0;
  const channelSaving = (() => {
    if (!product || !hasOwnPrice(product)) return null;
    const online = unitFor("list");
    if (online <= 0) return null;
    const pct = (v: number) => `${(((v - online) / online) * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;
    if (activeChannel !== "list") {
      const here = unitFor(activeChannel);
      if (here >= online) return null;
      return `Ahorrás ${money(online - here)} por unidad (${pct(here)}) contra comprar online.`;
    }
    const tips: string[] = [];
    if (channels.offline) {
      const off = unitFor("offline");
      if (off < online) tips.push(`en offline te sale ${money(online - off)} menos por unidad (${pct(off)})`);
    }
    if (channels.scheme) {
      const sch = unitFor("scheme");
      if (sch < online) tips.push(`en esquema, ${money(online - sch)} menos (${pct(sch)})`);
    }
    return tips.length ? tips.join("; ").replace(/^./, (c) => c.toUpperCase()) + "." : null;
  })();
  const sectionTabs = [
    { id: "precio", label: "Precio y mercado" },
    ...(product?.platformContent || product?.description || product?.longDescription ? [{ id: "descripcion", label: "Descripción" }] : []),
    ...(product?.platformContent?.specs.length ? [{ id: "especificaciones", label: "Especificaciones" }] : []),
    { id: "datos", label: `Datos de ${providerLabel(providerName)}` },
  ];

  const shippingCtx = useShippingContext();
  const shippingEstimate = shippingCtx.estimates[providerName]?.estimate ?? null;
  const shipping = product ? productShipping(product, shippingCtx) : null;


  function copyId() {
    void navigator.clipboard.writeText(extId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  function money(usd: number) {
    if (currency === "USD") return formatUSD(usd);
    // Cotizado en pesos por el proveedor: en pesos se ve su precio original.
    if (product?.sourceCurrency === "ARS" && product.fxRate) return formatARS(usd * product.fxRate);
    return formatARS(convert(usd).amount);
  }

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950/95 backdrop-blur-sm px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <button
          type="button"
          onClick={() => {
            if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
            else router.back();
          }}
          className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a búsqueda
        </button>
        <PrefsPanel />
      </header>

      <div className="flex-1 overflow-y-auto" id="product-scroll">
        {loading && (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 rounded-full border-2 border-surface-700 border-t-brand-500 animate-spin" />
          </div>
        )}

        {!loading && !product && (
          <div className="px-6 py-16 max-w-2xl mx-auto text-center">
            <Package className="w-12 h-12 text-surface-700 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-white mb-2">Producto no encontrado</h2>
            <p className="text-sm text-surface-400 mb-1">
              No encontramos <span className="font-mono text-surface-200">{providerName} / {extId}</span> en nuestra base.
            </p>
            <Link
              href="/search"
              className="inline-flex items-center gap-2 mt-6 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-lg px-4 py-2 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Ir a búsqueda
            </Link>
          </div>
        )}

        {!loading && product && pricing && (
          <div className="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 sm:py-7 pb-16 flex flex-col gap-6">
            {/* Título, a todo el ancho */}
            <header className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <ProviderBadge provider={providerName} variant="inline" size="md" chip />
                {productDisplayBrand(product) && (
                  <Link
                    href={`/search?marca=${encodeURIComponent(productDisplayBrand(product)!)}`}
                    className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded border border-surface-700 bg-surface-900 text-surface-200 hover:border-brand-500/50 hover:text-brand-300 hover:bg-brand-600/10 transition-colors"
                    title={`Buscar marca ${productDisplayBrand(product)}`}
                  >
                    {productDisplayBrand(product)}
                  </Link>
                )}
                {productDisplayCategory(product) && (
                  <Link
                    href={`/search?categoria=${encodeURIComponent(productDisplayCategory(product)!)}`}
                    className="text-xs text-surface-400 hover:text-brand-300 transition-colors underline-offset-2 hover:underline"
                    title={`Filtrar por categoría ${productDisplayCategory(product)}`}
                  >
                    {productDisplayCategory(product)}
                  </Link>
                )}
                {productDisplaySubcategory(product) && (
                  <span className="text-xs text-surface-500">
                    {productDisplayCategory(product) ? "· " : ""}
                    {productDisplaySubcategory(product)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={copyId}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-surface-800 px-2 py-1 text-xs text-surface-400 hover:text-white hover:border-surface-600 transition-colors"
                  title="Copiar ID"
                >
                  <span className="font-mono">#{extId}</span>
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <h1 className="pp__name text-balance m-0">{product.name}</h1>
                <div className="flex flex-wrap items-center gap-3">
                  {(product.stock != null || product.stockStatus) && (
                    <span
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                        (product.stock ?? 0) > 0 ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      {product.stock != null ? `Stock: ${product.stock}` : ""}
                      {product.stock != null && product.stockStatus ? " · " : ""}
                      {product.stockStatus ?? ""}
                    </span>
                  )}
                  {/* Ir al proveedor: no para el vendedor en modo vendedor (el portal es la compra, con costos). */}
                  {!sellerSession.isSeller && <ProductProviderLinks provider={providerName} productUrl={product.productUrl} />}
                </div>
              </div>
              {!sellerSession.isSeller && storefrontItem && (
                <StorefrontProductInfo info={storefrontItem} productName={product.name} />
              )}
            </header>

            {/* Foto + atributos | compra */}
            <div className="flex flex-wrap gap-6 items-stretch">
              <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-4">
                <div className="flex flex-col-reverse sm:flex-row gap-3 min-w-0">
                  {gallery.length > 1 && (
                    <div className="flex sm:flex-col gap-2.5 overflow-x-auto sm:overflow-visible" role="list" aria-label="Fotos del producto">
                      {gallery.slice(0, MAX_THUMBS).map((src, i) => {
                        // La última miniatura visible lleva "+N" si hay más fotos: no se desborda la columna.
                        const more = i === MAX_THUMBS - 1 && gallery.length > MAX_THUMBS ? gallery.length - MAX_THUMBS + 1 : 0;
                        const isOn = more ? imgIdx >= i : i === imgIdx;
                        return (
                        <button
                          key={src}
                          type="button"
                          role="listitem"
                          onClick={() => {
                            setImgIdx(i);
                            setImgErr(false);
                          }}
                          aria-label={more ? `Ver ${more} fotos más` : `Foto ${i + 1}`}
                          aria-current={isOn}
                          className={`relative h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-xl border bg-white p-1 ${
                            isOn ? "border-brand-500 ring-2 ring-brand-500/40" : "border-surface-700 hover:border-surface-500"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={proxyImg(src, { trim: false })} alt="" className="h-full w-full object-contain" loading="lazy" draggable={false} onContextMenu={(e) => e.preventDefault()} />
                          {more > 0 && (
                            <span className="absolute inset-0 flex items-center justify-center bg-surface-950/70 text-sm font-bold text-white">
                              +{more}
                            </span>
                          )}
                        </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="relative flex-1 min-w-0 aspect-square sm:aspect-auto sm:h-[470px] bg-white rounded-2xl border border-surface-800 overflow-hidden shadow-sm">
                    {mainImage && !imgErr ? (
                      <>
                        <Image
                          key={mainImage}
                          src={proxyImg(mainImage, { trim: false })}
                          alt={product.name}
                          fill
                          className="object-contain p-8 sm:p-12"
                          unoptimized
                          onError={() => setImgErr(true)}
                          onContextMenu={(e) => e.preventDefault()}
                          draggable={false}
                          priority
                        />
                        <button
                          type="button"
                          onClick={() => setZoom(true)}
                          className="absolute top-3 right-3 bg-surface-950/80 hover:bg-surface-900 border border-surface-700 rounded-lg p-2 text-surface-300 hover:text-white transition-all"
                          aria-label="Ampliar imagen"
                        >
                          <ZoomIn className="w-4 h-4" />
                        </button>
                        {gallery.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={() => { setImgIdx((i) => (i - 1 + gallery.length) % gallery.length); setImgErr(false); }}
                              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-surface-700 bg-surface-950/80 p-2 text-surface-200 hover:bg-surface-900 hover:text-white"
                              aria-label="Foto anterior"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setImgIdx((i) => (i + 1) % gallery.length); setImgErr(false); }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-surface-700 bg-surface-950/80 p-2 text-surface-200 hover:bg-surface-900 hover:text-white"
                              aria-label="Foto siguiente"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {gallery.length > 1 && (
                          <span className="absolute left-3 bottom-3 rounded-full bg-surface-900 px-2.5 py-1 text-xs font-semibold text-surface-200">
                            {imgIdx + 1} / {gallery.length}
                          </span>
                        )}
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-950 text-surface-600">
                        {imgErr ? <ImageOff className="w-14 h-14" /> : <Package className="w-14 h-14" />}
                        <span className="text-sm">Sin imagen disponible</span>
                      </div>
                    )}
                  </div>
                </div>
                {product.imageAiSelected && product.imageUrl && mainImage === product.imageUrl && !imgErr && (
                  <AiImageDisclaimer className="text-surface-500 px-0.5" />
                )}

                {product.platformContent && (
                  <ProductKeySpecs
                    specs={product.platformContent.specs}
                    warranty={product.warranty || (product.platformContent.warrantyMonths ? `${product.platformContent.warrantyMonths} meses` : null)}
                  />
                )}

                <div className="mt-auto">
                  <OwnStoreProductCompare
                    productName={product.name}
                    costUsd={unpriced ? null : sellerView ? saleUnitUsd : unitDisplayUsd}
                    sale={sellerView}
                  />
                </div>
              </div>

              <aside className="flex-[1_1_380px] lg:max-w-[440px] min-w-0">
                <section aria-label="Comprar" className="h-full rounded-2xl border border-surface-800 bg-surface-900 p-[18px] flex flex-col gap-3.5">
                  {!sellerView && !unpriced && (channels.offline || channels.scheme) && (
                    <div role="group" aria-label="Forma de compra" className="grid grid-cols-3 gap-1 rounded-xl border border-surface-800 bg-surface-950 p-1">
                      {CHANNEL_TABS.map((t) => {
                        const enabled = t.mode === "list" || (t.mode === "offline" ? channels.offline : channels.scheme);
                        const on = activeChannel === t.mode;
                        return (
                          <button
                            key={t.mode}
                            type="button"
                            disabled={!enabled}
                            aria-pressed={on}
                            onClick={() => setChannel(t.mode)}
                            title={enabled ? undefined : `${providerLabel(providerName)} no ofrece ${t.label.toLowerCase()} para tu cuenta`}
                            className={`min-h-[40px] rounded-[9px] text-[13px] font-bold transition-colors ${
                              on ? "bg-brand-600 text-white" : enabled ? "text-surface-300 hover:text-white" : "text-surface-600 cursor-not-allowed"
                            }`}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-surface-400">
                      {sellerView
                        ? `Precio de venta · ${withIva ? "con IVA" : "sin IVA"}`
                        : unpriced
                          ? "Precio de tu cuenta"
                          : activeChannel === "offline"
                            ? "Offline · sin facturar"
                            : activeChannel === "scheme"
                              ? `Esquema · ${displayTaxTitle({ withIva, withIibb, provider: providerName }).toLowerCase()}`
                              : displayTaxTitle({ withIva, withIibb, provider: providerName })}
                      {!unpriced && currency === "ARS" && currentRate && product?.sourceCurrency !== "ARS"
                        ? ` · Dólar ${dollarLabel(dollarType)} $${currentRate.venta.toLocaleString("es-AR")}`
                        : ""}
                    </p>
                    <p className="mt-1 font-mono text-[34px] font-semibold leading-tight tabular-nums text-white">
                      {unpriced
                        ? sellerView ? "Sin precio de venta" : "Sin precio"
                        : money(sellerView ? saleUnitUsd ?? 0 : unitDisplayUsd)}
                    </p>
                    {product && (product.sourceCurrency === "ARS" || product.fxPending) && <ArsPriceHint product={product} />}
                    {!unpriced && !sellerView && channelSaving && (
                      <p className={`mt-0.5 text-[13px] leading-snug ${activeChannel === "list" ? "text-surface-400" : "text-emerald-300"}`}>{channelSaving}</p>
                    )}
                  </div>

                  {unpriced && sellerView && (
                    <p className="text-xs leading-relaxed text-surface-400">
                      Este producto todavía no tiene precio de venta. Lo calcula el comercio con su margen
                      apenas haya precio del distribuidor.
                    </p>
                  )}

                  {unpriced && !sellerView && (
                    <p className="text-xs leading-relaxed text-surface-400">
                      El precio y el stock aparecen cuando cargás la cuenta de este distribuidor.
                      La ficha es la misma para todos los locales; el importe es el de tu cuenta.
                    </p>
                  )}

                  {!unpriced && !sellerView && (
                    <div className="border-t border-surface-800 pt-3">
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-surface-400">Desglose del costo</p>
                      <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2">
                        <BreakdownRow
                          label={activeChannel === "offline" ? "Costo neto" : "Costo del distribuidor"}
                          value={money(pricing.unitNet)}
                          hint={activeChannel === "offline" ? "Sin facturar" : "Precio de lista, sin impuestos"}
                        />
                        {currency === "ARS" && currentRate && (
                          <BreakdownRow
                            label={`Cotización · ${dollarLabel(dollarType)}`}
                            value={`$${currentRate.venta.toLocaleString("es-AR")}`}
                            hint="Tipo de cambio aplicado"
                          />
                        )}
                        {visibleTaxLines.filter((l) => l.unitAmount > 0.0001).map((line) => (
                          <BreakdownRow
                            key={`${line.kind}-${line.label}`}
                            label={`${line.kind === "iibb" && line.estimated ? "IIBB (est.)" : line.label}${line.percent != null ? ` ${formatAlicuota(line.percent)}` : ""}`}
                            value={`+ ${money(line.unitAmount)}`}
                          />
                        ))}
                        {estimatedIibbLine &&
                          !visibleTaxLines.some((l) => l.kind === "iibb" && l.unitAmount > 0.0001) && (
                          <BreakdownRow
                            label={`${estimatedIibbLine.label}${estimatedIibbLine.percent != null ? ` ${formatAlicuota(estimatedIibbLine.percent)}` : ""}`}
                            value={`+ ${money(estimatedIibbLine.unitAmount)}`}
                          />
                        )}
                        {visibleTaxLines.every((l) => l.unitAmount <= 0.0001) &&
                          !estimatedIibbLine &&
                          pricing.tax > 0 &&
                          withIva && (
                          <BreakdownRow label={taxLabel(product)} value={`+ ${money(pricing.tax / qty)}`} />
                        )}
                        <BreakdownRow
                          label={activeChannel === "list" ? "Costo unitario final" : "Precio unitario"}
                          value={money(unitDisplayUsd)}
                          strong
                        />
                        {present.mode === "cost+sale" && activeChannel === "list" && (
                          <BreakdownRow
                            label={present.marginPercent != null ? `Precio de venta · margen ${signedMargin(present.marginPercent)}` : "Precio de venta"}
                            value={money(present.saleUsd)}
                            hint="Lo que ve un vendedor de tu equipo"
                          />
                        )}
                      </dl>
                      {effectiveIibb &&
                        !estimatedIibbLine &&
                        !visibleTaxLines.some((l) => l.kind === "iibb" && l.unitAmount > 0.0001) &&
                        knownIibbPct == null && (
                          <p className="mt-2 text-[11px] leading-snug text-surface-500">
                            No hay alícuota de percepción para este distribuidor. Cargala en Configuración, o cotizá en el carrito si el portal la informa.
                          </p>
                        )}
                      <p className="mt-2.5 text-[11px] leading-relaxed text-surface-500">
                        {activeChannel === "offline"
                          ? "Sin facturar: con el ajuste de IVA de este distribuidor y sin percepciones."
                          : `Usa tu cotización. IVA y percepciones se eligen arriba${withIibb ? "; en esquema también se aplican, en offline no" : ""}. El margen contra locales se calcula sobre tu costo final.`}
                      </p>
                    </div>
                  )}

                  {!unpriced && !sellerView && payPrices.length > 0 && (
                    <div className="border-t border-surface-800 pt-3">
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-surface-400">Según cómo pagues</p>
                      <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 gap-y-1.5 text-[13px]">
                        {payPrices.map((p) => (
                          <div key={p.id} className="contents">
                            <dt className="text-surface-400">{p.label}</dt>
                            <dd className={`m-0 font-mono text-xs ${p.kind === "SURCHARGE" ? "text-amber-300" : "text-emerald-300"}`}>
                              {p.kind === "SURCHARGE" ? "+" : "−"}{p.percent}%
                            </dd>
                            <dd className="m-0 text-right font-mono text-white">{money(p.unitUsd)}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="mt-2 text-[11px] leading-relaxed text-surface-500">
                        Para comparar: la forma de pago la arreglás con el distribuidor.
                      </p>
                    </div>
                  )}

                  {!unpriced && !sellerView && shippingEstimate && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-surface-800 bg-surface-950 px-3 py-2.5" title={SHIPPING_DISCLAIMER}>
                      <Truck className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 text-surface-400" />
                      <p className="text-xs leading-relaxed text-surface-300">
                        <strong className="text-white">Envío estimado:</strong>{" "}
                        {shippingEstimate.pickup ? (
                          <>con {providerLabel(providerName)} solés retirar, no se suma envío</>
                        ) : shipping?.free && shipping.freeShipping ? (
                          <>gratis, tu pedido llega a {freeShippingLabel(shipping.freeShipping)}</>
                        ) : shipping ? (
                          <>
                            {shippingEstimate.label} {money(shipping.costUsd)} por pedido ·{" "}
                            {shipping.basis === "in_cart" ? "ya cuenta en tu carrito" : `${money(shipping.perUnitUsd)}/u a este producto`}
                            {shipping.freeShipping && shipping.missingUsd != null && shipping.missingUsd > 0
                              ? ` · gratis desde ${freeShippingLabel(shipping.freeShipping)}, te faltan ${money(shipping.missingUsd)}`
                              : ""}
                          </>
                        ) : (
                          <>
                            tu forma habitual es {shippingEstimate.label}, pero falta su valor.{" "}
                            <Link href={`/proveedores/${encodeURIComponent(providerName)}`} className="underline">
                              Cargalo
                            </Link>
                          </>
                        )}
                        {shippingEstimate.source === "history" && shippingEstimate.orders
                          ? ` (${shippingEstimate.orders} de tus últimos ${shippingEstimate.ofOrders} pedidos)`
                          : ""}
                        .
                      </p>
                    </div>
                  )}

                  {!unpriced && (!sellerView || quotesEnabled) && (
                    <div className="mt-auto flex flex-col gap-2.5">
                      <div className="flex flex-wrap gap-2.5">
                        <div className="flex items-center rounded-xl border border-surface-700" aria-label="Cantidad">
                          <button
                            type="button"
                            onClick={() => setQty((q) => Math.max(1, q - 1))}
                            aria-label="Quitar uno"
                            className="flex h-[46px] w-[42px] items-center justify-center text-lg text-surface-200 hover:text-white"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            value={qty}
                            min={1}
                            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            aria-label="Cantidad"
                            className="w-9 bg-transparent text-center font-mono font-semibold text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => setQty((q) => q + 1)}
                            aria-label="Sumar uno"
                            className="flex h-[46px] w-[42px] items-center justify-center text-lg text-surface-200 hover:text-white"
                          >
                            +
                          </button>
                        </div>
                        {sellerView ? (
                          <div className="flex-1"><AddToQuoteButton product={product} qty={qty} variant="full" /></div>
                        ) : (
                          <ProductBuyActions product={product} qty={qty} channel={activeChannel} />
                        )}
                      </div>
                      <p className="text-xs text-surface-400">
                        Total {qty} u.: <span className="font-mono text-white">{money(sellerView ? (saleUnitUsd ?? 0) * qty : displayUSD)}</span>
                      </p>
                      {!sellerView && !channels.offline && !channels.scheme && channels.canEnable && (
                        <EnableChannelsHint provider={providerName} />
                      )}
                      {!sellerView && <AddToQuoteButton product={product} qty={qty} variant="outline" />}
                    </div>
                  )}
                </section>
              </aside>
            </div>

            {/* Saltos de sección */}
            <nav aria-label="Secciones de la ficha" className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-0.5 border-b border-surface-800 bg-surface-950/95 px-1 backdrop-blur-sm">
              {sectionTabs.map((t) => (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  className="px-3.5 py-3 text-sm font-semibold text-surface-400 hover:text-white border-b-2 border-transparent hover:border-brand-500 transition-colors"
                >
                  {t.label}
                </a>
              ))}
            </nav>

            {/* Precio + otros distribuidores | locales */}
            <div id="precio" className="scroll-mt-16 grid gap-6 lg:grid-cols-2 items-stretch">
              <div className="flex flex-col gap-6 min-w-0">
                {/* Es la evolución del costo: el vendedor no la ve. */}
                {!sellerView && <section className="rounded-2xl border border-surface-800 bg-surface-900/60 p-4 sm:p-5">
                  {/* Con historial, el gráfico trae su título y la variación. */}
                  {(unpriced || priceHistory.length < 1) && (
                    <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-white">
                      <TrendingUp className="w-4 h-4" />
                      Evolución de precio
                    </h2>
                  )}
                  {unpriced ? (
                    <p className="text-xs leading-relaxed text-surface-500">
                      Todavía no hay precio de tu cuenta para graficar.
                    </p>
                  ) : priceHistory.length >= 1 ? (
                    <PriceHistoryChart
                      points={priceHistory}
                      product={product}
                      policy={policy}
                      format={money}
                    />
                  ) : (
                    // Solo se guarda una fila cuando el precio cambia: un producto estable no tiene serie.
                    <div className="rounded-xl border border-surface-800 bg-surface-950/60 px-4 py-5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-surface-500">
                        Sin cambios de precio
                      </p>
                      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-white">
                        {money(unitDisplayUsd)}
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-surface-500">
                        El precio se mantiene desde que seguimos este producto. La curva aparece
                        con el primer cambio.
                      </p>
                    </div>
                  )}
                </section>}

                <SameProductElsewhere
                  current={product}
                  entries={product.sameProduct ?? []}
                  onSearchSimilar={() => void searchSameName()}
                />
              </div>

              <LocalesPanel seedQuery={product.name} costUsd={sellerView ? saleUnitUsd ?? 0 : unitDisplayUsd} />
            </div>

            {related.length > 0 && (
              <section>
                <h2 className="pp pp__sec-title">
                  <Sparkles className="w-3 h-3" />
                  Relacionados
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {related.map((p, i) => (
                    <RelatedCard key={`${p.provider}-${p.externalId}-${i}`} product={p} />
                  ))}
                </div>
              </section>
            )}

            {product.platformContent && (
              <ProductRichDescription id="descripcion" content={product.platformContent} provider={product.provider} externalId={product.externalId} />
            )}
            {product.platformContentLimited && (
              <p className="rounded-xl border border-surface-800 bg-surface-900/60 px-4 py-3 text-xs text-surface-400">
                Hoy ya viste muchas fichas completas. Mañana vuelven a verse las fotos, la descripción y las especificaciones de NODO.
              </p>
            )}
            {!product.platformContent?.descriptionHtml && !product.platformContent?.shortDescription && (product.description || product.longDescription) && (
              <section id="descripcion" className="scroll-mt-16 rounded-2xl border border-surface-800 bg-surface-900/60 p-5 sm:p-6">
                <h2 className="mb-3 text-lg font-bold text-white">Descripción</h2>
                {product.description && (
                  <p className="text-sm text-surface-300 leading-relaxed whitespace-pre-wrap">
                    {product.description}
                  </p>
                )}
                {product.longDescription &&
                  product.longDescription !== product.description && (
                    <p className="text-sm text-surface-400 leading-relaxed whitespace-pre-wrap mt-3">
                      {product.longDescription}
                    </p>
                  )}
              </section>
            )}
            {product.platformContent && <ProductSpecsTable id="especificaciones" specs={product.platformContent.specs} />}

            <ProductFactsGrid product={product} extId={extId} providerName={providerName} />

            <ProductSyncedAt
              syncedAt={product.syncedAt}
              className="text-[11px] text-surface-500 text-center pt-2 border-t border-surface-800/60"
            />
          </div>
        )}
      </div>

      {zoom && mainImage && (
        <div
          role="dialog"
          aria-modal
          onClick={() => setZoom(false)}
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6 cursor-zoom-out"
        >
          <button
            type="button"
            className="absolute top-5 right-5 text-white p-2 hover:bg-white/10 rounded-lg"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="relative w-full h-full max-w-4xl max-h-[90dvh] bg-white rounded-xl overflow-hidden">
            <Image
              src={proxyImg(mainImage, { trim: false })}
              alt={product?.name ?? ""}
              fill
              className="object-contain p-4"
              unoptimized
            />
          </div>
        </div>
      )}
    </>
  );
}

function LocalesPanel({
  seedQuery,
  costUsd,
}: {
  seedQuery: string;
  costUsd: number;
}) {
  // En mobile arranca cerrado: la búsqueda de locales no invade el medio de la ficha.
  // En desktop (lg+) siempre abierta.
  const [open, setOpen] = useState(false);
  const tourStep = useActiveTourStep();

  // El recorrido muestra esta sección: en mobile se abre sola.
  useEffect(() => {
    if (tourStep === "local-prices") setOpen(true);
  }, [tourStep]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setOpen(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <section
      id="precios-locales"
      data-tour="local-prices"
      className="min-w-0 rounded-2xl border border-surface-800 bg-surface-900/60 p-4 sm:p-5"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="lg:hidden w-full flex items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Store className="w-4 h-4 text-brand-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-white">Precios de venta en locales</span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-surface-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div className={`${open ? "block mt-4 lg:mt-0" : "hidden"} lg:block`}>
        <SalePricePanel variant="inline" layout="list" seedQuery={seedQuery} costUsd={costUsd} active={open} />
      </div>
    </section>
  );
}


function ProductFactsGrid({
  product,
  extId,
  providerName,
}: {
  product: ProductDTO;
  extId: string;
  providerName: string;
}) {
  const facts = productFacts(product, extId, providerName);
  if (facts.length === 0) return null;
  const links = facts.filter((f) => f.href);
  const rows = facts.filter((f) => !f.href);

  return (
    <section id="datos" className="scroll-mt-16 rounded-2xl border border-surface-800 bg-surface-900/60 p-5 sm:p-6">
      <h2 className="mb-2.5 text-lg font-bold text-white">Datos de {providerLabel(providerName)}</h2>
      <dl className="m-0 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-7">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0 border-b border-surface-800 py-2.5">
            <dt className="text-[11px] text-surface-400">{row.label}</dt>
            <dd className={`m-0 mt-0.5 text-[13px] text-white break-words ${row.mono ? "font-mono" : ""} ${row.strongColor ?? ""}`}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {links.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-4">
          {links.map((row) => (
            <a
              key={row.label}
              href={row.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-400 hover:text-brand-300"
            >
              {row.label === "Ficha del proveedor" ? `Abrir la ficha en ${providerLabel(providerName)}` : "Ver la imagen original"}
              <ExternalLink className="w-3 h-3" />
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function present(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

function formatDim(v: string | number | null | undefined): string | null {
  if (!present(v)) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isFinite(n)) return String(n);
  return String(v).trim();
}

function productFacts(
  product: ProductDTO,
  extId: string,
  providerName: string
): { label: string; value: string; mono?: boolean; href?: string; strongColor?: string }[] {
  const rows: { label: string; value: string; mono?: boolean; href?: string; strongColor?: string }[] = [];
  const push = (
    label: string,
    value: unknown,
    opts?: { mono?: boolean; href?: string; strongColor?: string }
  ) => {
    if (!present(value)) return;
    rows.push({ label, value: String(value).trim(), ...opts });
  };

  push("Proveedor", providerLabel(providerName));
  push("Marca", productDisplayBrand(product));
  if (product.brand && product.brand !== productDisplayBrand(product)) {
    push("Marca (proveedor)", product.brand);
  }
  push("Categoría", productDisplayCategory(product));
  if (product.category && product.category !== productDisplayCategory(product)) {
    push("Categoría (proveedor)", product.category);
  }
  push("Subcategoría", productDisplaySubcategory(product));
  if (product.subcategory && product.subcategory !== productDisplaySubcategory(product)) {
    push("Subcategoría (proveedor)", product.subcategory);
  }
  push("ID externo", extId, { mono: true });
  if (product.sku && product.sku !== extId) push("SKU", product.sku, { mono: true });
  push("Part number", product.partNumber, { mono: true });
  push("EAN", product.ean, { mono: true });
  if (product.stock != null) push("Stock", product.stock);
  push("Estado de stock", product.stockStatus);
  push("Ubicación / depósito", product.locationAir);
  push("Garantía", product.warranty);
  push("Impuestos detectados", taxLabel(product));
  if (product.ivaPercent != null && present(product.ivaPercent)) {
    push("IVA %", `${formatAlicuota(Number(product.ivaPercent))}`);
  }
  push("Moneda del proveedor", product.currency);

  const unit = product.weightUnit || "";
  if (present(product.weight)) {
    push("Peso", `${formatDim(product.weight)}${unit ? ` ${unit}` : ""}`);
  }

  const dims = [formatDim(product.height), formatDim(product.width), formatDim(product.length)].filter(
    Boolean
  ) as string[];
  if (dims.length) {
    const du = product.dimensionsUnit ? ` ${product.dimensionsUnit}` : "";
    push("Dimensiones (A×L×P)", `${dims.join(" × ")}${du}`);
  }
  if (present(product.volume)) push("Volumen", String(product.volume));
  push("Tags", product.tags);

  const fichaUrl = safeHttpUrl(product.productUrl);
  if (fichaUrl) {
    push("Ficha del proveedor", "Abrir enlace", { href: fichaUrl });
  }
  const imageUrl = safeHttpUrl(product.imageUrl);
  if (imageUrl) {
    push("Imagen original", "Ver imagen", { href: imageUrl });
  }
  if (product.syncedAt) {
    const d = new Date(product.syncedAt);
    if (!Number.isNaN(d.getTime())) {
      push(
        "Última sync",
        d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
      );
    }
  }

  return rows;
}

function BreakdownRow({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <>
      <dt className={`text-[13px] leading-snug ${strong ? "font-bold text-white" : "text-surface-400"}`}>
        {label}
        {hint && <span className="block text-[11px] font-normal text-surface-500">{hint}</span>}
      </dt>
      <dd className={`m-0 text-right font-mono text-[13px] tabular-nums ${strong ? "font-bold text-white" : "text-surface-100"}`}>
        {value}
      </dd>
    </>
  );
}


function RelatedCard({ product }: { product: ProductDTO }) {
  const [err, setErr] = useState(false);
  const href = `/product/${encodeURIComponent(product.provider)}/${encodeURIComponent(product.externalId)}`;
  return (
    <Link
      href={href}
      className="bg-surface-900 border border-surface-800 hover:border-surface-600 rounded-xl overflow-hidden transition-all group"
    >
      <div className="aspect-square relative bg-white">
        {product.imageUrl && !err ? (
          <Image
            src={proxyImg(product.imageUrl, { trim: false })}
            alt={product.name}
            fill
            className="object-contain p-2 group-hover:scale-105 transition-transform"
            unoptimized
            onError={() => setErr(true)}
          />
        ) : (
          <Package className="w-6 h-6 text-surface-400 absolute inset-0 m-auto" />
        )}
      </div>
      <div className="p-2.5 bg-surface-950">
        <p className="text-[11px] text-surface-300 line-clamp-2 leading-tight mb-1.5 min-h-[2.2rem]">
          {product.name}
        </p>
        <PriceTag product={product} size="sm" />
        <ProductSyncedAt
          syncedAt={product.syncedAt}
          className="text-[9px] text-surface-500 mt-1.5 leading-tight"
        />
      </div>
    </Link>
  );
}
