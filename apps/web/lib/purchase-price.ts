import {
  computePurchaseUnit,
  type PurchasePolicy,
} from "@/lib/purchase-pricing";
import {
  extractTaxLines,
  linePricing,
  taxByKind,
  type TaxLine,
  type TaxableProduct,
} from "@/lib/tax";

export type PriceMode = "list" | "offline" | "scheme";

export type PurchaseLinePricing = ReturnType<typeof linePricing> & {
  missingIva: boolean;
  adjusted: boolean;
  mode: PriceMode;
};

function otherAmount(lines: TaxLine[]): number {
  return lines.filter((l) => l.kind === "other").reduce((s, l) => s + l.unitAmount, 0);
}

export function priceModeForCartItem(item: {
  channel?: "online" | "offline";
  schemeId?: string | null;
}): PriceMode {
  if (item.channel === "offline") return "offline";
  if (item.schemeId) return "scheme";
  return "list";
}

/**
 * Precio de lista, offline o esquema. Si el distribuidor no tiene esa modalidad
 * configurada, se muestra el precio de lista.
 */
export function purchaseLinePricing(
  product: TaxableProduct,
  policy: PurchasePolicy | null | undefined,
  mode: PriceMode,
  qty = 1
): PurchaseLinePricing {
  const base = linePricing(product, 1);
  const canOffline = Boolean(policy?.acceptsOffline && policy.ivaAdjustment);
  const canScheme = Boolean(policy?.acceptsScheme && policy.ivaAdjustment);
  const useOffline = mode === "offline" && canOffline;
  const useScheme = mode === "scheme" && canScheme;

  if (!useOffline && !useScheme) {
    const listed = linePricing(product, qty);
    return { ...listed, missingIva: false, adjusted: false, mode: "list" };
  }

  const lines = extractTaxLines(product);
  const iva = taxByKind(lines, "iva");
  const internos = taxByKind(lines, "internos");
  const iibb = taxByKind(lines, "iibb");
  const unit = computePurchaseUnit({
    net: base.unitNet,
    ivaPercent: iva?.percent ?? null,
    internosAmount: internos?.unitAmount ?? 0,
    iibbAmount: iibb?.unitAmount ?? 0,
    otherAmount: otherAmount(lines),
    ivaAdjustment: policy!.ivaAdjustment!,
    schemeDiscountPercent: useScheme ? policy!.schemeDiscountPercent : 0,
  });

  const nextLines: TaxLine[] = [];
  if (unit.ivaAmount != null) {
    nextLines.push({
      kind: "iva",
      label: "IVA",
      percent: unit.ivaPercent,
      unitAmount: unit.ivaAmount,
    });
  }
  if (internos && unit.internosAmount > 0.00005) {
    nextLines.push({ ...internos, unitAmount: unit.internosAmount });
  }
  if (iibb && unit.iibbAmount > 0.00005) {
    nextLines.push({ ...iibb, unitAmount: unit.iibbAmount });
  }
  for (const line of lines.filter((l) => l.kind === "other")) {
    nextLines.push(line);
  }

  const net = unit.net * qty;
  const gross = unit.gross * qty;
  return {
    unitNet: unit.net,
    unitGross: unit.gross,
    net,
    gross,
    tax: Math.max(0, gross - net),
    rate: unit.net > 0 ? (unit.gross - unit.net) / unit.net : 0,
    knownRate: unit.ivaPercent == null ? null : unit.ivaPercent / 100,
    lines: nextLines,
    missingIva: unit.missingIva,
    adjusted: true,
    mode: useScheme ? "scheme" : "offline",
  };
}
