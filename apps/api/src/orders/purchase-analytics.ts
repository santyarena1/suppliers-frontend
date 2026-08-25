/**
 * Reportes de compras de UN solo comercio.
 *
 * Todo lo que sale de acá se arma a partir de pedidos ya filtrados por
 * `tenantId`. No hay agregados globales ni cruce entre locales.
 */

import { PROVIDER_LABELS, type Provider } from "@nodo/shared";

export const COUNTED_ORDER_STATUSES = ["CREATED", "OFFLINE"] as const;
export const UNKNOWN_BRAND = "Sin marca";
export const UNKNOWN_CATEGORY = "Sin categoría";
export const MAX_INSIGHT_ORDERS = 5000;
export const MAX_PRODUCT_ROWS = 250;
export const MAX_RANK_ROWS = 80;

export type PurchaseChannel = "ONLINE" | "OFFLINE";

export type CatalogEntry = {
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  name: string | null;
  imageUrl: string | null;
  currentPrice: number | null;
  stock: number | null;
};

export type CatalogStats = {
  skus: number;
  inStock: number;
  lastSyncAt: string | null;
  byProvider: { provider: string; skus: number; inStock: number; lastSyncAt: string | null }[];
};

export type OrderForAnalytics = {
  id: string;
  provider: string;
  status: string;
  channel?: string | null;
  items: unknown;
  createdAt: Date | string;
  total?: unknown;
};

export type ExtractedLine = {
  orderId: string;
  provider: string;
  channel: PurchaseChannel;
  createdAt: string;
  sku: string;
  name: string;
  qty: number;
  unitUsd: number;
  spendUsd: number;
};

export type RankRow = {
  key: string;
  label: string;
  spendUsd: number;
  units: number;
  orders: number;
  share: number;
  lastBoughtAt: string | null;
};

export type ProductRow = {
  sku: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  provider: string;
  providerName: string;
  qty: number;
  spendUsd: number;
  orders: number;
  lastPaidUsd: number;
  currentUsd: number | null;
  deltaPercent: number | null;
  stock: number | null;
  imageUrl: string | null;
  lastBoughtAt: string;
};

export type MonthRow = {
  month: string;
  label: string;
  spendUsd: number;
  orders: number;
  units: number;
  online: number;
  offline: number;
};

export type PurchaseInsights = {
  tenantName: string;
  periodDays: number;
  generatedAt: string;
  truncated: boolean;
  kpis: {
    spendUsd: number;
    orderTotalUsd: number;
    orders: number;
    units: number;
    avgTicketUsd: number;
    uniqueSkus: number;
    uniqueBrands: number;
    uniqueCategories: number;
    providersUsed: number;
    repeatSkuShare: number;
    avgUnitsPerOrder: number;
    catalogSkus: number;
    catalogInStock: number;
    lastSyncAt: string | null;
    previousSpendUsd: number | null;
    spendDeltaPercent: number | null;
  };
  concentration: {
    providers: { top1: number; top5: number; top10: number };
    brands: { top1: number; top5: number; top10: number };
  };
  channelMix: { channel: PurchaseChannel; spendUsd: number; orders: number; share: number }[];
  byMonth: MonthRow[];
  byWeekday: { weekday: number; label: string; spendUsd: number; orders: number }[];
  byProvider: (RankRow & { provider: string; catalogSkus: number; catalogInStock: number })[];
  byBrand: RankRow[];
  byCategory: RankRow[];
  bySubcategory: RankRow[];
  brandProviders: { brand: string; provider: string; spendUsd: number; units: number }[];
  topProducts: ProductRow[];
  recentOrders: {
    id: string;
    provider: string;
    providerName: string;
    channel: PurchaseChannel;
    createdAt: string;
    spendUsd: number;
    units: number;
    skus: number;
  }[];
};

export function catalogKey(provider: string, sku: string) {
  return `${provider}::${sku}`;
}

export function purchaseChannel(order: { status: string; channel?: string | null }): PurchaseChannel {
  if (order.channel === "OFFLINE" || order.status === "OFFLINE") return "OFFLINE";
  return "ONLINE";
}

export function providerLabel(provider: string) {
  return PROVIDER_LABELS[provider as Provider] ?? provider;
}

function asNum(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function shareOf(part: number, total: number) {
  if (total <= 0) return 0;
  return round1((part / total) * 100);
}

function named(value: string | null | undefined, fallback: string) {
  const s = (value ?? "").trim();
  return s || fallback;
}

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function arParts(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", ...opts }).format(
    new Date(iso)
  );
}

function monthKey(iso: string) {
  return arParts(iso, { year: "numeric", month: "2-digit" }).slice(0, 7);
}

function monthLabel(key: string) {
  const [year, month] = key.split("-");
  const names = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const i = Number(month) - 1;
  return `${names[i] ?? month} ${year.slice(2)}`;
}

