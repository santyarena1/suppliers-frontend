"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Copy, ExternalLink, Loader2 } from "lucide-react";
import { ordersApi, type TenantOrder } from "@/lib/api";
import { buildSellerMessageFromOrder } from "@/lib/seller-message";
import { getTenant } from "@/lib/auth";
import { useMyProviders } from "@/lib/myProviders";

/**
 * Historial de pedidos registrados en Nodo para un proveedor que cotiza por
 * lista: no hay portal donde mirarlos, así que se ven acá y se puede volver a
 * copiar el mensaje para el vendedor.
 */
export default function NodoOrdersPanel({ provider }: { provider: string }) {
  const [orders, setOrders] = useState<TenantOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const { providers } = useMyProviders();
  const sellerName = useMemo(() => providers.find((p) => p.provider === provider)?.accountManager?.name ?? null, [providers, provider]);

  useEffect(() => {
    let alive = true;
    ordersApi
      .list()
      .then((r) => alive && setOrders(r.data.filter((o) => o.provider === provider)))
      .catch(() => alive && setError("No se pudieron cargar los pedidos"));
    return () => {
      alive = false;
    };
  }, [provider]);

  async function copy(order: TenantOrder) {
    const txt = buildSellerMessageFromOrder({
      provider: order.provider,
      items: (order.items ?? []) as Parameters<typeof buildSellerMessageFromOrder>[0]["items"],
      clientName: getTenant()?.name ?? null,
      sellerName,
      quoteRate: order.quoteRate ?? null,
    });
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(order.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* portapapeles bloqueado: no hay nada que hacer */
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-surface-500">
          Pedidos que registraste en Nodo y le mandaste al vendedor como mensaje. Se editan desde Pedidos.
        </p>
        <Link href="/pedidos?filter=offline" className="flex items-center gap-1 text-xs text-brand-700 dark:text-brand-400 hover:underline">
          <ExternalLink className="w-3.5 h-3.5" /> Ver en Pedidos
        </Link>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="border border-surface-800 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-900 text-[10px] uppercase tracking-wider text-surface-500 font-semibold">
          <ClipboardList className="w-3.5 h-3.5" /> Pedidos
        </div>
        {orders === null ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
        ) : orders.length === 0 ? (
          <p className="text-center text-xs text-surface-500 py-10">Todavía no hay pedidos con este proveedor.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-surface-500">
                  <th className="text-left font-semibold px-4 py-2">Fecha</th>
                  <th className="text-left font-semibold px-3 py-2">Ítems</th>
                  <th className="text-right font-semibold px-3 py-2">Total u$s</th>
                  <th className="text-left font-semibold px-3 py-2">Estado</th>
                  <th className="text-left font-semibold px-3 py-2">Cargó</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-surface-900/60">
                    <td className="px-4 py-2 text-surface-300 whitespace-nowrap">{new Date(o.createdAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="px-3 py-2 text-surface-300 tabular-nums">{(o.items ?? []).length}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-surface-100">{o.total == null ? "—" : Number(o.total).toLocaleString("es-AR", { maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-xs text-amber-400">{o.channel === "OFFLINE" || o.status === "OFFLINE" ? "Por mensaje" : o.status}</td>
                    <td className="px-3 py-2 text-xs text-surface-400">{o.createdBy ?? "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" onClick={() => copy(o)} className="inline-flex items-center gap-1 text-[11px] font-medium text-surface-400 hover:text-white">
                        {copied === o.id ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />} Copiar mensaje
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
