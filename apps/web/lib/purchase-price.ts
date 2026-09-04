import {
  computePurchaseUnit,
  type PurchasePolicy,
} from "@/lib/purchase-pricing";
import { getIibbRatePercent } from "@/lib/iibb-rates";
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

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function otherAmount(lines: TaxLine[]): number {
  return lines.filter((l) => l.kind === "other").reduce((s, l) => s + l.unitAmount, 0);
}

function productProvider(product: TaxableProduct): string | null {
  if (!product || typeof product !== "object" || !("provider" in product)) return null;
  const p = (product as { provider?: unknown }).provider;
  return typeof p === "string" && p ? p : null;
}

/**
 * Percepción unitaria: la del producto, o la alícuota de este comercio
 * (carrito / Configuración). Elit y otros no la mandan en el catálogo.
 */
function resolveLineIibb(
  product: TaxableProduct,
  lines: TaxLine[],
  unitNet: number,
  policy?: PurchasePolicy | null
): { percent: number | null; unitAmount: number; label: string; estimated: boolean } {
  // Proveedor que cotiza por lista: el IIBB lo cargó a mano el comercio en Configuración.
  const manual = policy?.manualIibbPercent;
  if (manual != null && manual > 0 && unitNet > 0) {
    return { percent: manual, unitAmount: round4(unitNet * (manual / 100)), label: "IIBB", estimated: false };
  }
  const existing = taxByKind(lines, "iibb");
  if (existing && existing.unitAmount > 0.0001) {
    const percent =
      existing.percent ??
      (unitNet > 0 ? round4((existing.unitAmount / unitNet) * 100) : null);
    return {
      percent,
      unitAmount: existing.unitAmount,
      label: existing.label,
      estimated: Boolean(existing.estimated),
    };
  }
  const pct = getIibbRatePercent(productProvider(product));
  if (pct != null && pct > 0 && unitNet > 0) {
    return {
      percent: pct,
      unitAmount: round4(unitNet * (pct / 100)),
      label: "Percepciones",
      estimated: true,
    };
  }
  return {
    percent: existing?.percent ?? null,
    unitAmount: 0,
    label: existing?.label ?? "Percepciones",
    estimated: false,
  };
}

function withIibbLine(
  lines: TaxLine[],
  iibb: { percent: number | null; unitAmount: number; label: string; estimated: boolean }
): TaxLine[] {
  const without = lines.filter((l) => l.kind !== "iibb");
  if (iibb.unitAmount <= 0.00005) return without;
  return [
    ...without,
    {
      kind: "iibb",
      label: iibb.label,
      percent: iibb.percent,
      unitAmount: iibb.unitAmount,
      estimated: iibb.estimated,
    },
  ];
}

/** Otras percepciones manuales (%) del comercio para un proveedor que cotiza por lista. */
function manualPerceptionLine(policy: PurchasePolicy | null | undefined, unitNet: number): TaxLine | null {
  const pct = policy?.manualPerceptionsPercent;
  if (pct == null || pct <= 0 || unitNet <= 0) return null;
  return { kind: "other", label: "Percepciones", percent: pct, unitAmount: round4(unitNet * (pct / 100)) };
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
 * El % de descuento solo aplica a ítems en esquema, no a sueltos del carrito online.
 * Lista y esquema suman percepciones (IIBB) si el producto o este comercio las tienen.
 * Offline: sin percepciones; internos sí.
 */
export function purchaseLinePricing(
  product: TaxableProduct,
  policy: PurchasePolicy | null | undefined,
  mode: PriceMode,
  qty = 1
): PurchaseLinePricing {
  const base = linePricing(product, 1);
  const canOffline = Boolean(policy?.acceptsOffline && policy.offlineIvaAdjustment);
  const canScheme = Boolean(policy?.acceptsScheme && policy.schemeIvaAdjustment);
  const useOffline = mode === "offline" && canOffline;
  const useScheme = mode === "scheme" && canScheme;
  const ivaAdjustment = useScheme
    ? policy!.schemeIvaAdjustment
    : useOffline
      ? policy!.offlineIvaAdjustment
      : null;

  if (!useOffline && !useScheme) {
    const listed = linePricing(product, qty);
    const iibb = resolveLineIibb(product, listed.lines, listed.unitNet, policy);
    const manualOther = manualPerceptionLine(policy, listed.unitNet);
    const nextLines = manualOther ? [...withIibbLine(listed.lines, iibb), manualOther] : withIibbLine(listed.lines, iibb);
    const taxFromLines = nextLines.reduce((s, l) => s + l.unitAmount, 0);
    const unitGross = taxFromLines > 0.00005
      ? round4(listed.unitNet + taxFromLines)
      : listed.unitGross;
    return {
      ...listed,
      unitGross,
      gross: unitGross * qty,
      tax: Math.max(0, unitGross * qty - listed.net),
      rate: listed.unitNet > 0 ? (unitGross - listed.unitNet) / listed.unitNet : listed.rate,
      lines: nextLines,
      missingIva: false,
      adjusted: false,
      mode: "list",
    };
  }

  const lines = extractTaxLines(product);
  const iva = taxByKind(lines, "iva");
  const internos = taxByKind(lines, "internos");
  const iibb = resolveLineIibb(product, lines, base.unitNet, policy);
  // Offline es sin percepciones: las manuales tampoco van.
  const manualOther = useOffline ? null : manualPerceptionLine(policy, base.unitNet);
  const unit = computePurchaseUnit({
    net: base.unitNet,
    ivaPercent: iva?.percent ?? null,
    internosAmount: internos?.unitAmount ?? 0,
    iibbAmount: iibb.unitAmount,
    iibbPercent: iibb.percent,
    otherAmount: otherAmount(lines) + (manualOther?.unitAmount ?? 0),
    ivaAdjustment: ivaAdjustment!,
    schemeDiscountPercent: useScheme ? policy!.schemeDiscountPercent : 0,
    dropPerceptions: useOffline,
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
  if (!useOffline && unit.iibbAmount > 0.00005) {
    nextLines.push({
      kind: "iibb",
      label: iibb.label,
      percent: iibb.percent,
      unitAmount: unit.iibbAmount,
      estimated: iibb.estimated,
    });
  }
  for (const line of lines.filter((l) => l.kind === "other")) {
    nextLines.push(line);
  }
  if (manualOther) nextLines.push(manualOther);

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
