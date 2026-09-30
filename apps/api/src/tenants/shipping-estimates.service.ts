import { Injectable } from "@nestjs/common";
import {
  learnShippingHabits,
  parseShippingMethods,
  resolveShippingEstimate,
  type LearnedShipping,
  type ObservedDelivery,
  type ShippingEstimate,
  type ShippingMethod,
} from "@nodo/shared";
import { COUNTED_ORDER_STATUSES } from "../orders/purchase-analytics";
import { classifyFulfillment, extractShipping } from "../orders/purchase-ops";
import { PrismaService } from "../prisma/prisma.service";

/** Cuántos pedidos atrás mira: lo habitual es lo de los últimos meses, no lo de hace dos años. */
const LOOKBACK_DAYS = 180;
const MAX_ORDERS = 400;
/** Pedidos por distribuidor que cuentan para decidir lo habitual. */
const PER_PROVIDER = 30;

export interface ProviderShippingView {
  provider: string;
  estimate: ShippingEstimate | null;
  learned: LearnedShipping;
  manual: ShippingMethod[];
}

type OrderRow = {
  provider: string;
  status: string;
  channel: string;
  createdAt: Date;
  deliveryOption: string | null;
  deliveryLabel: string | null;
  addressSnapshot: unknown;
  draftInput: unknown;
};

/**
 * Envío estimado por distribuidor para un comercio: cómo suele recibir y
 * cuánto le salió, más las formas de envío que cargó a mano.
 */
@Injectable()
export class ShippingEstimatesService {
  constructor(private readonly prisma: PrismaService) {}

  async forTenant(tenantId: string): Promise<ProviderShippingView[]> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
    const [orders, configs] = await Promise.all([
      this.prisma.providerOrder.findMany({
        where: { tenantId, status: { in: [...COUNTED_ORDER_STATUSES] }, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: MAX_ORDERS,
        select: {
          provider: true,
          status: true,
          channel: true,
          createdAt: true,
          deliveryOption: true,
          deliveryLabel: true,
          addressSnapshot: true,
          draftInput: true,
        },
      }),
      this.prisma.providerSyncConfig.findMany({
        where: { tenantId },
        select: { provider: true, shippingMethods: true },
      }),
    ]);

    const observedByProvider = new Map<string, ObservedDelivery[]>();
    for (const order of orders) {
      const list = observedByProvider.get(order.provider) ?? [];
      if (list.length >= PER_PROVIDER) continue;
      const observed = observeDelivery(order);
      if (observed) observedByProvider.set(order.provider, [...list, observed]);
    }
    const manualByProvider = new Map(configs.map((c) => [c.provider, parseShippingMethods(c.shippingMethods)]));

    const providers = new Set([...observedByProvider.keys(), ...manualByProvider.keys()]);
    const out: ProviderShippingView[] = [];
    for (const provider of providers) {
      const manual = manualByProvider.get(provider) ?? [];
      const learned = learnShippingHabits(observedByProvider.get(provider) ?? []);
      if (manual.length === 0 && learned.methods.length === 0) continue;
      out.push({ provider, estimate: resolveShippingEstimate(manual, learned), learned, manual });
    }
    return out;
  }
}

/**
 * La entrega de un pedido, si se puede reconocer. Los pedidos offline no pasan
 * por ningún portal y no dicen cómo se entregaron: no cuentan.
 */
export function observeDelivery(order: OrderRow): ObservedDelivery | null {
  if (order.channel === "OFFLINE" || order.status === "OFFLINE") return null;
  const fulfillment = classifyFulfillment(order);
  if (fulfillment === "UNKNOWN") return null;
  const pickup = fulfillment === "PICKUP";
  const label = pickup ? "Retiro" : deliveryName(order);
  if (!label) return null;
  const shipping = pickup ? null : extractShipping(order);
  const amount = shipping?.known ? (shipping.ars > 0 ? shipping.ars : shipping.usd) : null;
  const currency = shipping?.known ? (shipping.ars > 0 ? ("ARS" as const) : ("USD" as const)) : null;
  return { label, pickup, amount, currency, at: order.createdAt.toISOString() };
}

/**
 * El nombre de la forma de envío. New Bytes le agrega el plazo a la etiqueta
 * ("Moto (Capital Federal) (24 hs)"), que cambia entre pedidos: se usa el
 * nombre de la cotización para que el mismo envío caiga siempre en la misma fila.
 */
function deliveryName(order: OrderRow): string {
  const snap = asRecord(order.addressSnapshot);
  const quote = asRecord(snap.quote);
  const fromQuote = typeof quote.label === "string" ? quote.label.trim() : "";
  if (fromQuote) return fromQuote;
  return (order.deliveryLabel ?? "").trim() || (order.deliveryOption ?? "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
