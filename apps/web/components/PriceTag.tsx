"use client";

import { ProductDTO } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import { formatARS, formatUSD } from "@/lib/format";
import { linePricing, TaxableProduct } from "@/lib/tax";
import { purchaseLinePricing, type PriceMode } from "@/lib/purchase-price";
import { usePurchasePolicy } from "@/lib/purchase";

interface Props {
  product?: TaxableProduct | ProductDTO;
  usdPrice?: string | number | null;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showSecondary?: boolean;
  qty?: number;
  priceMode?: PriceMode;
}

const SIZES = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
  xl: "text-3xl",
};

export default function PriceTag({
  product,
  usdPrice,
  className = "",
  size = "md",
  showSecondary = false,
  qty = 1,
  priceMode = "list",
}: Props) {
  const { currency, convert, withIva } = usePrefs();
  const policy = usePurchasePolicy(
    product && typeof product === "object" && "provider" in product
      ? String((product as { provider?: unknown }).provider ?? "")
      : ""
  );
  const pricing = product
    ? purchaseLinePricing(product, policy, priceMode, qty)
    : { ...linePricing({ price: usdPrice }, qty), missingIva: false, adjusted: false, mode: "list" as const };
  const displayUsd = withIva ? pricing.gross : pricing.net;
  const { amount } = convert(displayUsd);
  const primary = currency === "USD" ? formatUSD(amount) : formatARS(amount);
  const secondary = currency === "USD"
    ? formatARS(convert(displayUsd).amount)
    : formatUSD(displayUsd);

  return (
    <div className={className}>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-bold text-white tabular-nums ${SIZES[size]}`}>{primary}</span>
        {!withIva && (
          <span className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">s/imp</span>
        )}
      </div>
      {showSecondary && currency === "ARS" && (
        <p className="text-xs text-surface-500 tabular-nums">{formatUSD(displayUsd)} USD</p>
      )}
      {showSecondary && currency === "USD" && (
        <p className="text-xs text-surface-500 tabular-nums">{secondary}</p>
      )}
    </div>
  );
}