function weekdayIndex(iso: string) {
  const day = arParts(iso, { weekday: "short" });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[day.slice(0, 3)] ?? new Date(iso).getUTCDay();
}

export function extractOrderLines(order: OrderForAnalytics): ExtractedLine[] {
  const items = Array.isArray(order.items) ? order.items : [];
  const channel = purchaseChannel(order);
  const createdAt = typeof order.createdAt === "string" ? order.createdAt : order.createdAt.toISOString();
  const lines: ExtractedLine[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const sku = String(it.externalId ?? it.code ?? "").trim();
    if (!sku) continue;
    const qty = asNum(it.qty);
    if (qty <= 0) continue;
    const unit = asNum(it.unitPrice ?? it.price ?? it.priceUsd);
    const spend = asNum(it.lineTotal ?? it.subtotal) || round2(unit * qty);
    if (spend < 0) continue;
    lines.push({
      orderId: order.id,
      provider: order.provider,
      channel,
      createdAt,
      sku,
      name: named(typeof it.name === "string" ? it.name : null, sku),
      qty,
      unitUsd: round2(unit),
      spendUsd: round2(spend),
    });
  }
  return lines;
}

function topShare(sortedSpend: number[], total: number, n: number) {
  const part = sortedSpend.slice(0, n).reduce((s, v) => s + v, 0);
  return shareOf(part, total);
}

function toRank(
  map: Map<string, { spend: number; units: number; orders: Set<string>; last: string | null; label: string }>,
  totalSpend: number,
  limit: number
): RankRow[] {
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      spendUsd: round2(v.spend),
      units: v.units,
      orders: v.orders.size,
      share: shareOf(v.spend, totalSpend),
      lastBoughtAt: v.last,
    }))
    .sort((a, b) => b.spendUsd - a.spendUsd || b.units - a.units)
    .slice(0, limit);
}

function bumpLast(current: string | null, next: string) {
  if (!current) return next;
  return next > current ? next : current;
}

function accRank(
  map: Map<string, { spend: number; units: number; orders: Set<string>; last: string | null; label: string }>,
  key: string,
  label: string,
  line: ExtractedLine
) {
  let row = map.get(key);
  if (!row) {
    row = { spend: 0, units: 0, orders: new Set(), last: null, label };
    map.set(key, row);
  }
  row.spend += line.spendUsd;
  row.units += line.qty;
  row.orders.add(line.orderId);
  row.last = bumpLast(row.last, line.createdAt);
}

