/**
 * Métricas operativas de pedidos de UN comercio: envío, pago, dirección,
 * impuestos, sucursal y quién lo armó. Solo usa campos que ya se guardan
 * en ProviderOrder; no inventa costos.
 */

import { PROVIDER_LABELS, type Provider } from "@nodo/shared";

export type Fulfillment = "SHIPPING" | "PICKUP" | "UNKNOWN";

export type NamedCount = {
  key: string;
  label: string;
  spendUsd: number;
  extraUsd?: number;
  units: number;
  orders: number;
  share: number;
  lastBoughtAt: string | null;
};

export type OrderOpsInput = {
  id: string;
  provider: string;
  status: string;
  channel?: string | null;
  createdAt: Date | string;
  total?: unknown;
  subtotal?: unknown;
  impuestos?: unknown;
  percepciones?: unknown;
  paymentOption?: string | null;
  paymentLabel?: string | null;
  deliveryOption?: string | null;
  deliveryLabel?: string | null;
  notes?: string | null;
  addressSnapshot?: unknown;
  draftInput?: unknown;
  createdBy?: string | null;
};

function channelOf(order: { status?: string; channel?: string | null }) {
  if (order.channel === "OFFLINE" || order.status === "OFFLINE") return "OFFLINE" as const;
  return "ONLINE" as const;
}

export type OrderOps = {
  orderId: string;
  provider: string;
  channel: "ONLINE" | "OFFLINE";
  createdAt: string;
  fulfillment: Fulfillment;
  shippingUsd: number;
  shippingKnown: boolean;
  taxesUsd: number;
  perceptionsUsd: number;
  subtotalUsd: number;
  totalUsd: number;
  payment: string;
  delivery: string;
  address: string;
  warehouse: string;
  buyer: string;
  dropShipping: boolean;
  customerSale: boolean;
  hasNotes: boolean;
  quoteRate: number | null;
  hour: number;
};

export type OpsInsights = {
  kpis: {
    shippingUsd: number;
    shippingOrders: number;
    pickupOrders: number;
    unknownFulfillment: number;
    avgShippingUsd: number;
    taxesUsd: number;
    perceptionsUsd: number;
    subtotalUsd: number;
    uniqueAddresses: number;
    uniquePayments: number;
    dropShippingOrders: number;
    customerSaleOrders: number;
    withNotes: number;
    uniqueBuyers: number;
    shippingKnownOrders: number;
  };
  fulfillmentMix: { key: Fulfillment; label: string; orders: number; spendUsd: number; share: number }[];
  byPayment: NamedCount[];
  byDelivery: NamedCount[];
  byAddress: NamedCount[];
  byWarehouse: NamedCount[];
  byBuyer: NamedCount[];
  byHour: { hour: number; label: string; orders: number; spendUsd: number }[];
  shippingByMonth: { month: string; label: string; shippingUsd: number; shippedOrders: number; pickupOrders: number }[];
  shippingByProvider: { provider: string; label: string; shippingUsd: number; orders: number; spendUsd: number }[];
};

const PICKUP_RE = /\b(retiro|pickup|sucursal|dep[oó]sito|warehouse|jujuy|centro de distribuci[oó]n|\bcd\b)\b/i;
const SHIP_RE = /\b(env[ií]o|shipping|expreso|correo|transporte|domicilio|delivery)\b/i;

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

function text(value: unknown, max = 180) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function monthKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date(iso))
    .slice(0, 7);
}

function monthLabel(key: string) {
  const names = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const [year, month] = key.split("-");
  return `${names[Number(month) - 1] ?? month} ${year.slice(2)}`;
}

function hourOf(iso: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date(iso))
  );
  return Number.isFinite(hour) ? hour : 0;
}

function nestedNum(obj: Record<string, unknown>, path: string[]): number {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return 0;
    cur = (cur as Record<string, unknown>)[key];
  }
  return asNum(cur);
}

