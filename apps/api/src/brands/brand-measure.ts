import { normalizeBrandName } from "../tenants/portfolio";

export type CountedLine = {
  qty: number;
  spendUsd: number;
  sku: string;
  brand: string | null;
  provider: string;
};

function asNum(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Líneas de un pedido que se pueden atribuir a una marca (si hay dato). */
export function countedOrderLines(order: { provider: string; items: unknown }): CountedLine[] {
  const items = Array.isArray(order.items) ? order.items : [];
  const lines: CountedLine[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const qty = asNum(it.qty);
    if (qty <= 0) continue;
    const unit = asNum(it.unitPrice ?? it.price ?? it.priceUsd);
    const spend = asNum(it.lineTotal ?? it.subtotal) || unit * qty;
    if (spend < 0) continue;
    const brand = it.brand ?? it.displayBrand;
    lines.push({
      qty,
      spendUsd: spend,
      sku: String(it.externalId ?? it.code ?? "").trim(),
      brand: typeof brand === "string" && brand.trim() ? brand : null,
      provider: order.provider,
    });
  }
  return lines;
}

export function lineMatchesBrand(line: CountedLine, brandNames: string[]): boolean {
  if (!line.brand) return false;
  const wanted = new Set(brandNames.map(normalizeBrandName).filter(Boolean));
  return wanted.has(normalizeBrandName(line.brand));
}

export function lineMatchesProducts(line: CountedLine, productKeys: string[]): boolean {
  if (productKeys.length === 0) return true;
  if (!line.sku) return false;
  const key = `${line.provider}:${line.sku}`.toLowerCase();
  return productKeys.some((p) => p.toLowerCase() === key);
}

export function sumMatchingLines(
  orders: Array<{ provider: string; items: unknown }>,
  opts: { brandNames: string[]; providers?: string[]; productKeys?: string[] }
): { qty: number; spendUsd: number } {
  const providers = (opts.providers ?? []).map((p) => p.toUpperCase());
  let qty = 0;
  let spendUsd = 0;
  for (const order of orders) {
    if (providers.length && !providers.includes(order.provider.toUpperCase())) continue;
    for (const line of countedOrderLines(order)) {
      if (!lineMatchesBrand(line, opts.brandNames)) continue;
      if (!lineMatchesProducts(line, opts.productKeys ?? [])) continue;
      qty += line.qty;
      spendUsd += line.spendUsd;
    }
  }
  return { qty, spendUsd };
}

export function actionProgress(opts: {
  kind: "PURCHASE_QTY" | "PURCHASE_AMOUNT" | "REBATE";
  targetQty: number | null;
  targetAmountUsd: number | null;
  qty: number;
  spendUsd: number;
}): { current: number; target: number | null; ratio: number; met: boolean } {
  if (opts.kind === "PURCHASE_AMOUNT") {
    const target = opts.targetAmountUsd;
    const current = opts.spendUsd;
    const ratio = target && target > 0 ? Math.min(1, current / target) : 0;
    return { current, target, ratio, met: target != null && target > 0 && current + 1e-9 >= target };
  }
  const target = opts.targetQty;
  const current = opts.qty;
  const ratio = target && target > 0 ? Math.min(1, current / target) : 0;
  return { current, target, ratio, met: target != null && target > 0 && current + 1e-9 >= target };
}
