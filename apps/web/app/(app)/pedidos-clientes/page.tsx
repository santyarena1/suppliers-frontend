"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import { portfolioApi, type ClientOrder } from "@/lib/api";
import { Loader2 } from "lucide-react";

export default function PedidosClientesPage() {
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void portfolioApi.clientOrders()
      .then((res) => setOrders(res.data))
      .catch((err: unknown) => {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setError(msg || "No se pudieron cargar los pedidos");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Pedidos de clientes</h1>
          <p className="text-xs text-surface-500 hidden sm:block">Lo que los comercios te pidieron a vos</p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-surface-400">Todavía no hay pedidos de tus clientes.</p>
          ) : (
            <div className="border border-surface-800 rounded-2xl divide-y divide-surface-800 overflow-hidden">
              {orders.map((order) => (
                <div key={order.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-[140px]">
                    {order.linkId ? (
                      <Link href={`/cartera/${order.linkId}`} className="text-sm text-white hover:text-brand-300">
                        {order.commerceName}
                      </Link>
                    ) : (
                      <p className="text-sm text-white">{order.commerceName}</p>
                    )}
                    <p className="text-[11px] text-surface-500">{order.createdBy ?? "—"} · {order.itemsCount} ítems</p>
                  </div>
                  <p className="text-xs text-surface-400">
                    {order.approvalStatus === "PENDING_APPROVAL" ? "Esperando firma del local" : order.status}
                  </p>
                  <p className="text-xs text-surface-500">
                    {new Date(order.createdAt).toLocaleString("es-AR")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
