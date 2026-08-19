"use client";

import { ProductDTO } from "@/lib/api";
import { Package, ImageOff, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { proxyImg, parsePrice, formatARS, formatUSD } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
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

const IVA = 0.21;

export default function ProductCard({ product }: { product: ProductDTO }) {
  const [imgErr, setImgErr] = useState(false);
  const { currency, withIva, convert } = usePrefs();
  const color = PROVIDER_HUE[product.provider] || "text-surface-400 bg-surface-400/10";
  const href = `/product/${encodeURIComponent(product.provider)}/${encodeURIComponent(product.externalId)}`;

  const baseUsd = parsePrice(product.price);
  const finalUsd = withIva ? baseUsd * (1 + IVA) : baseUsd;
  const ars = convert(finalUsd).amount;

  const primary = currency === "USD" ? formatUSD(finalUsd) : formatARS(ars);
  const secondary = currency === "USD"
    ? (ars > 0 ? formatARS(ars) : null)
    : formatUSD(finalUsd);

  return (
    <div className="group relative bg-surface-900 border border-surface-800 rounded-xl overflow-hidden hover:border-surface-600 hover:shadow-lg hover:shadow-black/30 transition-all flex flex-col">
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
            <div className="flex flex-col items-center gap-1.5 text-gray-400 bg-gradient-to-br from-surface-950 to-surface-900 absolute inset-0 justify-center">
              {imgErr ? <ImageOff className="w-10 h-10" /> : <Package className="w-10 h-10" />}
              <span className="text-[10px]">Sin imagen</span>
            </div>
          )}

          {/* Provider badge - always readable */}
          <span className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-1 rounded-md shadow-md backdrop-blur-md tracking-wide bg-black/70 text-white border border-white/10`}>
            <span className={color.split(" ")[0]}>{product.provider.replace(/_/g, " ")}</span>
          </span>

          {/* IVA badge - always readable */}
          <span className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-1 rounded-md shadow-md backdrop-blur-md ${
            withIva
              ? "bg-brand-600 text-white border border-brand-400/40"
              : "bg-black/70 text-white border border-white/10"
          }`}>
            {withIva ? "+ IVA 21%" : "Sin IVA"}
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
          <p className="text-sm text-surface-100 leading-snug line-clamp-2 font-medium hover:text-white transition-colors min-h-[2.3rem]">
            {product.name}
          </p>
        </Link>

        <div className="flex items-end justify-between gap-2 mt-auto pt-2.5 border-t border-surface-800">
          <div className="flex flex-col min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-white tabular-nums leading-none">{primary}</span>
            </div>
            {secondary && (
              <span className="text-[11px] text-surface-500 tabular-nums mt-1">{secondary}</span>
            )}
            <span className="text-[10px] text-surface-600 tabular-nums mt-0.5">
              Base: {formatUSD(baseUsd)} {withIva ? "(s/IVA)" : ""}
            </span>
          </div>
          <AddToCartButton product={product} variant="icon" />
        </div>

        {product.externalId && (
          <span className="text-[9px] text-surface-600 font-mono truncate">#{product.externalId}</span>
        )}
      </div>
    </div>
  );
}