export function classifyFulfillment(order: {
  channel?: string | null;
  status?: string;
  deliveryOption?: string | null;
  deliveryLabel?: string | null;
  addressSnapshot?: unknown;
}): Fulfillment {
  const snap = rec(order.addressSnapshot);
  const label = `${order.deliveryOption ?? ""} ${order.deliveryLabel ?? ""} ${text(snap.label)} ${text(snap.entrega)}`;
  if (snap.pickup === true || String(order.deliveryOption ?? "") === "pickup") return "PICKUP";
  if (snap.dropShipping === true || snap.shipping === true) return "SHIPPING";
  if (PICKUP_RE.test(label)) return "PICKUP";
  if (SHIP_RE.test(label)) return "SHIPPING";
  if (text(order.deliveryLabel) || text(snap.Direccion) || text(snap.direccion) || text(snap.addressLine)) {
    return "SHIPPING";
  }
  if (channelOf(order) === "OFFLINE") return "UNKNOWN";
  return "UNKNOWN";
}

export function extractShippingUsd(order: {
  total?: unknown;
  subtotal?: unknown;
  impuestos?: unknown;
  percepciones?: unknown;
  addressSnapshot?: unknown;
  draftInput?: unknown;
}): { amount: number; known: boolean } {
  const snap = rec(order.addressSnapshot);
  const draft = rec(order.draftInput);
  const quote = rec(snap.quote);
  const explicit =
    asNum(snap.shippingCost) ||
    asNum(snap.shippingTotal) ||
    asNum(snap.costo_envio) ||
    asNum(snap.shipping) ||
    asNum(quote.total) ||
    asNum(quote.cost) ||
    asNum(quote.precio) ||
    nestedNum(draft, ["shippingCost"]) ||
    nestedNum(draft, ["shipping"]);
  if (explicit > 0) return { amount: round2(explicit), known: true };

  const total = asNum(order.total);
  const subtotal = asNum(order.subtotal);
  if (total <= 0 || subtotal <= 0) return { amount: 0, known: false };
  const remainder = round2(total - subtotal - asNum(order.impuestos) - asNum(order.percepciones));
  if (remainder >= 0.05 && remainder < total * 0.6) return { amount: remainder, known: true };
  return { amount: 0, known: false };
}

export function extractAddressLabel(order: {
  deliveryLabel?: string | null;
  addressSnapshot?: unknown;
}): string {
  const snap = rec(order.addressSnapshot);
  if (snap.pickup === true) {
    return text(snap.label || snap.addressLine || snap.name) || "Retiro en sucursal";
  }
  const parts = [
    snap.Direccion ?? snap.direccion ?? snap.address ?? snap.addressLine ?? snap.Calle,
    snap.NroPuerta ?? snap.numero ?? snap.number,
    snap.Localidad ?? snap.localidad ?? snap.Ciudad ?? snap.city ?? snap.place,
    snap.Provincia ?? snap.provincia ?? snap.province,
    snap.CodPostal ?? snap.codigoPostal ?? snap.postalCode ?? snap.cp ?? snap.zipCode,
  ]
    .map((v) => text(v, 80))
    .filter(Boolean);
  if (parts.length) return parts.join(", ");
  const shippingAddress = text(snap.shippingAddress);
  if (shippingAddress) return shippingAddress;
  const sucursal = text(snap.sucursal);
  if (sucursal) return `Sucursal ${sucursal}`;
  const warehouse = text(snap.warehouse);
  if (warehouse) return `Depósito ${warehouse}`;
  return text(order.deliveryLabel);
}

function warehouseLabel(order: { deliveryLabel?: string | null; addressSnapshot?: unknown; provider: string }): string {
  const snap = rec(order.addressSnapshot);
  const w = text(snap.warehouse ?? snap.sucursal ?? snap.branch);
  if (w) return w;
  if (snap.pickup === true) return text(snap.label) || "Retiro";
  return "";
}

