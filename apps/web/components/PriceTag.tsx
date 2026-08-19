"use client";

import { usePrefs } from "@/lib/prefs";
import { parsePrice, formatARS, formatUSD } from "@/lib/format";

interface Props {
  usdPrice: string | number;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showSecondary?: boolean;
  qty?: number;
}

const SIZES = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
  xl: "text-3xl",
};

export default function PriceTag({ usdPrice, className = "", size = "md", showSecondary = false, qty = 1 }: Props) {
  const { currency, applyIva, convert, withIva } = usePrefs();
  const base = parsePrice(usdPrice) * qty;
  const withTax = applyIva(base);
  const { amount } = convert(withTax);
  const primary = currency === "USD" ? formatUSD(amount) : formatARS(amount);

  const otherCurrency = currency === "USD" ? "ARS" : "USD";
  const secondary = otherCurrency === "USD" ? formatUSD(withTax) : formatARS(convert(withTax).amount);

  return (
    <div className={className}>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-bold text-white tabular-nums ${SIZES[size]}`}>{primary}</span>
        {!withIva && (
          <span className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">s/iva</span>
        )}
      </div>
      {showSecondary && currency === "ARS" && (
        <p className="text-xs text-surface-500 tabular-nums">{formatUSD(base)} USD</p>
      )}
      {showSecondary && currency === "USD" && (
        <p className="text-xs text-surface-500 tabular-nums">{secondary}</p>
      )}
    </div>
  );
}
