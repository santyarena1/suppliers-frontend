"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import { orgCartApi, type RecentProviderOrder } from "@/lib/api";
import { providerLabel } from "@/components/ProviderBadge";
import type { CartItem } from "@/lib/cart";

/** Cada cuánto se vuelven a mirar los pedidos mientras el carrito está abierto. */
const REFRESH_MS = 30_000;

function minutesAgo(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

/**
 * «Ya pediste esto»: si en las últimas horas salió (o se está creando) un
 * pedido a un distribuidor con productos que siguen en el carrito, se avisa
 * antes de confirmar otra vez. Pasa cuando el pedido terminó en segundo plano
 * o desde otra PC.
 */
export default function RecentOrdersNotice({ items, providers }: { items: CartItem[]; providers?: string[] }) {
  const [orders, setOrders] = useState<RecentProviderOrder[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      orgCartApi
        .recentOrders(6)
        .then((res) => {
          if (alive) setOrders(Array.isArray(res.data) ? res.data : []);
        })
        .catch(() => {
          /* sin aviso si no se puede consultar */
        });
    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const inCart = new Map<string, Set<string>>();
  for (const it of items) {
    if (it.channel === "offline") continue;
    if (!inCart.has(it.provider)) inCart.set(it.provider, new Set());
    inCart.get(it.provider)!.add(it.externalId);
  }

  const warnings = orders
    .filter((o) => !providers || providers.includes(o.provider))
    .map((o) => ({ order: o, overlap: o.items.filter((i) => inCart.get(o.provider)?.has(i.code)).length }))
    .filter((w) => w.overlap > 0);
  // Uno por distribuidor: el más reciente.
  const byProvider = new Map<string, (typeof warnings)[number]>();
  for (const w of warnings) if (!byProvider.has(w.order.provider)) byProvider.set(w.order.provider, w);
  if (byProvider.size === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {[...byProvider.values()].map(({ order, overlap }) => {
        const pending = order.status === "PENDING";
        const who = order.byUsername ? ` por ${order.byUsername}` : "";
        const number = order.orderNumber ? ` (N° ${order.orderNumber})` : "";
        return (
          <div
            key={order.id}
            role="alert"
            className="flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100"
          >
            {pending ? (
              <Loader2 className="w-4 h-4 mt-0.5 flex-shrink-0 animate-spin text-amber-300" />
            ) : (
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-300" />
            )}
            <div className="min-w-0">
              <p className="font-semibold text-amber-50">
                {pending
                  ? `Se está creando un pedido a ${providerLabel(order.provider)} con ${overlap === 1 ? "un producto" : `${overlap} productos`} de este carrito`
                  : `Ya pediste a ${providerLabel(order.provider)} ${overlap === 1 ? "un producto" : `${overlap} productos`} de este carrito`}
              </p>
              <p className="mt-0.5 text-amber-100/80">
                {pending
                  ? `Lo inició${who} ${minutesAgo(order.createdAt)}. Esperá a que termine antes de confirmar otra vez: cuando sale, esos productos se sacan solos del carrito.`
                  : `Pedido${number} creado${who} ${minutesAgo(order.createdAt)}. Revisalo antes de confirmar otro igual.`}
                {" "}
                <Link href="/pedidos" className="underline underline-offset-2 hover:text-white">
                  Ver pedidos
                </Link>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