export function extractOrderOps(order: OrderOpsInput): OrderOps {
  const createdAt = typeof order.createdAt === "string" ? order.createdAt : order.createdAt.toISOString();
  const snap = rec(order.addressSnapshot);
  const draft = rec(order.draftInput);
  const shipping = extractShippingUsd(order);
  const payment = text(order.paymentLabel) || text(order.paymentOption) || "Sin medio de pago";
  const delivery = text(order.deliveryLabel) || text(order.deliveryOption) || "Sin entrega cargada";
  const quoteRate = asNum(draft.quoteRate) || null;
  return {
    orderId: order.id,
    provider: order.provider,
    channel: channelOf(order),
    createdAt,
    fulfillment: classifyFulfillment(order),
    shippingUsd: shipping.amount,
    shippingKnown: shipping.known,
    taxesUsd: round2(asNum(order.impuestos)),
    perceptionsUsd: round2(asNum(order.percepciones)),
    subtotalUsd: round2(asNum(order.subtotal)),
    totalUsd: round2(asNum(order.total)),
    payment,
    delivery,
    address: extractAddressLabel(order) || "Sin dirección",
    warehouse: warehouseLabel(order),
    buyer: text(order.createdBy) || "Sin asignar",
    dropShipping: snap.dropShipping === true,
    customerSale: snap.customerSale === true,
    hasNotes: Boolean(text(order.notes, 20)),
    quoteRate: quoteRate && quoteRate > 0 ? quoteRate : null,
    hour: hourOf(createdAt),
  };
}

function toNamed(
  map: Map<string, { spend: number; extra: number; orders: Set<string>; last: string | null }>,
  totalOrders: number,
  limit = 40
): NamedCount[] {
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      label: key,
      spendUsd: round2(v.spend),
      extraUsd: round2(v.extra),
      units: v.orders.size,
      orders: v.orders.size,
      share: shareOf(v.orders.size, totalOrders),
      lastBoughtAt: v.last,
    }))
    .sort((a, b) => b.orders - a.orders || b.spendUsd - a.spendUsd)
    .slice(0, limit);
}

function bump(
  map: Map<string, { spend: number; extra: number; orders: Set<string>; last: string | null }>,
  key: string,
  ops: OrderOps,
  extra = 0
) {
  const k = key || "—";
  let row = map.get(k);
  if (!row) {
    row = { spend: 0, extra: 0, orders: new Set(), last: null };
    map.set(k, row);
  }
  row.spend += ops.totalUsd || ops.subtotalUsd;
  row.extra += extra;
  row.orders.add(ops.orderId);
  if (!row.last || ops.createdAt > row.last) row.last = ops.createdAt;
}

const FULFILLMENT_LABEL: Record<Fulfillment, string> = {
  SHIPPING: "Con envío",
  PICKUP: "Retiro / sucursal",
  UNKNOWN: "Sin dato de entrega",
};

