"use client";

import { useEffect, useState } from "react";
import {
  newBytesAccountApi,
  newBytesCheckoutApi,
  NewBytesComprobante,
  NewBytesNodoDraft,
  NewBytesOrder,
} from "@/lib/api";
import NodoSpinner from "@/components/NodoSpinner";
import { Receipt, Wallet, XCircle } from "lucide-react";

export default function NewBytesAccountPanel() {
  const [orders, setOrders] = useState<NewBytesOrder[] | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<NewBytesOrder[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [movements, setMovements] = useState<NewBytesComprobante[] | null>(null);
  const [drafts, setDrafts] = useState<NewBytesNodoDraft[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [ordersRes, purchaseRes, statementRes, draftsRes] = await Promise.all([
        newBytesAccountApi.orders(),
        newBytesAccountApi.purchaseOrders().catch(() => ({ data: { orders: [] as NewBytesOrder[] } })),
        newBytesAccountApi.accountStatement(),
        newBytesCheckoutApi.drafts().catch(() => ({ data: [] as NewBytesNodoDraft[] })),
      ]);
      setOrders(ordersRes.data.orders);
      setPurchaseOrders(purchaseRes.data.orders);
      setBalance(statementRes.data.balance);
      setMovements(statementRes.data.movements);
      setDrafts(draftsRes.data ?? []);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo traer Pedidos/Comprobantes de NewBytes. ¿Están user y password del portal?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <p className="text-xs text-surface-500">
        Datos reales tomados de tu cuenta en nb.com.ar (API oficial) — solo lectura, no modifica nada ahí.
      </p>
      {loading ? (
        <div className="flex justify-center py-10"><NodoSpinner className="w-6 h-6" /></div>
      ) : error ? (
        <div className="flex items-center gap-2 text-xs rounded-lg px-3.5 py-2.5 bg-red-500/8 border border-red-500/20 text-red-400">
          <XCircle className="w-4 h-4 flex-shrink-0" /> {error}
          <button onClick={load} className="ml-auto underline">Reintentar</button>
        </div>
      ) : (
        <>
          <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Wallet className="w-4 h-4 text-sky-400" />
              Comprobantes / Cuenta Corriente
            </div>
            {balance != null && (
              <div>
                <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Saldo</span>
                <p className={`text-2xl font-bold tabular-nums ${balance < 0 ? "text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                  {balance.toLocaleString("es-AR", { style: "currency", currency: "USD" })}
                </p>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-surface-500">
                    <th className="text-left font-semibold px-2 py-2">Fecha</th>
                    <th className="text-left font-semibold px-2 py-2">Tipo</th>
                    <th className="text-left font-semibold px-2 py-2">Número</th>
                    <th className="text-left font-semibold px-2 py-2">Detalle</th>
                    <th className="text-right font-semibold px-2 py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800">
                  {(movements ?? []).map((m, i) => (
                    <tr key={String(m.voucherId ?? i)}>
                      <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{m.invoiceDate}</td>
                      <td className="px-2 py-2 text-surface-200">{m.invoiceType}{m.branch != null ? `-${m.branch}` : ""}</td>
                      <td className="px-2 py-2 text-surface-400 font-mono text-xs">{m.invoiceNumber}</td>
                      <td className="px-2 py-2 text-surface-400">{m.invoiceLabel}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-surface-200">
                        {m.totalUsd != null ? `USD ${m.totalUsd.toLocaleString("es-AR", { maximumFractionDigits: 2 })}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(movements ?? []).length === 0 && (
                <p className="text-center text-xs text-surface-500 py-6">Sin comprobantes.</p>
              )}
            </div>
          </div>

          <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Receipt className="w-4 h-4 text-sky-400" />
              Pedidos creados desde Nodo
            </div>
            <DraftsTable drafts={drafts ?? []} />
          </div>

          <OrdersTable title="Mis Pedidos" orders={orders ?? []} numberKey="albNumber" />
          <OrdersTable title="Órdenes de compra" orders={purchaseOrders ?? []} numberKey="orderNumber" />
        </>
      )}
    </div>
  );
}

function DraftsTable({ drafts }: { drafts: NewBytesNodoDraft[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-surface-500">
            <th className="text-left font-semibold px-2 py-2">Estado</th>
            <th className="text-left font-semibold px-2 py-2">Orden</th>
            <th className="text-left font-semibold px-2 py-2">Fecha</th>
            <th className="text-right font-semibold px-2 py-2">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {drafts.map((d) => (
            <tr key={d.id}>
              <td className="px-2 py-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  d.status === "CREATED" ? "bg-sky-500/10 text-sky-400" : "bg-red-500/10 text-red-400"
                }`}>{d.status === "CREATED" ? "Creado" : d.status}</span>
              </td>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">{d.invidOrderNumber ?? d.invidWebOrderNumber ?? "—"}</td>
              <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{new Date(d.createdAt).toLocaleString("es-AR")}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">{d.total ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {drafts.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">Todavía no creaste pedidos desde Nodo.</p>
      )}
    </div>
  );
}

function OrdersTable({ title, orders, numberKey }: { title: string; orders: NewBytesOrder[]; numberKey: "albNumber" | "orderNumber" }) {
  return (
    <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Receipt className="w-4 h-4 text-brand-700 dark:text-brand-400" />
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-surface-500">
              <th className="text-left font-semibold px-2 py-2">N°</th>
              <th className="text-left font-semibold px-2 py-2">Sucursal</th>
              <th className="text-left font-semibold px-2 py-2">Estado</th>
              <th className="text-left font-semibold px-2 py-2">Fecha</th>
              <th className="text-right font-semibold px-2 py-2">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-800">
            {orders.map((o, i) => (
              <tr key={i}>
                <td className="px-2 py-2 text-surface-400 font-mono text-xs">{o[numberKey] || o.orderNumber || o.webOrderNumber || "—"}</td>
                <td className="px-2 py-2 text-surface-400 font-mono text-xs">{o.branch ?? "—"}</td>
                <td className="px-2 py-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    /cerrad|entreg|factur|complet/i.test(o.status) ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : /cancel|anul|vencid/i.test(o.status) ? "bg-red-500/10 text-red-400"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  }`}>{o.status || "—"}</span>
                </td>
                <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{o.date}</td>
                <td className="px-2 py-2 text-right tabular-nums text-surface-200">{o.amount ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && (
          <p className="text-center text-xs text-surface-500 py-6">Sin registros.</p>
        )}
      </div>
    </div>
  );
}
