"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import { myApi, type OwnClientOrder } from "@/lib/api";
import { formatUSD } from "@/lib/format";
import { ClipboardList, Loader2 } from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/**
 * Pedidos de los comercios vinculados. Un vendedor solo ve los de sus cuentas.
 * Un Product Manager, los de las marcas que administra.
 */
export default function DistributorOrders() {
  const [orders, setOrders] = useState<OwnClientOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await myApi.clientOrders();
      setOrders(res.data);
    } catch (err) {
      setAviso(errMsg(err, "No se pudieron cargar los pedidos"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Pedidos de clientes</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            Lo que pidieron los comercios vinculados a tu organización
          </p>
        </div>
        <PrefsPanel />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4">
          {aviso && <p className="text-xs rounded-md px-3 py-2 bg-red-500/10 text-red-400">{aviso}</p>}
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : orders.length === 0 ? (
            <div className="border border-surface-800 rounded-xl p-8 text-center flex flex-col gap-2 items-center">
              <ClipboardList className="w-8 h-8 text-surface-600" />
              <p className="text-sm text-surface-300">Todavía no hay pedidos de tus clientes en NODO.</p>
            </div>
          ) : (
            <div className="border border-surface-800 rounded-xl divide-y divide-surface-800 overflow-hidden">
              {orders.map((order) => (
                <div key={order.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-[140px]">
                    <p className="text-sm text-white">{order.clientName ?? "Cliente"}</p>
                    <p className="text-[11px] text-surface-500">{order.providerName}</p>
                  </div>
                  <span className="text-[11px] text-surface-400">{order.status}</span>
                  <span className="text-[11px] text-surface-400 tabular-nums">
                    {order.total != null ? formatUSD(order.total) : "—"}
                  </span>
                  <span className="text-[11px] text-surface-500">
                    {new Date(order.createdAt).toLocaleString("es-AR")}
                  </span>
                  {order.createdBy && (
                    <span className="text-[11px] text-surface-600">por {order.createdBy}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-surface-600">
            El detalle de cada comercio está en{" "}
            <Link href="/clientes" className="text-brand-400 hover:text-brand-300">
              Clientes
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
