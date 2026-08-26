"use client";

import { ProductDTO, PROVIDER_LABELS, type Provider } from "@/lib/api";
import { Package, ImageOff, MapPin, DollarSign } from "lucide-react";
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
import AddToCartButton from "./AddToCartButton";
import SalePricePanel from "./SalePricePanel";
import ProductSyncedAt from "./ProductSyncedAt";

function CardProviderPill({ provider }: { provider: string }) {
  const display = useProviderDisplay();
  const logoUrl = display.logoUrl(provider);
  const customColor = display.textColor(provider);
  const name = PROVIDER_LABELS[provider as Provider] ?? provider.replace(/_/g, " ");
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <span className="absolute top-2 left-2 z-[1] inline-flex h-7 max-w-[75%] items-center gap-1.5 rounded-full bg-black/75 pl-1 pr-2.5 shadow-sm ring-1 ring-white/10 backdrop-blur-sm">
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-full w-full object-contain p-[2px]" />
        ) : (
          <span className="text-[8px] font-bold leading-none text-slate-700">{initials}</span>
        )}
      </span>
      <span
        className="min-w-0 truncate text-[11px] font-semibold leading-none tracking-tight"
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
  const { currency, withIva, withIibb, convert } = usePrefs();
  useIibbRatesEpoch();
  const policy = usePurchasePolicy(product.provider);
  const href = `/product/${encodeURIComponent(product.provider)}/${encodeURIComponent(product.externalId)}`;

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
  const wantsOffline = priceMode === "offline";
  const offlineUnavailable = wantsOffline && !showingOffline;

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

  return (
    <div className="group relative rounded-2xl overflow-hidden flex flex-col product-card transition-shadow duration-300">
      <Link href={href} className="block">
        <div className="bg-white aspect-square flex items-center justify-center relative overflow-hidden">
          {product.imageUrl && !imgErr ? (
            <Image
              src={proxyImg(product.imageUrl)}
              alt={product.name}
              fill
              className="object-contain p-3 group-hover:scale-[1.04] transition-transform duration-500 ease-out"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              unoptimized
              onError={() => setImgErr(true)}
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-slate-400 bg-slate-50 absolute inset-0 justify-center">
              {imgErr ? <ImageOff className="w-10 h-10" /> : <Package className="w-10 h-10" />}
              <span className="text-[10px]">Sin imagen</span>
            </div>
          )}

          <CardProviderPill provider={product.provider} />

          <div className="absolute top-2 right-2 z-[1] flex flex-col items-end gap-1">
            {dropLabel && (
              <span className="inline-flex h-7 items-center rounded-full bg-emerald-600 px-2.5 text-[11px] font-bold text-white shadow-sm ring-1 ring-emerald-400/30">
                {dropLabel}
              </span>
            )}
            {(showingOffline || offlineUnavailable) && (
              <span
                className={`inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-bold shadow-sm ${
                  showingOffline
                    ? "bg-amber-500 text-black ring-1 ring-amber-300/50"
                    : "bg-black/70 text-amber-200 ring-1 ring-amber-500/30"
                }`}
              >
                {showingOffline ? "Offline" : "Sin offline"}
              </span>
            )}
          </div>

          {product.locationAir && (
            <span className="absolute bottom-2 left-2 z-[1] inline-flex max-w-[85%] items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-medium text-white/95 ring-1 ring-white/10 backdrop-blur-sm">
              <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate">{product.locationAir}</span>
            </span>
          )}
        </div>
      </Link>

      <div className="p-3.5 flex flex-col gap-3 flex-1">
        <Link href={href} className="block min-h-[2.5rem]">
          <p className="product-card-title text-[13px] leading-snug line-clamp-2 font-semibold tracking-tight transition-colors">
            {product.name}
          </p>
        </Link>

        <div className="mt-auto flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="product-card-price text-[1.2rem] font-bold tabular-nums leading-none tracking-tight">
                {primary}
              </span>
              {prevFormatted && (
                <span className="text-[11px] text-slate-400 line-through tabular-nums">
                  {prevFormatted}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap min-h-[1.25rem]">
              {secondary && (
                <span className="product-card-meta text-[11px] tabular-nums">{secondary}</span>
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

            {pricing.missingIva && showingOffline && (
              <p className="text-[10px] text-amber-600 leading-none">Sin alícuota de IVA</p>
            )}

            {!showingOffline && (
              <p className="product-card-meta text-[10px] tabular-nums leading-none pt-0.5">
                Base {formatUSD(listed.net)}
                {withIva ? " · s/imp" : ""}
                {shown.iibbIncluded
                  ? ` · IIBB${shown.estimatedIibb ? " est." : ""}${shown.iibbPercent != null ? ` ${formatAlicuota(shown.iibbPercent)}` : ""}`
                  : ""}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t product-card-divider">
            <span className="product-card-meta text-[10px] font-mono truncate min-w-0 opacity-80">
              {product.externalId ? `#${product.externalId}` : "—"}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                title="Ver precios de venta en locales (referencia de mercado)"
                aria-label="Ver precios de venta"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSaleOpen(true);
                }}
                className="w-8 h-8 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 hover:border-emerald-500/40 flex items-center justify-center transition-colors"
              >
                <DollarSign className="w-3.5 h-3.5" />
              </button>
              <AddToCartButton
                product={product}
                variant="icon"
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