export function computePurchaseInsights(
  orders: OrderForAnalytics[],
  catalog: Record<string, CatalogEntry>,
  opts: {
    tenantName: string;
    periodDays: number;
    truncated?: boolean;
    previousSpendUsd?: number | null;
    catalogStats?: CatalogStats;
    generatedAt?: Date;
  }
): PurchaseInsights {
  const generatedAt = (opts.generatedAt ?? new Date()).toISOString();
  const catalogStats = opts.catalogStats ?? { skus: 0, inStock: 0, lastSyncAt: null, byProvider: [] };
  const catalogByProvider = new Map(catalogStats.byProvider.map((p) => [p.provider, p]));

  const lines: ExtractedLine[] = [];
  const orderSpend = new Map<string, { spend: number; units: number; skus: Set<string>; provider: string; channel: PurchaseChannel; createdAt: string }>();

  for (const order of orders) {
    const extracted = extractOrderLines(order);
    const createdAt = typeof order.createdAt === "string" ? order.createdAt : order.createdAt.toISOString();
    const channel = purchaseChannel(order);
    const bucket = {
      spend: 0,
      units: 0,
      skus: new Set<string>(),
      provider: order.provider,
      channel,
      createdAt,
    };
    for (const line of extracted) {
      lines.push(line);
      bucket.spend += line.spendUsd;
      bucket.units += line.qty;
      bucket.skus.add(line.sku);
    }
    const orderTotal = asNum(order.total);
    if (orderTotal > 0 && extracted.length === 0) bucket.spend = orderTotal;
    orderSpend.set(order.id, bucket);
  }

  const spendUsd = round2(lines.reduce((s, l) => s + l.spendUsd, 0) || [...orderSpend.values()].reduce((s, o) => s + o.spend, 0));
  const orderTotalUsd = round2(
    orders.reduce((s, o) => {
      const n = asNum(o.total);
      if (n > 0) return s + n;
      return s + (orderSpend.get(o.id)?.spend ?? 0);
    }, 0)
  );
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const orderCount = orders.length;

  const byProviderMap = new Map<string, { spend: number; units: number; orders: Set<string>; last: string | null; label: string }>();
  const byBrandMap = new Map<string, { spend: number; units: number; orders: Set<string>; last: string | null; label: string }>();
  const byCategoryMap = new Map<string, { spend: number; units: number; orders: Set<string>; last: string | null; label: string }>();
  const bySubMap = new Map<string, { spend: number; units: number; orders: Set<string>; last: string | null; label: string }>();
  const brandProviderMap = new Map<string, { brand: string; provider: string; spend: number; units: number }>();
  const productMap = new Map<
    string,
    {
      sku: string;
      name: string;
      brand: string;
      category: string;
      subcategory: string;
      provider: string;
      qty: number;
      spend: number;
      orders: Set<string>;
      lastPaid: number;
      current: number | null;
      stock: number | null;
      imageUrl: string | null;
      lastBoughtAt: string;
    }
  >();
  const monthMap = new Map<string, MonthRow>();
  const weekdayMap = new Map<number, { spend: number; orders: Set<string> }>();
  const channelMap = new Map<PurchaseChannel, { spend: number; orders: Set<string> }>();
  const skuOrders = new Map<string, Set<string>>();

  for (const line of lines) {
    const meta = catalog[catalogKey(line.provider, line.sku)];
    const brand = named(meta?.brand, UNKNOWN_BRAND);
    const category = named(meta?.category, UNKNOWN_CATEGORY);
    const subcategory = named(meta?.subcategory, named(meta?.category, UNKNOWN_CATEGORY));
    const name = named(meta?.name, line.name);

    accRank(byProviderMap, line.provider, providerLabel(line.provider), line);
    accRank(byBrandMap, brand, brand, line);
    accRank(byCategoryMap, category, category, line);
    accRank(bySubMap, subcategory, subcategory, line);

    const bpKey = `${brand}::${line.provider}`;
    const bp = brandProviderMap.get(bpKey) ?? { brand, provider: line.provider, spend: 0, units: 0 };
    bp.spend += line.spendUsd;
    bp.units += line.qty;
    brandProviderMap.set(bpKey, bp);

    const pKey = catalogKey(line.provider, line.sku);
    let product = productMap.get(pKey);
    if (!product) {
      product = {
        sku: line.sku,
        name,
        brand,
        category,
        subcategory,
        provider: line.provider,
        qty: 0,
        spend: 0,
        orders: new Set(),
        lastPaid: line.unitUsd,
        current: meta?.currentPrice ?? null,
        stock: meta?.stock ?? null,
        imageUrl: meta?.imageUrl ?? null,
        lastBoughtAt: line.createdAt,
      };
      productMap.set(pKey, product);
    }
    product.qty += line.qty;
    product.spend += line.spendUsd;
    product.orders.add(line.orderId);
    product.lastPaid = line.unitUsd;
    if (line.createdAt > product.lastBoughtAt) product.lastBoughtAt = line.createdAt;
    if (meta?.name) product.name = named(meta.name, product.name);

    const mk = monthKey(line.createdAt);
    let month = monthMap.get(mk);
    if (!month) {
      month = { month: mk, label: monthLabel(mk), spendUsd: 0, orders: 0, units: 0, online: 0, offline: 0 };
      monthMap.set(mk, month);
    }
    month.spendUsd = round2(month.spendUsd + line.spendUsd);
    month.units += line.qty;
    if (line.channel === "OFFLINE") month.offline = round2(month.offline + line.spendUsd);
    else month.online = round2(month.online + line.spendUsd);

    const wd = weekdayIndex(line.createdAt);
    const w = weekdayMap.get(wd) ?? { spend: 0, orders: new Set() };
    w.spend += line.spendUsd;
    w.orders.add(line.orderId);
    weekdayMap.set(wd, w);

    const ch = channelMap.get(line.channel) ?? { spend: 0, orders: new Set() };
    ch.spend += line.spendUsd;
    ch.orders.add(line.orderId);
    channelMap.set(line.channel, ch);

    const seen = skuOrders.get(pKey) ?? new Set();
    seen.add(line.orderId);
    skuOrders.set(pKey, seen);
  }

  for (const bucket of orderSpend.values()) {
    const mk = monthKey(bucket.createdAt);
    const month = monthMap.get(mk);
    if (month) month.orders += 1;
    else {
      monthMap.set(mk, {
        month: mk,
        label: monthLabel(mk),
        spendUsd: round2(bucket.spend),
        orders: 1,
        units: bucket.units,
        online: bucket.channel === "ONLINE" ? round2(bucket.spend) : 0,
        offline: bucket.channel === "OFFLINE" ? round2(bucket.spend) : 0,
      });
    }
  }

  const uniqueSkus = productMap.size;
  const repeatSkus = [...skuOrders.values()].filter((s) => s.size > 1).length;

  const byBrand = toRank(byBrandMap, spendUsd, MAX_RANK_ROWS);
  const byProviderRank = toRank(byProviderMap, spendUsd, MAX_RANK_ROWS);
  const brandSpendSorted = byBrand.map((r) => r.spendUsd);
  const providerSpendSorted = byProviderRank.map((r) => r.spendUsd);

  const previous = opts.previousSpendUsd ?? null;
  const spendDeltaPercent =
    previous == null
      ? null
      : previous === 0
        ? spendUsd > 0
          ? 100
          : 0
        : round1(((spendUsd - previous) / previous) * 100);

  const topProducts: ProductRow[] = [...productMap.values()]
    .map((p) => {
      const delta =
        p.current != null && p.current > 0 && p.lastPaid > 0
          ? round1(((p.current - p.lastPaid) / p.lastPaid) * 100)
          : null;
      return {
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        category: p.category,
        subcategory: p.subcategory,
        provider: p.provider,
        providerName: providerLabel(p.provider),
        qty: p.qty,
        spendUsd: round2(p.spend),
        orders: p.orders.size,
        lastPaidUsd: round2(p.lastPaid),
        currentUsd: p.current,
        deltaPercent: delta,
        stock: p.stock,
        imageUrl: p.imageUrl,
        lastBoughtAt: p.lastBoughtAt,
      };
    })
    .sort((a, b) => b.spendUsd - a.spendUsd || b.qty - a.qty)
    .slice(0, MAX_PRODUCT_ROWS);

  const recentOrders = [...orderSpend.entries()]
    .sort((a, b) => (a[1].createdAt < b[1].createdAt ? 1 : -1))
    .slice(0, 25)
    .map(([id, o]) => ({
      id,
      provider: o.provider,
      providerName: providerLabel(o.provider),
      channel: o.channel,
      createdAt: o.createdAt,
      spendUsd: round2(o.spend),
      units: o.units,
      skus: o.skus.size,
    }));

  return {
    tenantName: opts.tenantName,
    periodDays: opts.periodDays,
    generatedAt,
    truncated: Boolean(opts.truncated),
    kpis: {
      spendUsd,
      orderTotalUsd,
      orders: orderCount,
      units,
      avgTicketUsd: orderCount ? round2(spendUsd / orderCount) : 0,
      uniqueSkus,
      uniqueBrands: byBrandMap.size,
      uniqueCategories: byCategoryMap.size,
      providersUsed: byProviderMap.size,
      repeatSkuShare: uniqueSkus ? shareOf(repeatSkus, uniqueSkus) : 0,
      avgUnitsPerOrder: orderCount ? round1(units / orderCount) : 0,
      catalogSkus: catalogStats.skus,
      catalogInStock: catalogStats.inStock,
      lastSyncAt: catalogStats.lastSyncAt,
      previousSpendUsd: previous,
      spendDeltaPercent,
    },
    concentration: {
      providers: {
        top1: topShare(providerSpendSorted, spendUsd, 1),
        top5: topShare(providerSpendSorted, spendUsd, 5),
        top10: topShare(providerSpendSorted, spendUsd, 10),
      },
      brands: {
        top1: topShare(brandSpendSorted, spendUsd, 1),
        top5: topShare(brandSpendSorted, spendUsd, 5),
        top10: topShare(brandSpendSorted, spendUsd, 10),
      },
    },
    channelMix: (["ONLINE", "OFFLINE"] as PurchaseChannel[])
      .map((channel) => {
        const row = channelMap.get(channel) ?? { spend: 0, orders: new Set<string>() };
        return {
          channel,
          spendUsd: round2(row.spend),
          orders: row.orders.size,
          share: shareOf(row.spend, spendUsd),
        };
      })
      .filter((r) => r.orders > 0 || r.spendUsd > 0),
    byMonth: [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    byWeekday: WEEKDAYS.map((label, weekday) => {
      const row = weekdayMap.get(weekday) ?? { spend: 0, orders: new Set<string>() };
      return { weekday, label, spendUsd: round2(row.spend), orders: row.orders.size };
    }),
    byProvider: byProviderRank.map((row) => {
      const cat = catalogByProvider.get(row.key);
      return {
        ...row,
        provider: row.key,
        catalogSkus: cat?.skus ?? 0,
        catalogInStock: cat?.inStock ?? 0,
      };
    }),
    byBrand,
    byCategory: toRank(byCategoryMap, spendUsd, MAX_RANK_ROWS),
    bySubcategory: toRank(bySubMap, spendUsd, 40),
    brandProviders: [...brandProviderMap.values()]
      .map((r) => ({ brand: r.brand, provider: r.provider, spendUsd: round2(r.spend), units: r.units }))
      .sort((a, b) => b.spendUsd - a.spendUsd)
      .slice(0, 100),
    topProducts,
    recentOrders,
  };
}
