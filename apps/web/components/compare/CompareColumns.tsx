"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Copy,
  ExternalLink,
  ImageOff,
  Package,
  Store,
  Trash2,
  Layers,
  StickyNote,
} from "lucide-react";
import { formatARS, formatUSD, proxyImg } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { useIsRetailer, usePurchasePolicy } from "@/lib/purchase";
import { purchaseLinePricing, type PriceMode } from "@/lib/purchase-price";
import { providerHasIvaRate } from "@/lib/purchase-pricing";
import ProviderBadge from "@/components/ProviderBadge";
import {
  MODE_HINT,
  MODE_LABEL,
  type CompareProviderEntry,
  type CompareRetailEntry,
} from "@/lib/compare-store";
import {
  marginVsCostPercent,
  repairImplausibleSalePrice,
} from "@/lib/retailMatch";

const MODE_ACCENT: Record<PriceMode, string> = {
  list: "border-brand-500/40 ring-brand-500/10",
  offline: "border-amber-500/40 ring-amber-500/10",
  scheme: "border-violet-500/40 ring-violet-500/10",
};

const MODE_CHIP: Record<PriceMode, string> = {
  list: "bg-brand-600/20 text-brand-300 border-brand-500/30",
  offline: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  scheme: "bg-violet-500/15 text-violet-200 border-violet-500/30",
};

function money(usd: number, currency: "USD" | "ARS", convert: (n: number) => { amount: number }) {
  if (currency === "USD") return formatUSD(usd);
  return formatARS(convert(usd).amount);
}

