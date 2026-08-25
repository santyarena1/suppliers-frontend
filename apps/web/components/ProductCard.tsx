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

  const taxText = withIva ? taxLabel(product) : "Sin imp.";

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

          {/* Proveedor: píldora fija, logo + nombre centrados */}
          <span className="absolute top-2 left-2 z-[1] inline-flex h-7 max-w-[72%] items-center rounded-full bg-black/72 pl-1 pr-2.5 shadow-sm ring-1 ring-white/10 backdrop-blur-sm">
            <ProviderBadge
              provider={product.provider}
              variant="inline"
              size="sm"
              className="!gap-1.5 min-w-0"
              nameClassName="text-white/95 truncate"
            />
          </span>

          {dropLabel && (
            <span className="absolute top-2 right-2 z-[1] inline-flex h-7 items-center rounded-full bg-emerald-600 px-2.5 text-[11px] font-bold text-white shadow-sm ring-1 ring-emerald-400/30">
              {dropLabel}
            </span>
          )}

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
          {/* Precio + IVA organizados en bloque */}
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="product-card-price text-[1.2rem] font-bold tabular-nums leading-none tracking-tight">
                {primary}
              </span>
              {prevFormatted && (
                <span className="text-[11px] text-surface-500/90 line-through tabular-nums">
                  {prevFormatted}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap min-h-[1.25rem]">
              {secondary && (
                <span className="product-card-meta text-[11px] tabular-nums">{secondary}</span>
              )}
              <span
                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${
                  withIva
                    ? "bg-brand-600/12 text-brand-700 ring-1 ring-brand-600/20"
                    : "bg-surface-800/60 text-surface-500 ring-1 ring-surface-700/80"
                }`}
                title={withIva ? `Precio con ${taxLabel(product)}` : "Precio sin impuestos"}
              >
                {withIva ? `+ ${taxText}` : taxText}
              </span>
            </div>

            <p className="product-card-meta text-[10px] tabular-nums leading-none pt-0.5">
              Base {formatUSD(pricing.net)}
              {withIva ? " · s/imp" : ""}
            </p>
          </div>

          {/* Footer: id + acciones */}
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
                className="w-8 h-8 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 hover:border-emerald-500/40 flex items-center justify-center transition-colors"
              >
                <DollarSign className="w-3.5 h-3.5" />
              </button>
              <AddToCartButton product={product} variant="icon" />
            </div>
          </div>
        </div>
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
