/**
 * Historia de ejemplo del recorrido guiado: pedidos de los últimos meses (online,
 * como si hubieran salido por el portal, y offline) y bajas de precio recientes.
 * Todo es determinístico y queda marcado como demo (`[DEMO]` en las notas,
 * proveedores LIST_DEMO_*): se ve mientras dura el recorrido y nunca sale de NODO.
 */

import { DEMO_DISTRIBUTORS } from "./onboarding-demo";

export type DemoHistoryProduct = {
  provider: string;
  externalId: string;
  sku: string | null;
  name: string;
  price: number;
  finalPrice: number | null;
  ivaPercent: number | null;
};

export type DemoOrderSeed = {
  provider: string;
  channel: "ONLINE" | "OFFLINE";
  status: "CREATED" | "OFFLINE";
  orderNumber: string | null;
  paymentOption: string;
  paymentLabel: string | null;
  deliveryLabel: string | null;
  notes: string;
  createdAt: Date;
  subtotal: number;
  impuestos: number;
  total: number;
  items: {
    externalId: string;
    sku: string | null;
    name: string;
    qty: number;
    unitPrice: number;
    ivaPercent: number;
    lineTotal: number;
    pricingMode?: "offline";
  }[];
};

/** Marca de los pedidos demo (`isDemoOrderNote` la busca). */
export const DEMO_ORDER_TAG = "[DEMO]";

const DAY_MS = 86_400_000;
const PAYMENTS = ["Cuenta corriente 30 días", "Transferencia", "Cuenta corriente 15 días"] as const;
const DELIVERIES = ["Envío por expreso", "Retiro en depósito", "Moto en el día"] as const;
/** Días hacia atrás de cada pedido: dos o tres por semana durante ~3 meses. */
export const ORDER_DAYS = [1, 4, 6, 9, 13, 16, 20, 24, 29, 33, 38, 44, 51, 57, 63, 70, 77, 84];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function distroName(provider: string): string {
  return DEMO_DISTRIBUTORS.find((d) => d.providerKey === provider)?.name ?? provider;
}

/** Prefijo del número de pedido que "dio" el distribuidor. */
export function demoOrderPrefix(provider: string): string {
  return provider === "LIST_DEMO_SUR" ? "DS" : "DN";
}

/**
 * Pedidos de ejemplo. El más reciente es online (lo muestra el recorrido con su
 * factura); uno de cada tres es offline.
 */
export function buildDemoOrders(products: DemoHistoryProduct[], now = new Date()): DemoOrderSeed[] {
  const byProvider = new Map<string, DemoHistoryProduct[]>();
  for (const p of products) {
    if (!(p.price > 0)) continue;
    byProvider.set(p.provider, [...(byProvider.get(p.provider) ?? []), p]);
  }
  const providers = DEMO_DISTRIBUTORS.map((d) => d.providerKey).filter((key) => (byProvider.get(key)?.length ?? 0) > 0);
  if (providers.length === 0) return [];

  return ORDER_DAYS.map((daysAgo, i) => {
    const provider = providers[i % providers.length];
    const pool = byProvider.get(provider)!;
    const lines = 1 + (i % 3);
    const items = Array.from({ length: Math.min(lines, pool.length) }, (_, j) => {
      const product = pool[(i * 2 + j) % pool.length];
      const qty = 1 + ((i + j * 2) % 4);
      const unitPrice = round2(product.price);
      return {
        externalId: product.externalId,
        sku: product.sku,
        name: product.name,
        qty,
        unitPrice,
        ivaPercent: product.ivaPercent ?? 21,
        lineTotal: round2(unitPrice * qty),
      };
    });
    const subtotal = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));
    const impuestos = round2(items.reduce((sum, item) => sum + item.lineTotal * (item.ivaPercent / 100), 0));
    const offline = i % 3 === 2;
    const createdAt = new Date(now.getTime() - daysAgo * DAY_MS - (i % 5) * 3_600_000);
    return {
      provider,
      channel: offline ? "OFFLINE" : "ONLINE",
      status: offline ? "OFFLINE" : "CREATED",
      orderNumber: offline ? null : `${demoOrderPrefix(provider)}-${10480 + ORDER_DAYS.length - i}`,
      paymentOption: offline ? "OFFLINE" : "CTA_CTE",
      paymentLabel: offline ? null : PAYMENTS[i % PAYMENTS.length],
      deliveryLabel: DELIVERIES[i % DELIVERIES.length],
      notes: `${DEMO_ORDER_TAG} Pedido de ejemplo — ${distroName(provider)}`,
      createdAt,
      subtotal,
      impuestos,
      total: round2(subtotal + impuestos),
      items: offline ? items.map((item) => ({ ...item, pricingMode: "offline" as const })) : items,
    } satisfies DemoOrderSeed;
  });
}

export type DemoPricePoint = {
  provider: string;
  externalId: string;
  price: number;
  finalPrice: number | null;
  capturedAt: Date;
};

/**
 * Historial para "Bajaron de precio": unos productos estaban más caros hace unos
 * días y hoy valen lo que valen. Bajas de entre 6% y 18%.
 */
export function buildDemoPriceHistory(products: DemoHistoryProduct[], now = new Date(), count = 8): DemoPricePoint[] {
  const picked = products.filter((p) => p.price > 0).slice(0, count);
  return picked.flatMap((p, i) => {
    const factor = 1 + (6 + ((i * 5) % 13)) / 100;
    const before = new Date(now.getTime() - (2 + (i % 3)) * DAY_MS);
    return [
      {
        provider: p.provider,
        externalId: p.externalId,
        price: round2(p.price * factor),
        finalPrice: p.finalPrice == null ? null : round2(p.finalPrice * factor),
        capturedAt: before,
      },
      { provider: p.provider, externalId: p.externalId, price: p.price, finalPrice: p.finalPrice, capturedAt: now },
    ];
  });
}

/** Completa los marcadores del recorrido con la demo de este comercio. */
export function resolveTourHref(
  href: string | null,
  demo: { search: string | null; product: string | null; provider: string }
): string | null {
  if (!href) return href;
  let out = href.replace("{demoProvider}", demo.provider);
  out = out.replace("{demoSearch}", encodeURIComponent(demo.search ?? "monitor"));
  if (out.includes("{demoProduct}")) {
    if (!demo.product) return "/search?q=" + encodeURIComponent(demo.search ?? "monitor");
    out = out.replace("{demoProduct}", demo.product);
  }
  return out;
}
