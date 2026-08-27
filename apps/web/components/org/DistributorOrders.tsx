"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import { getTenant } from "@/lib/auth";
import { myApi, type OwnClientOrder } from "@/lib/api";
import { formatUSD } from "@/lib/format";
import { ClipboardList, Loader2, MessageSquare } from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/**
 * Pedidos de los comercios vinculados. Un vendedor solo ve los de sus cuentas.
 * Un Product Manager, por defecto los de las marcas que administra; puede ver toda la cartera.
 */
export default function DistributorOrders() {
  const tenant = getTenant();
  const isPm = tenant?.role === "PRODUCT_MANAGER";
  const [orders, setOrders] = useState<OwnClientOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [onlyMyBrands, setOnlyMyBrands] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await myApi.clientOrders(undefined, isPm ? (onlyMyBrands ? "brands" : "all") : undefined);
      setOrders(res.data);
      setAviso(null);
    } catch (err) {
      setAviso(errMsg(err, "No se pudieron cargar los pedidos"));
    } finally {
      setLoading(false);
    }
  }, [isPm, onlyMyBrands]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orders.filter((order) => {
      if (needle && !(order.clientName ?? "").toLowerCase().includes(needle) && !order.providerName.toLowerCase().includes(needle)) {
        return false;
      }
      if (status !== "ALL" && order.status !== status) return false;
      return true;
    });
  }, [orders, q, status]);

  const statuses = useMemo(() => [...new Set(orders.map((order) => order.status))], [orders]);

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
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar comercio o proveedor"
              className="flex-1 min-w-[160px] bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-xs text-white"
            >
              <option value="ALL">Todos los estados</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            {isPm && (
              <label className="flex items-center gap-1.5 text-xs text-surface-400">
                <input
                  type="checkbox"
                  checked={onlyMyBrands}
                  onChange={(e) => setOnlyMyBrands(e.target.checked)}
                  className="accent-brand-600"
                />
                Solo mis marcas
              </label>
            )}
          </div>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="border border-surface-800 rounded-xl p-8 text-center flex flex-col gap-2 items-center">
              <ClipboardList className="w-8 h-8 text-surface-600" />
              <p className="text-sm text-surface-300">
                {orders.length === 0 ? "Todavía no hay pedidos de tus clientes en NODO." : "Ningún pedido coincide con el filtro."}
              </p>
            </div>
          ) : (
            <div className="border border-surface-800 rounded-xl divide-y divide-surface-800 overflow-hidden">
              {filtered.map((order) => (
                <div key={order.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-[140px]">
                    {order.linkId ? (
                      <Link href={`/clientes/${order.linkId}`} className="text-sm text-white hover:text-brand-200">
                        {order.clientName ?? "Cliente"}
                      </Link>
                    ) : (
                      <p className="text-sm text-white">{order.clientName ?? "Cliente"}</p>
                    )}
                    <p className="text-[11px] text-surface-500">{order.providerName}</p>
                  </div>
                  {order.inBrandScope === false && (
                    <span className="text-[10px] uppercase tracking-wide text-surface-500">Otra marca</span>
                  )}
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
                  {order.linkId && order.linkStatus !== "REVOKED" && (
                    <Link
                      href={`/mensajes?linkId=${order.linkId}`}
                      className="w-9 h-9 flex items-center justify-center rounded-full text-surface-500 hover:text-brand-300 hover:bg-surface-800"
                      aria-label="Abrir chat"
                      title="Abrir chat con esa persona del comercio"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </Link>
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
