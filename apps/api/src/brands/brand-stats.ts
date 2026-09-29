/**
 * Estadísticas de compras de una marca, a partir de las líneas de pedidos.
 * Una línea es de la marca si su código (proveedor + SKU) está en el índice de
 * la marca: códigos asociados a sus productos o que el distribuidor publica con
 * esa marca. Los códigos asociados a un producto se agrupan en él.
 */
import { providerLabel } from "../orders/purchase-analytics";

export interface BrandLine {
  tenantId: string;
  orderId: string;
  provider: string;
  createdAt: string;
  sku: string;
  name: string;
  qty: number;
  spendUsd: number;
}

export interface BrandSkuRef {
  itemId: string | null;
  itemName: string | null;
}

export type BrandSkuIndex = Map<string, BrandSkuRef>;

export function skuKey(provider: string, sku: string) {
  return `${provider}:${sku}`.toUpperCase();
}

export function buildSkuIndex(
  linked: { provider: string; externalId: string; itemId: string; itemName: string }[],
  catalog: { provider: string; externalId: string }[]
): BrandSkuIndex {
  const index: BrandSkuIndex = new Map();
  for (const row of catalog) index.set(skuKey(row.provider, row.externalId), { itemId: null, itemName: null });
  // Lo asociado a un producto pisa: agrupa el mismo producto de varios distribuidores.
  for (const row of linked) index.set(skuKey(row.provider, row.externalId), { itemId: row.itemId, itemName: row.itemName });
  return index;
}

export interface RankRow {
  key: string;
  label: string;
  spendUsd: number;
  units: number;
  orders: number;
  share: number;
}

export interface BrandPurchaseStats {
  totals: { spendUsd: number; units: number; orders: number; accounts: number };
  byProvider: RankRow[];
  topProducts: (RankRow & { itemId: string | null })[];
  byAccount: RankRow[];
  monthly: { month: string; spendUsd: number; units: number }[];
}

type Acc = { label: string; spend: number; units: number; orders: Set<string> };

function add(map: Map<string, Acc>, key: string, label: string, line: BrandLine) {
  const acc = map.get(key) ?? { label, spend: 0, units: 0, orders: new Set<string>() };
  acc.spend += line.spendUsd;
  acc.units += line.qty;
  acc.orders.add(line.orderId);
  map.set(key, acc);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function ranked(map: Map<string, Acc>, total: number, limit: number): RankRow[] {
  return [...map.entries()]
    .map(([key, acc]) => ({
      key,
      label: acc.label,
      spendUsd: round2(acc.spend),
      units: acc.units,
      orders: acc.orders.size,
      share: total > 0 ? Math.round((acc.spend / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.spendUsd - a.spendUsd || b.units - a.units || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** Meses (AAAA-MM) desde `from` hasta `now`, para que la serie no tenga huecos. */
export function monthKeys(from: Date, now: Date): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  while (d.getTime() <= end) {
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

export function summarizeBrandPurchases(
  lines: BrandLine[],
  index: BrandSkuIndex,
  opts: { from: Date; now: Date; accountNames?: Map<string, string>; limit?: number }
): BrandPurchaseStats {
  const limit = opts.limit ?? 10;
  const providers = new Map<string, Acc>();
  const products = new Map<string, Acc>();
  const productItem = new Map<string, string | null>();
  const accounts = new Map<string, Acc>();
  const months = new Map<string, { spend: number; units: number }>(
    monthKeys(opts.from, opts.now).map((m) => [m, { spend: 0, units: 0 }])
  );
  const orders = new Set<string>();
  let spend = 0;
  let units = 0;

  for (const line of lines) {
    const ref = index.get(skuKey(line.provider, line.sku));
    if (!ref) continue;
    spend += line.spendUsd;
    units += line.qty;
    orders.add(line.orderId);
    add(providers, line.provider, providerLabel(line.provider), line);
    const productKey = ref.itemId ?? skuKey(line.provider, line.sku);
    add(products, productKey, ref.itemName ?? line.name, line);
    productItem.set(productKey, ref.itemId);
    add(accounts, line.tenantId, opts.accountNames?.get(line.tenantId) ?? "Cuenta", line);
    const month = months.get(line.createdAt.slice(0, 7));
    if (month) {
      month.spend += line.spendUsd;
      month.units += line.qty;
    }
  }

  return {
    totals: { spendUsd: round2(spend), units, orders: orders.size, accounts: accounts.size },
    byProvider: ranked(providers, spend, limit),
    topProducts: ranked(products, spend, limit).map((row) => ({ ...row, itemId: productItem.get(row.key) ?? null })),
    byAccount: opts.accountNames ? ranked(accounts, spend, limit) : [],
    monthly: [...months.entries()].map(([month, v]) => ({ month, spendUsd: round2(v.spend), units: v.units })),
  };
}
