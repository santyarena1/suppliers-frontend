"use client";

import { ProductDTO } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import { formatARS, formatUSD } from "@/lib/format";
import { linePricing, TaxableProduct, formatAlicuota } from "@/lib/tax";
import { purchaseLinePricing, type PriceMode } from "@/lib/purchase-price";
import { usePurchasePolicy } from "@/lib/purchase";
import { displayAmountFromPricing } from "@/lib/display-price";
import { useIibbRatesEpoch } from "@/lib/iibb-rates";

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
  const { currency, convert, withIva, withIibb } = usePrefs();
  useIibbRatesEpoch();
  const provider =
    product && typeof product === "object" && "provider" in product
      ? String((product as { provider?: unknown }).provider ?? "")
      : "";
  const policy = usePurchasePolicy(provider);
  const pricing = product
    ? purchaseLinePricing(product, policy, priceMode, qty)
    : { ...linePricing({ price: usdPrice }, qty), missingIva: false, adjusted: false, mode: "list" as const };
  const includeIibb = withIibb && pricing.mode !== "offline";
  const shown = displayAmountFromPricing(
    pricing,
    { withIva, withIibb: includeIibb, provider: provider || undefined },
    qty
  );
  const displayUsd = shown.displayUsd;
  const { amount } = convert(displayUsd);
  const primary = currency === "USD" ? formatUSD(amount) : formatARS(amount);
  const secondary = currency === "USD"
    ? formatARS(convert(displayUsd).amount)
    : formatUSD(displayUsd);

  const modeBadge =
    pricing.mode === "offline"
      ? { label: "Offline", className: "text-amber-300" }
      : pricing.mode === "scheme"
        ? { label: "Esquema", className: "text-violet-300" }
        : null;

  const canScheme = Boolean(policy?.acceptsScheme && policy.schemeIvaAdjustment);
  const schemeHint =
    product && priceMode === "list" && canScheme
      ? (() => {
          const sp = purchaseLinePricing(product, policy, "scheme", qty);
          const sd = displayAmountFromPricing(
            sp,
            { withIva, withIibb: withIibb && sp.mode !== "offline", provider: provider || undefined },
            qty
          );
          const usd = sd.displayUsd;
          return currency === "USD" ? formatUSD(usd) : formatARS(convert(usd).amount);
        })()
      : null;

  return (
    <div className={className}>
      <div className="flex items-baseline gap-1.5 flex-wrap justify-end">
        <span className={`font-bold text-white tabular-nums ${SIZES[size]}`}>{primary}</span>
        {modeBadge && (
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${modeBadge.className}`}>
            {modeBadge.label}
          </span>
        )}
        {!withIva && (
          <span className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">s/IVA</span>
        )}
        {includeIibb && shown.iibbIncluded && (
          <span className="text-[10px] font-medium text-surface-500 uppercase tracking-wider">
            +IIBB{shown.iibbPercent != null ? ` ${formatAlicuota(shown.iibbPercent)}` : ""}
          </span>
        )}
      </div>
      {showSecondary && currency === "ARS" && (
        <p className="text-xs text-surface-500 tabular-nums">{formatUSD(displayUsd)} USD</p>
      )}
      {showSecondary && currency === "USD" && (
        <p className="text-xs text-surface-500 tabular-nums">{secondary}</p>
      )}
      {schemeHint && (
        <p className="text-[11px] font-medium text-violet-300 tabular-nums mt-0.5">
          Esquema {schemeHint}
          {policy.schemeDiscountPercent != null && policy.schemeDiscountPercent > 0
            ? ` (−${policy.schemeDiscountPercent}%)`
            : ""}
        </p>
      )}
    </div>
  );
}
