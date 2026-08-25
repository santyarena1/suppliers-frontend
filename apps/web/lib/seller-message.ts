import type { CartItem } from "@/lib/cart";
import type { PurchasePolicy } from "@/lib/purchase-pricing";
import { purchaseLinePricing, priceModeForCartItem } from "@/lib/purchase-price";
import { taxByKind } from "@/lib/tax";
import {
  formatSellerOrderText,
  providerDisplayName,
  sellerOrderReference,
  type SellerOrderCharge,
  type SellerOrderInput,
  type SellerOrderLine,
} from "@/lib/seller-order-text";

export type SellerMessageOpts = {
  scopeProvider?: string;
  items: CartItem[];
  policies: Record<string, PurchasePolicy>;
  clientName?: string | null;
  /** Vendedor (account manager) por proveedor. */
  sellers?: Record<string, string | null | undefined>;
  quoteRate?: number | null;
  now?: Date;
};

/**
 * Armado del texto que se copia al vendedor.
 * Offline: el IVA de la condición ya va en el precio y en la columna se ve 0%.
 * Online: se muestra la alícuota real. Sin mencionar portal, “sin facturar” ni el modo de IVA.
 */
export function buildSellerMessage(opts: SellerMessageOpts): string {
  const items = opts.scopeProvider
    ? opts.items.filter((it) => it.provider === opts.scopeProvider)
    : opts.items;
  if (items.length === 0) return "";

  const now = opts.now ?? new Date();
  const providers = [...new Set(items.map((it) => it.provider))];
  const orders: SellerOrderInput[] = providers.map((provider) =>
    buildProviderOrder(provider, items.filter((it) => it.provider === provider), opts, now)
  );
  return formatSellerOrderText(orders);
}

function buildProviderOrder(
  provider: string,
  items: CartItem[],
  opts: SellerMessageOpts,
  now: Date
): SellerOrderInput {
  const policy = opts.policies[provider];
  const lines: SellerOrderLine[] = [];
  const iibbByLabel = new Map<string, { usd: number; percent: number | null }>();
  let netUsd = 0;
  let ivaUsd = 0;
  let internosUsd = 0;

  for (const it of items) {
    const offline = it.channel === "offline";
    const pricing = purchaseLinePricing(it, policy, priceModeForCartItem(it), it.qty);
    const iva = taxByKind(pricing.lines, "iva");
    const internos = taxByKind(pricing.lines, "internos");
    const iibb = taxByKind(pricing.lines, "iibb");
    const unitIva = iva?.unitAmount ?? 0;
    const unitPriceUsd = offline ? pricing.unitNet + unitIva : pricing.unitNet;
    const lineTotalUsd = round2(unitPriceUsd * it.qty);
    lines.push({
      qty: it.qty,
      description: it.name,
      ivaPercent: offline ? 0 : (iva?.percent ?? 0),
      internosPercent: internos?.percent ?? 0,
      unitPriceUsd,
      lineTotalUsd,
    });
    netUsd += lineTotalUsd;
    if (!offline) ivaUsd += unitIva * it.qty;
    internosUsd += (internos?.unitAmount ?? 0) * it.qty;
    if (!offline && iibb && iibb.unitAmount > 0.00005) {
      const label = iibb.label?.trim() || "Percepciones";
      const prev = iibbByLabel.get(label) ?? { usd: 0, percent: iibb.percent };
      prev.usd += iibb.unitAmount * it.qty;
      if (prev.percent == null) prev.percent = iibb.percent;
      iibbByLabel.set(label, prev);
    }
  }

  const extraCharges: SellerOrderCharge[] = [];
  if (internosUsd > 0.005) {
    extraCharges.push({ label: "Imp. internos", usd: round2(internosUsd) });
  }
  for (const [label, row] of iibbByLabel) {
    const pctBit =
      row.percent != null && Number.isFinite(row.percent)
        ? ` ${formatPct(row.percent)}`
        : "";
    extraCharges.push({ label: `${label}${pctBit}`.trim(), usd: round2(row.usd) });
  }

  const iibbUsd = [...iibbByLabel.values()].reduce((s, r) => s + r.usd, 0);
  const finalUsd = round2(netUsd + ivaUsd + internosUsd + iibbUsd);

  return {
    reference: sellerOrderReference(now),
    providerLabel: providerDisplayName(provider),
    clientName: opts.clientName ?? null,
    sellerName: opts.sellers?.[provider] ?? null,
    quoteRate: opts.quoteRate ?? null,
    lines,
    netUsd: round2(netUsd),
    extraCharges,
    finalUsd,
  };
}

export function buildSellerMessageFromOrder(opts: {
  provider: string;
  items: Array<{
    name?: string;
    qty?: number;
    unitPrice?: number;
    lineTotal?: number;
    ivaPercent?: number;
    internosPercent?: number;
    internosAmount?: number;
  }>;
  clientName?: string | null;
  sellerName?: string | null;
  quoteRate?: number | null;
  now?: Date;
}): string {
  const lines: SellerOrderLine[] = [];
  let netUsd = 0;
  let internosUsd = 0;
  for (const it of opts.items) {
    const qty = it.qty && it.qty > 0 ? it.qty : 1;
    const unit = typeof it.unitPrice === "number" ? it.unitPrice : 0;
    const lineTotal = typeof it.lineTotal === "number" ? it.lineTotal : round2(unit * qty);
    lines.push({
      qty,
      description: it.name || "Producto",
      ivaPercent: it.ivaPercent ?? 0,
      internosPercent: it.internosPercent ?? 0,
      unitPriceUsd: unit,
      lineTotalUsd: lineTotal,
    });
    netUsd += lineTotal;
    internosUsd += (it.internosAmount ?? 0) * qty;
  }
  const extraCharges: SellerOrderCharge[] = [];
  if (internosUsd > 0.005) extraCharges.push({ label: "Imp. internos", usd: round2(internosUsd) });
  return formatSellerOrderText([
    {
      reference: sellerOrderReference(opts.now ?? new Date()),
      providerLabel: providerDisplayName(opts.provider),
      clientName: opts.clientName ?? null,
      sellerName: opts.sellerName ?? null,
      quoteRate: opts.quoteRate ?? null,
      lines,
      netUsd: round2(netUsd),
      extraCharges,
      finalUsd: round2(netUsd + internosUsd),
    },
  ]);
}

function formatPct(n: number) {
  const r = Math.round(n * 10) / 10;
  return `${Number.isInteger(r) ? String(r) : r.toFixed(1)}%`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
