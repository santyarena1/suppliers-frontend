"use client";

import {
  ProductDTO,
  PROVIDER_LABELS,
  productDisplayBrand,
  productDisplayCategory,
  type Provider,
} from "@/lib/api";
import { Package, ImageOff, MapPin, DollarSign, GitCompare, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { proxyImg, formatARS, formatUSD } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { linePricing, formatAlicuota } from "@/lib/tax";
import { useProviderDisplay } from "@/lib/providerDisplay";
import { purchaseLinePricing, type PriceMode } from "@/lib/purchase-price";
import { usePurchasePolicy } from "@/lib/purchase";
import { displayAmountFromPricing, displayTaxBadge, displayTaxTitle } from "@/lib/display-price";
import { useIibbRatesEpoch } from "@/lib/iibb-rates";
import {
  entryKey,
  loadCompareEntries,
  newProviderEntry,
  saveCompareEntries,
} from "@/lib/compare-store";
import AddToCartButton from "./AddToCartButton";
import SalePricePanel from "./SalePricePanel";
import ProductSyncedAt from "./ProductSyncedAt";
import AiImageDisclaimer from "./AiImageDisclaimer";

function CardProviderPill({ provider }: { provider: string }) {
  const display = useProviderDisplay();
  const logoUrl = display.logoUrl(provider);
  const customColor = display.textColor(provider);
  const name = PROVIDER_LABELS[provider as Provider] ?? provider.replace(/_/g, " ");
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <span className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 z-[1] inline-flex h-6 sm:h-7 max-w-[80%] sm:max-w-[75%] items-center gap-1 sm:gap-1.5 rounded-full bg-black/75 pl-0.5 sm:pl-1 pr-1.5 sm:pr-2.5 shadow-sm ring-1 ring-white/10 backdrop-blur-sm">
      <span className="flex h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-full w-full object-contain p-[2px]" />
        ) : (
          <span className="text-[7px] sm:text-[8px] font-bold leading-none text-slate-700">{initials}</span>
        )}
      </span>
      <span
        className="min-w-0 truncate text-[10px] sm:text-[11px] font-semibold leading-none tracking-tight"
        style={customColor ? { color: customColor } : { color: "rgba(255,255,255,0.95)" }}
        title={name}
      >
        {name}
      </span>
    </span>
  );
}