export function computeOpsInsights(orders: OrderOpsInput[]): OpsInsights {
  const opsList = orders.map(extractOrderOps);
  const n = opsList.length;
  const payments = new Map<string, { spend: number; extra: number; orders: Set<string>; last: string | null }>();
  const deliveries = new Map<string, { spend: number; extra: number; orders: Set<string>; last: string | null }>();
  const addresses = new Map<string, { spend: number; extra: number; orders: Set<string>; last: string | null }>();
  const warehouses = new Map<string, { spend: number; extra: number; orders: Set<string>; last: string | null }>();
  const buyers = new Map<string, { spend: number; extra: number; orders: Set<string>; last: string | null }>();
  const hours = new Map<number, { orders: number; spend: number }>();
  const months = new Map<string, { shippingUsd: number; shipped: number; pickup: number }>();
  const providers = new Map<string, { shippingUsd: number; orders: number; spend: number }>();
  const mix = new Map<Fulfillment, { orders: number; spend: number }>();

  let shippingUsd = 0;
  let shippingKnownOrders = 0;
  let taxesUsd = 0;
  let perceptionsUsd = 0;
  let subtotalUsd = 0;
  let dropShippingOrders = 0;
  let customerSaleOrders = 0;
  let withNotes = 0;

  for (const ops of opsList) {
    bump(payments, ops.payment, ops);
    bump(deliveries, ops.delivery, ops, ops.shippingUsd);
    if (ops.address && ops.address !== "Sin dirección") bump(addresses, ops.address, ops, ops.shippingUsd);
    if (ops.warehouse) bump(warehouses, ops.warehouse, ops);
    bump(buyers, ops.buyer, ops);
    const h = hours.get(ops.hour) ?? { orders: 0, spend: 0 };
    h.orders += 1;
    h.spend += ops.totalUsd || ops.subtotalUsd;
    hours.set(ops.hour, h);

    const mk = monthKey(ops.createdAt);
    const month = months.get(mk) ?? { shippingUsd: 0, shipped: 0, pickup: 0 };
    month.shippingUsd = round2(month.shippingUsd + ops.shippingUsd);
    if (ops.fulfillment === "SHIPPING") month.shipped += 1;
    if (ops.fulfillment === "PICKUP") month.pickup += 1;
    months.set(mk, month);

    const p = providers.get(ops.provider) ?? { shippingUsd: 0, orders: 0, spend: 0 };
    p.shippingUsd = round2(p.shippingUsd + ops.shippingUsd);
    p.orders += 1;
    p.spend = round2(p.spend + (ops.totalUsd || ops.subtotalUsd));
    providers.set(ops.provider, p);

    const f = mix.get(ops.fulfillment) ?? { orders: 0, spend: 0 };
    f.orders += 1;
    f.spend += ops.totalUsd || ops.subtotalUsd;
    mix.set(ops.fulfillment, f);

    shippingUsd += ops.shippingUsd;
    if (ops.shippingKnown) shippingKnownOrders += 1;
    taxesUsd += ops.taxesUsd;
    perceptionsUsd += ops.perceptionsUsd;
    subtotalUsd += ops.subtotalUsd;
    if (ops.dropShipping) dropShippingOrders += 1;
    if (ops.customerSale) customerSaleOrders += 1;
    if (ops.hasNotes) withNotes += 1;
  }

  const shippingOrders = mix.get("SHIPPING")?.orders ?? 0;
  const pickupOrders = mix.get("PICKUP")?.orders ?? 0;

  return {
    kpis: {
      shippingUsd: round2(shippingUsd),
      shippingOrders,
      pickupOrders,
      unknownFulfillment: mix.get("UNKNOWN")?.orders ?? 0,
      avgShippingUsd: shippingKnownOrders ? round2(shippingUsd / shippingKnownOrders) : 0,
      taxesUsd: round2(taxesUsd),
      perceptionsUsd: round2(perceptionsUsd),
      subtotalUsd: round2(subtotalUsd),
      uniqueAddresses: addresses.size,
      uniquePayments: [...payments.keys()].filter((k) => k !== "Sin medio de pago").length,
      dropShippingOrders,
      customerSaleOrders,
      withNotes,
      uniqueBuyers: [...buyers.keys()].filter((k) => k !== "Sin asignar").length,
      shippingKnownOrders,
    },
    fulfillmentMix: (["SHIPPING", "PICKUP", "UNKNOWN"] as Fulfillment[])
      .map((key) => {
        const row = mix.get(key) ?? { orders: 0, spend: 0 };
        return {
          key,
          label: FULFILLMENT_LABEL[key],
          orders: row.orders,
          spendUsd: round2(row.spend),
          share: shareOf(row.orders, n),
        };
      })
      .filter((r) => r.orders > 0),
    byPayment: toNamed(payments, n),
    byDelivery: toNamed(deliveries, n),
    byAddress: toNamed(addresses, n, 50),
    byWarehouse: toNamed(warehouses, n),
    byBuyer: toNamed(buyers, n),
    byHour: Array.from({ length: 24 }, (_, hour) => {
      const row = hours.get(hour) ?? { orders: 0, spend: 0 };
      return {
        hour,
        label: `${String(hour).padStart(2, "0")}h`,
        orders: row.orders,
        spendUsd: round2(row.spend),
      };
    }),
    shippingByMonth: [...months.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, row]) => ({
        month,
        label: monthLabel(month),
        shippingUsd: row.shippingUsd,
        shippedOrders: row.shipped,
        pickupOrders: row.pickup,
      })),
    shippingByProvider: [...providers.entries()]
      .map(([provider, row]) => ({
        provider,
        label: PROVIDER_LABELS[provider as Provider] ?? provider,
        shippingUsd: row.shippingUsd,
        orders: row.orders,
        spendUsd: row.spend,
      }))
      .sort((a, b) => b.shippingUsd - a.shippingUsd),
  };
}
