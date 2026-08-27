import type { ProductDTO } from "@/lib/api";
import { displayAmountFromPricing } from "@/lib/display-price";
import type { CompareEntry } from "@/lib/compare-store";
import { purchaseLinePricing, type PriceMode } from "@/lib/purchase-price";
import type { PurchasePolicy } from "@/lib/purchase-pricing";
import { repairImplausibleSalePrice } from "@/lib/retailMatch";

export function wholesaleUnitDisplayUsd(
  product: ProductDTO,
  policy: PurchasePolicy | null | undefined,
  mode: PriceMode,
  opts: { withIva: boolean; withIibb: boolean }
): number {
  const pricing = purchaseLinePricing(product, policy, mode);
  return displayAmountFromPricing(pricing, {
    withIva: opts.withIva,
    withIibb: opts.withIibb && pricing.mode !== "offline",
    provider: product.provider,
  }).unitDisplayUsd;
}

/**
 * Monto comparable en ARS.
 * Mayoristas: se suman IVA y percepciones por separado según cada toggle
 * (también si la columna está en esquema u offline; offline nunca lleva IIBB).
 * Locales: precio listado, ya con todo incluido — esos toggles no aplican.
 */
export function compareEntrySortArs(
  entry: CompareEntry,
  ctx: {
    withIva: boolean;
    withIibb: boolean;
    usdArs: number;
    policies: Record<string, PurchasePolicy>;
  }
): number {
  if (entry.kind === "retail") {
    const costArs =
      entry.costUsd != null && entry.costUsd > 0 && ctx.usdArs > 0
        ? entry.costUsd * ctx.usdArs
        : null;
    return repairImplausibleSalePrice(entry.hit.price, costArs);
  }
  const usd = wholesaleUnitDisplayUsd(
    entry.product,
    ctx.policies[entry.product.provider],
    entry.mode,
    { withIva: ctx.withIva, withIibb: ctx.withIibb }
  );
  return ctx.usdArs > 0 ? usd * ctx.usdArs : usd;
}
