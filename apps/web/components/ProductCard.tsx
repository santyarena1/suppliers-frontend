"use client";

import { ProductDTO } from "@/lib/api";
import { Package, ImageOff, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { proxyImg, formatARS, formatUSD } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { useProviderDisplay } from "@/lib/providerDisplay";
import { linePricing, taxLabel } from "@/lib/tax";
import AddToCartButton from "./AddToCartButton";

const PROVIDER_HUE: Record<string, string> = {
  NEW_BYTES:    "text-sky-400   bg-sky-400/10",
  ELIT:         "text-purple-400 bg-purple-400/10",
  GRUPO_NUCLEO: "text-emerald-400 bg-emerald-400/10",
  AIR:          "text-cyan-400  bg-cyan-400/10",
  NEW_TREE:     "text-teal-400  bg-teal-400/10",
  INVID:        "text-orange-400 bg-orange-400/10",
  GC:           "text-red-400   bg-red-400/10",
  POLYTECH:     "text-pink-400  bg-pink-400/10",
  ASHIR:        "text-indigo-400 bg-indigo-400/10",
  HDC:          "text-yellow-400 bg-yellow-400/10",
  SOLUTION_BOX: "text-lime-400  bg-lime-400/10",
  DISTECNA:     "text-violet-400 bg-violet-400/10",
  CEVEN:        "text-rose-400  bg-rose-400/10",
  DIAPSTORE:    "text-blue-400  bg-blue-400/10",
};

export default function ProductCard({ product }: { product: ProductDTO }) {
  const [imgErr, setImgErr] = useState(false);
  const { currency, withIva, convert } = usePrefs();
  const display = useProviderDisplay();
  const color = PROVIDER_HUE[product.provider] || "text-surface-400 bg-surface-400/10";
  const logoUrl = display.logoUrl(product.provider);
  const customColor = display.textColor(product.provider);
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

          <span className="absolute top-2 left-2 flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-md shadow-md backdrop-blur-md tracking-wide bg-black/70 text-white border border-white/10">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="w-3.5 h-3.5 object-contain rounded-sm" />
            )}
            <span className={customColor ? undefined : color.split(" ")[0]} style={customColor ? { color: customColor } : undefined}>
              {product.provider.replace(/_/g, " ")}
            </span>
          </span>

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
          {(product.canonicalBrand?.displayName || product.brand) && (
            <p className="product-card-meta text-[10px] mt-0.5 truncate">
              {product.canonicalBrand?.displayName ?? product.brand}
            </p>
          )}
        </Link>

        <div className="flex items-end justify-between gap-2 mt-auto pt-2.5 border-t product-card-divider">
          <div className="flex flex-col min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="product-card-price text-lg font-bold tabular-nums leading-none">{primary}</span>
            </div>
            {secondary && (
              <span className="product-card-meta text-[11px] tabular-nums mt-1">{secondary}</span>
            )}
            <span className="product-card-meta text-[10px] tabular-nums mt-0.5">
              Base: {formatUSD(pricing.net)} {withIva ? "(s/imp)" : ""}
            </span>
          </div>
          <AddToCartButton product={product} variant="icon" />
        </div>

        {product.externalId && (
          <span className="product-card-meta text-[9px] font-mono truncate">#{product.externalId}</span>
        )}
      </div>
    </div>
  );
}
