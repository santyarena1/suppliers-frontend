"use client";

import { ProductDTO } from "@/lib/api";
import { Package, ImageOff, MapPin, DollarSign } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { proxyImg, formatARS, formatUSD } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { linePricing, taxLabel } from "@/lib/tax";
import AddToCartButton from "./AddToCartButton";
import SalePricePanel from "./SalePricePanel";
import ProviderBadge from "./ProviderBadge";

export default function ProductCard({ product }: { product: ProductDTO }) {
  const [imgErr, setImgErr] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const { currency, withIva, convert } = usePrefs();
  const href = `/product/${encodeURIComponent(product.provider)}/${encodeURIComponent(product.externalId)}`;

  const pricing = linePricing(product);
  const displayUsd = withIva ? pricing.gross : pricing.net;
  const ars = convert(displayUsd).amount;

  const primary = currency === "USD" ? formatUSD(displayUsd) : formatARS(ars);
  const secondary = currency === "USD"
    ? (ars > 0 ? formatARS(ars) : null)
    : formatUSD(displayUsd);

  return (
    <div className="group relative rounded-xl overflow-hidden flex flex-col product-card">
      <Link href={href} className="block">
        <div className="bg-white aspect-square flex items-center justify-center relative overflow-hidden">
          {product.imageUrl && !imgErr ? (
            <Image
              src={proxyImg(product.imageUrl)}
              alt={product.name}
              fill
              className="object-contain p-2 group-hover:scale-[1.05] transition-transform duration-300"
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

          <span className="absolute top-2 left-2 shadow-md backdrop-blur-md rounded-md bg-black/75 border border-white/10 px-1.5 py-1 max-w-[70%]">
            <ProviderBadge
              provider={product.provider}
              variant="inline"
              size="sm"
              className="!gap-1.5"
              nameClassName="text-white truncate"
            />
          </span>

          {product.priceDropPercent != null && product.priceDropPercent > 0 && (
            <span className="absolute bottom-2 right-2 text-[10px] font-bold px-2 py-1 rounded-md shadow-md backdrop-blur-md bg-emerald-600 text-white border border-emerald-400/40">
              −{product.priceDropPercent % 1 === 0 ? product.priceDropPercent : product.priceDropPercent.toFixed(1)}%
            </span>
          )}

          <span className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-1 rounded-md shadow-md backdrop-blur-md ${
            withIva
              ? "bg-brand-600 text-white border border-brand-400/40"
              : "bg-black/70 text-white border border-white/10"
          }`}>
            {withIva ? `+ ${taxLabel(product)}` : "Sin imp."}
          </span>

          {product.locationAir && (
            <span className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-medium bg-black/70 backdrop-blur-md border border-white/10 text-white rounded-md px-2 py-1 shadow-md">
              <MapPin className="w-2.5 h-2.5" />
              {product.locationAir}
            </span>
          )}
        </div>
      </Link>

      <div className="p-3 flex flex-col gap-2.5 flex-1">
        <Link href={href} className="block">
          <p className="product-card-title text-sm leading-snug line-clamp-2 font-medium transition-colors min-h-[2.3rem]">
            {product.name}
          </p>
        </Link>

        <div className="flex items-end justify-between gap-2 mt-auto pt-2.5 border-t product-card-divider">
          <div className="flex flex-col min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="product-card-price text-lg font-bold tabular-nums leading-none">{primary}</span>
              {product.priceDropPercent != null && product.priceDropPercent > 0 && (product.previousFinalPrice ?? product.previousPrice) != null && (
                <span className="text-[11px] text-surface-500 line-through tabular-nums">
                  {currency === "USD"
                    ? formatUSD(Number(product.previousFinalPrice ?? product.previousPrice) || 0)
                    : formatARS(convert(Number(product.previousFinalPrice ?? product.previousPrice) || 0).amount)}
                </span>
              )}
            </div>
            {secondary && (
              <span className="product-card-meta text-[11px] tabular-nums mt-1">{secondary}</span>
            )}
            <span className="product-card-meta text-[10px] tabular-nums mt-0.5">
              Base: {formatUSD(pricing.net)} {withIva ? "(s/imp)" : ""}
            </span>
          </div>
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
              className="w-8 h-8 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 flex items-center justify-center transition-colors"
            >
              <DollarSign className="w-3.5 h-3.5" />
            </button>
            <AddToCartButton product={product} variant="icon" />
          </div>
        </div>

        {product.externalId && (
          <span className="product-card-meta text-[9px] font-mono truncate">#{product.externalId}</span>
        )}
      </div>

      <SalePricePanel
        open={saleOpen}
        onClose={() => setSaleOpen(false)}
        seedQuery={product.name}
        costUsd={pricing.net}
      />
    </div>
  );
}