export function ProviderCompareColumn({
  entry,
  isCheapest,
  onRemove,
  onChangeMode,
  onDuplicateMode,
  onAddRetail,
}: {
  entry: CompareProviderEntry;
  isCheapest: boolean;
  onRemove: () => void;
  onChangeMode: (mode: PriceMode) => void;
  onDuplicateMode: (mode: PriceMode) => void;
  onAddRetail: () => void;
}) {
  const { product, mode } = entry;
  const { currency, withIva, convert } = usePrefs();
  const policy = usePurchasePolicy(product.provider);
  const retailer = useIsRetailer();
  const hasIva = providerHasIvaRate(product.provider);
  const pricing = purchaseLinePricing(product, policy, mode);
  const display = withIva ? pricing.unitGross : pricing.unitNet;
  const [imgErr, setImgErr] = useState(false);

  const canOffline = retailer && hasIva && policy.acceptsOffline;
  const canScheme = retailer && hasIva && policy.acceptsScheme;
  const modes: PriceMode[] = ["list"];
  if (canOffline) modes.push("offline");
  if (canScheme) modes.push("scheme");

  const href = `/product/${encodeURIComponent(product.provider)}/${encodeURIComponent(product.externalId)}`;

  return (
    <article
      className={`flex flex-col w-[280px] flex-shrink-0 rounded-2xl border bg-surface-900/90 ring-1 overflow-hidden ${MODE_ACCENT[mode]} ${
        isCheapest ? "shadow-[0_0_0_1px_rgba(16,185,129,0.35)]" : ""
      }`}
    >
      <div className="relative aspect-[4/3] bg-white">
        {product.imageUrl && !imgErr ? (
          <Image
            src={proxyImg(product.imageUrl)}
            alt=""
            fill
            className="object-contain p-4"
            unoptimized
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400 bg-slate-50">
            {imgErr ? <ImageOff className="w-8 h-8" /> : <Package className="w-8 h-8" />}
            <span className="text-[10px]">Sin imagen</span>
          </div>
        )}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2">
          <ProviderBadge provider={product.provider} size="sm" chip />
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded-lg bg-black/70 text-white/80 hover:text-white hover:bg-black/90"
            title="Quitar"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {isCheapest && (
          <span className="absolute bottom-2 left-2 text-[10px] font-bold uppercase tracking-wide bg-emerald-500 text-black px-2 py-0.5 rounded-full">
            Mejor costo
          </span>
        )}
      </div>

      <div className="p-3.5 flex flex-col gap-3 flex-1">
        <Link href={href} className="text-sm font-semibold text-white leading-snug line-clamp-3 hover:text-brand-300 transition-colors">
          {product.name}
        </Link>
        <p className="text-[10px] font-mono text-surface-500 -mt-1">#{product.externalId}</p>

        <div className="flex flex-wrap gap-1">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChangeMode(m)}
              title={MODE_HINT[m]}
              className={`text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors ${
                mode === m
                  ? MODE_CHIP[m]
                  : "border-surface-700 text-surface-400 hover:text-surface-200"
              }`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-0.5">
            {withIva ? "Con impuestos" : "Sin impuestos"} · {MODE_LABEL[mode]}
          </p>
          <p className="text-2xl font-bold text-white tabular-nums tracking-tight">
            {money(display, currency, convert)}
          </p>
          <p className="text-[11px] text-surface-500 tabular-nums mt-0.5">
            Neto {formatUSD(pricing.unitNet)}
            {pricing.adjusted && pricing.missingIva && (
              <span className="text-amber-400"> · sin alícuota IVA</span>
            )}
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-1.5 pt-1 border-t border-surface-800">
          <div className="flex flex-wrap gap-1">
            {canOffline && mode !== "offline" && (
              <DupBtn icon={<StickyNote className="w-3 h-3" />} label="Offline" onClick={() => onDuplicateMode("offline")} />
            )}
            {canScheme && mode !== "scheme" && (
              <DupBtn icon={<Layers className="w-3 h-3" />} label="Esquema" onClick={() => onDuplicateMode("scheme")} />
            )}
            {mode !== "list" && (
              <DupBtn icon={<Copy className="w-3 h-3" />} label="Normal" onClick={() => onDuplicateMode("list")} />
            )}
            <DupBtn icon={<Store className="w-3 h-3" />} label="Local" onClick={onAddRetail} />
          </div>
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-[11px] text-surface-400 hover:text-white transition-colors"
          >
            Ver ficha <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function DupBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border border-surface-700 text-surface-300 hover:border-surface-500 hover:text-white transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}

export function RetailCompareColumn({
  entry,
  isBestSale,
  onRemove,
}: {
  entry: CompareRetailEntry;
  isBestSale: boolean;
  onRemove: () => void;
}) {
  const { convert } = usePrefs();
  const costArs =
    entry.costUsd != null && entry.costUsd > 0 ? convert(entry.costUsd).amount : null;
  const sale = repairImplausibleSalePrice(entry.hit.price, costArs);
  const margin = marginVsCostPercent(sale, costArs);
  const [imgErr, setImgErr] = useState(false);

  return (
    <article
      className={`flex flex-col w-[280px] flex-shrink-0 rounded-2xl border border-emerald-500/35 bg-surface-900/90 ring-1 ring-emerald-500/10 overflow-hidden ${
        isBestSale ? "shadow-[0_0_0_1px_rgba(16,185,129,0.45)]" : ""
      }`}
    >
      <div className="relative aspect-[4/3] bg-white">
        {entry.hit.imageUrl && !imgErr ? (
          <Image
            src={proxyImg(entry.hit.imageUrl)}
            alt=""
            fill
            className="object-contain p-4"
            unoptimized
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400 bg-slate-50">
            <Store className="w-8 h-8" />
            <span className="text-[10px]">Local</span>
          </div>
        )}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 max-w-[75%] rounded-full bg-emerald-600/90 text-white text-[11px] font-semibold pl-1 pr-2.5 py-0.5">
            <span className="w-5 h-5 rounded-full bg-white overflow-hidden flex items-center justify-center">
              {entry.hit.store.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxyImg(entry.hit.store.logoUrl)} alt="" className="w-full h-full object-contain p-[1px]" />
              ) : (
                <Store className="w-3 h-3 text-emerald-700" />
              )}
            </span>
            <span className="truncate">{entry.hit.store.name}</span>
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded-lg bg-black/70 text-white/80 hover:text-white hover:bg-black/90"
            title="Quitar"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {isBestSale && (
          <span className="absolute bottom-2 left-2 text-[10px] font-bold uppercase tracking-wide bg-emerald-500 text-black px-2 py-0.5 rounded-full">
            Mejor venta
          </span>
        )}
      </div>

      <div className="p-3.5 flex flex-col gap-3 flex-1">
        <p className="text-sm font-semibold text-white leading-snug line-clamp-3">{entry.hit.name}</p>
        {entry.hit.categoryName && (
          <p className="text-[10px] text-surface-500 -mt-1">{entry.hit.categoryName}</p>
        )}

        <span className="self-start text-[10px] font-semibold px-2 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
          Local importado
        </span>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-0.5">
            Precio de venta
          </p>
          <p className="text-2xl font-bold text-white tabular-nums tracking-tight">
            {formatARS(sale)}
          </p>
          {margin != null && (
            <p className={`text-[11px] tabular-nums mt-0.5 ${margin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              Margen {margin >= 0 ? "+" : ""}
              {margin.toFixed(1)}%
              {entry.costUsd != null && (
                <span className="text-surface-500"> vs costo {formatUSD(entry.costUsd)}</span>
              )}
            </p>
          )}
        </div>

        <div className="mt-auto pt-1 border-t border-surface-800">
          {entry.hit.productUrl ? (
            <a
              href={entry.hit.productUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-surface-400 hover:text-white transition-colors"
            >
              Ver en tienda <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <span className="text-[11px] text-surface-600">Sin link público</span>
          )}
        </div>
      </div>
    </article>
  );
}