export default function ProductCard({ product, priceMode = "list" }: { product: ProductDTO; priceMode?: PriceMode }) {
  const [imgErr, setImgErr] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [compareFlash, setCompareFlash] = useState(false);
  const { currency, withIva, withIibb, convert } = usePrefs();
  useIibbRatesEpoch();
  const policy = usePurchasePolicy(product.provider);
  const href = `/product/${encodeURIComponent(product.provider)}/${encodeURIComponent(product.externalId)}`;

  const brand = productDisplayBrand(product);
  const category = productDisplayCategory(product);

  const pricing = purchaseLinePricing(product, policy, priceMode);
  const includeIibb = withIibb && pricing.mode !== "offline";
  const shown = displayAmountFromPricing(pricing, {
    withIva,
    withIibb: includeIibb,
    provider: product.provider,
  });
  const displayUsd = shown.displayUsd;
  const ars = convert(displayUsd).amount;
  const listed = linePricing(product);
  const showingOffline = pricing.adjusted && pricing.mode === "offline";
  const showingScheme = pricing.adjusted && pricing.mode === "scheme";
  const wantsOffline = priceMode === "offline";
  const wantsScheme = priceMode === "scheme";
  const offlineUnavailable = wantsOffline && !showingOffline;
  const schemeUnavailable = wantsScheme && !showingScheme;

  const canScheme = Boolean(policy?.acceptsScheme && policy.schemeIvaAdjustment);
  const schemeHint =
    priceMode === "list" && canScheme
      ? (() => {
          const sp = purchaseLinePricing(product, policy, "scheme");
          const sd = displayAmountFromPricing(sp, {
            withIva,
            withIibb: withIibb && sp.mode !== "offline",
            provider: product.provider,
          });
          const usd = sd.displayUsd;
          const label = currency === "USD" ? formatUSD(usd) : formatARS(convert(usd).amount);
          const disc =
            policy.schemeDiscountPercent != null && policy.schemeDiscountPercent > 0
              ? ` (−${policy.schemeDiscountPercent}%)`
              : "";
          return { label, disc };
        })()
      : null;

  const primary = currency === "USD" ? formatUSD(displayUsd) : formatARS(ars);
  const secondary = currency === "USD"
    ? (ars > 0 ? formatARS(ars) : null)
    : formatUSD(displayUsd);

  const hasDrop = product.priceDropPercent != null && product.priceDropPercent > 0;
  const dropLabel = hasDrop
    ? `−${product.priceDropPercent! % 1 === 0 ? product.priceDropPercent : product.priceDropPercent!.toFixed(1)}%`
    : null;
  const prevRaw = product.previousFinalPrice ?? product.previousPrice;
  const prevFormatted =
    hasDrop && prevRaw != null
      ? currency === "USD"
        ? formatUSD(Number(prevRaw) || 0)
        : formatARS(convert(Number(prevRaw) || 0).amount)
      : null;

  const taxOpts = { withIva, withIibb: includeIibb, provider: product.provider };
  const taxText = withIva ? `+ ${displayTaxBadge(product, taxOpts)}` : "Sin imp.";
  const taxTitle = displayTaxTitle(taxOpts);

  function addToCompare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const entry = newProviderEntry(product, priceMode);
    const current = loadCompareEntries();
    const key = entryKey(entry);
    if (current.some((c) => entryKey(c) === key)) {
      setCompareFlash(true);
      setTimeout(() => setCompareFlash(false), 700);
      return;
    }
    saveCompareEntries([...current, entry]);
    setCompareFlash(true);
    setTimeout(() => setCompareFlash(false), 700);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("nodo-compare-updated"));
    }
  }

  return (
    <div className="group relative rounded-2xl overflow-hidden flex flex-col product-card transition-shadow duration-300">
      <Link href={href} className="block">
        <div className="bg-white aspect-square flex items-center justify-center relative overflow-hidden">
          {product.imageUrl && !imgErr ? (
            <Image
              src={proxyImg(product.imageUrl)}
              alt={product.name}
              fill
              className="object-contain p-2 sm:p-3 group-hover:scale-[1.04] transition-transform duration-500 ease-out"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              unoptimized
              onError={() => setImgErr(true)}
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-slate-400 bg-slate-50 absolute inset-0 justify-center">
              {imgErr ? <ImageOff className="w-8 h-8 sm:w-10 sm:h-10" /> : <Package className="w-8 h-8 sm:w-10 sm:h-10" />}
              <span className="text-[10px]">Sin imagen</span>
            </div>
          )}

          <CardProviderPill provider={product.provider} />

          <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 z-[1] flex flex-col items-end gap-1">
            {dropLabel && (
              <span className="inline-flex h-6 sm:h-7 items-center rounded-full bg-emerald-600 px-2 sm:px-2.5 text-[10px] sm:text-[11px] font-bold text-white shadow-sm ring-1 ring-emerald-400/30">
                {dropLabel}
              </span>
            )}
            {(showingOffline || offlineUnavailable) && (
              <span
                className={`inline-flex h-6 sm:h-7 items-center rounded-full px-2 sm:px-2.5 text-[10px] sm:text-[11px] font-bold shadow-sm ${
                  showingOffline
                    ? "bg-amber-500 text-black ring-1 ring-amber-300/50"
                    : "bg-black/70 text-amber-200 ring-1 ring-amber-500/30"
                }`}
              >
                {showingOffline ? "Offline" : "Sin offline"}
              </span>
            )}
            {(showingScheme || schemeUnavailable) && (
              <span
                className={`inline-flex h-6 sm:h-7 items-center rounded-full px-2 sm:px-2.5 text-[10px] sm:text-[11px] font-bold shadow-sm ${
                  showingScheme
                    ? "bg-violet-500 text-white ring-1 ring-violet-300/50"
                    : "bg-black/70 text-violet-200 ring-1 ring-violet-500/30"
                }`}
              >
                {showingScheme ? "Esquema" : "Sin esquema"}
              </span>
            )}
          </div>

          {product.locationAir && (
            <span className="absolute bottom-1.5 left-1.5 sm:bottom-2 sm:left-2 z-[1] inline-flex max-w-[85%] items-center gap-1 rounded-full bg-black/65 px-1.5 sm:px-2 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-medium text-white/95 ring-1 ring-white/10 backdrop-blur-sm">
              <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate">{product.locationAir}</span>
            </span>
          )}
        </div>
      </Link>

      {product.imageAiSelected && product.imageUrl && !imgErr && (
        <AiImageDisclaimer className="px-2.5 sm:px-3.5 pt-1.5 sm:pt-2 pb-0 text-slate-500" />
      )}

      <div className="p-2.5 sm:p-3.5 flex flex-col gap-2 sm:gap-3 flex-1">
        <Link href={href} className="block min-h-[2.1rem] sm:min-h-[2.5rem]">
          <p className="product-card-title text-[12px] sm:text-[13px] leading-snug line-clamp-2 font-semibold tracking-tight transition-colors">
            {product.name}
          </p>
        </Link>
        {(brand || category) && (
          <p className="text-[10px] sm:text-[11px] leading-snug text-slate-400 dark:text-surface-500 line-clamp-1 -mt-1.5 sm:-mt-2">
            {brand && (
              <Link
                href={`/search?marca=${encodeURIComponent(brand)}`}
                className="hover:text-brand-400 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {brand}
              </Link>
            )}
            {brand && category ? <span className="text-slate-500"> · </span> : null}
            {category && (
              <Link
                href={`/search?categoria=${encodeURIComponent(category)}`}
                className="hover:text-brand-400 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {category}
              </Link>
            )}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-2 sm:gap-2.5">
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-1.5 sm:gap-2 flex-wrap">
              <span className="product-card-price text-[1.05rem] sm:text-[1.2rem] font-bold tabular-nums leading-none tracking-tight">
                {primary}
              </span>
              {prevFormatted && (
                <span className="text-[10px] sm:text-[11px] text-slate-400 line-through tabular-nums">
                  {prevFormatted}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap min-h-[1.25rem]">
              {secondary && (
                <span className="product-card-meta text-[10px] sm:text-[11px] tabular-nums">{secondary}</span>
              )}
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
                  withIva
                    ? "bg-slate-100 text-slate-600 ring-1 ring-slate-200/90"
                    : "bg-slate-50 text-slate-500 ring-1 ring-slate-200/70"
                }`}
                title={taxTitle}
              >
                {taxText}
              </span>
            </div>

            {pricing.missingIva && (showingOffline || showingScheme) && (
              <p className="text-[10px] text-amber-600 leading-none">Sin alícuota de IVA</p>
            )}

            {schemeHint && (
              <p className="text-[10px] sm:text-[11px] font-medium tabular-nums leading-none pt-0.5 text-violet-600 dark:text-violet-300">
                Esquema {schemeHint.label}
                {schemeHint.disc}
              </p>
            )}

            {showingScheme && policy.schemeDiscountPercent != null && policy.schemeDiscountPercent > 0 && (
              <p className="text-[10px] text-violet-600/90 dark:text-violet-300/80 leading-none">
                Descuento esquema {policy.schemeDiscountPercent}%
              </p>
            )}

            {!showingOffline && !showingScheme && (
              <p className="product-card-meta hidden sm:block text-[10px] tabular-nums leading-none pt-0.5">
                Base {formatUSD(listed.net)}
                {withIva ? " · s/imp" : ""}
                {shown.iibbIncluded
                  ? ` · IIBB${shown.estimatedIibb ? " est." : ""}${shown.iibbPercent != null ? ` ${formatAlicuota(shown.iibbPercent)}` : ""}`
                  : ""}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-1.5 sm:gap-2 pt-1.5 sm:pt-2 border-t product-card-divider">
            <span className="product-card-meta hidden sm:inline text-[10px] font-mono truncate min-w-0 opacity-80">
              {product.externalId ? `#${product.externalId}` : "—"}
            </span>
            <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0 ml-auto">
              <button
                type="button"
                title="Agregar al comparador"
                aria-label="Agregar al comparador"
                onClick={addToCompare}
                className={`w-9 h-9 sm:w-8 sm:h-8 rounded-lg border flex items-center justify-center transition-colors shadow-sm ${
                  compareFlash
                    ? "border-violet-400 bg-violet-100 text-violet-700"
                    : "border-violet-200/90 bg-violet-50 text-violet-600 hover:bg-violet-100 hover:border-violet-300 hover:text-violet-700"
                }`}
              >
                {compareFlash ? <Check className="w-3.5 h-3.5" /> : <GitCompare className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                title="Ver precios de venta en locales (referencia de mercado)"
                aria-label="Ver precios de venta"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSaleOpen(true);
                }}
                className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 hover:border-emerald-500/40 flex items-center justify-center transition-colors"
              >
                <DollarSign className="w-3.5 h-3.5" />
              </button>
              <AddToCartButton
                product={product}
                variant="stepper"
                tone="light"
                channel={showingOffline ? "offline" : "online"}
              />
            </div>
          </div>
        </div>

        <ProductSyncedAt
          syncedAt={product.syncedAt}
          className="text-[9px] text-surface-500 text-center leading-tight px-1 pb-0.5"
        />
      </div>

      <SalePricePanel
        open={saleOpen}
        onClose={() => setSaleOpen(false)}
        seedQuery={product.name}
        costUsd={listed.net}
      />
    </div>
  );
}
