"use client";

import { useEffect, useState } from "react";
import {
  elitAccountApi,
  elitCheckoutApi,
  NodoProviderDraft,
} from "@/lib/api";
import NodoSpinner from "@/components/NodoSpinner";
import { Receipt, Wallet, XCircle } from "lucide-react";
import Link from "next/link";

type ElitAccount = Awaited<ReturnType<typeof elitAccountApi.account>>["data"];

export default function ElitAccountPanel() {
  const [account, setAccount] = useState<ElitAccount | null>(null);
  const [drafts, setDrafts] = useState<NodoProviderDraft[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [accountRes, draftsRes] = await Promise.all([
        elitAccountApi.account(),
        elitCheckoutApi.drafts().catch(() => ({ data: [] as NodoProviderDraft[] })),
      ]);
      setAccount(accountRes.data);
      setDrafts(draftsRes.data ?? accountRes.data.drafts ?? []);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo traer Pedidos/Cta. Cte. de Elit. ¿Están el nº de cliente y la contraseña del portal?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <p className="text-xs text-surface-500">
        Pedidos y comprobantes de tu cuenta en elit.com.ar — solo lectura, no confirma ni cobra nada.
      </p>
      {loading ? (
        <div className="flex justify-center py-10"><NodoSpinner className="w-6 h-6" /></div>
      ) : error ? (
        <div className="flex items-start gap-2 text-xs rounded-lg px-3.5 py-2.5 bg-red-500/8 border border-red-500/20 text-red-400">
          <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">
            {error}{" "}
            <Link href="/proveedores/ELIT?tab=credentials" className="underline text-red-300 hover:text-white">
              Cargar cuenta
            </Link>
          </span>
          <button onClick={load} className="underline flex-shrink-0">Reintentar</button>
        </div>
      ) : (
        <>
          {account?.profile?.name && (
            <p className="text-xs text-surface-400">
              {account.profile.name}
              {account.profile.id ? ` · cliente ${account.profile.id}` : ""}
              {account.profile.exchange != null ? ` · USD ${account.profile.exchange}` : ""}
            </p>
          )}
          <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Wallet className="w-4 h-4 text-sky-400" />
              Cuenta corriente
            </div>
            {account?.balance != null && (
              <div>
                <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Saldo</span>
                <p className={`text-2xl font-bold tabular-nums ${account.balance < 0 ? "text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                  {account.balance.toLocaleString("es-AR", { style: "currency", currency: "USD" })}
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
                    <th className="text-right font-semibold px-2 py-2">Débito</th>
                    <th className="text-right font-semibold px-2 py-2">Crédito</th>
                    <th className="text-right font-semibold px-2 py-2">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800">
                  {(account?.movements ?? []).map((m, i) => (
                    <tr key={`${m.number}-${i}`}>
                      <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{m.date || "—"}</td>
                      <td className="px-2 py-2 text-surface-200">{m.form || "—"}</td>
                      <td className="px-2 py-2 text-surface-400 font-mono text-xs">{m.number || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-surface-200">{fmt(m.debit, m.currency)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-surface-200">{fmt(m.credit, m.currency)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-surface-200">{fmt(m.balanceUsd ?? m.balance, m.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(account?.movements ?? []).length === 0 && (
                <p className="text-center text-xs text-surface-500 py-6">Sin movimientos.</p>
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

          <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Receipt className="w-4 h-4 text-brand-700 dark:text-brand-400" />
              Notas de venta
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-surface-500">
                    <th className="text-left font-semibold px-2 py-2">N°</th>
                    <th className="text-left font-semibold px-2 py-2">Factura</th>
                    <th className="text-left font-semibold px-2 py-2">Estado</th>
                    <th className="text-left font-semibold px-2 py-2">Depósito</th>
                    <th className="text-left font-semibold px-2 py-2">Fecha</th>
                    <th className="text-right font-semibold px-2 py-2">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800">
                  {(account?.orders ?? []).map((o, i) => (
                    <tr key={`${o.orderNumber}-${i}`}>
                      <td className="px-2 py-2 text-surface-400 font-mono text-xs">{o.orderNumber || "—"}</td>
                      <td className="px-2 py-2 text-surface-400 font-mono text-xs">{o.invoiceNumber || "—"}</td>
                      <td className="px-2 py-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusClass(o.status)}`}>{o.status || "—"}</span>
                      </td>
                      <td className="px-2 py-2 text-surface-400">{o.warehouseName || "—"}</td>
                      <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{o.date || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-surface-200">{fmt(o.amount, o.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(account?.orders ?? []).length === 0 && (
                <p className="text-center text-xs text-surface-500 py-6">Sin notas de venta.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function fmt(n: number | null | undefined, currency?: string) {
  if (n == null) return "—";
  const code = currency === "ARS" ? "ARS" : "USD";
  return n.toLocaleString("es-AR", { style: "currency", currency: code, maximumFractionDigits: 2 });
}

function statusClass(status: string) {
  if (/cerrad|entreg|factur|complet|aprob/i.test(status)) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (/cancel|anul|vencid/i.test(status)) return "bg-red-500/10 text-red-400";
  return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
}

function DraftsTable({ drafts }: { drafts: NodoProviderDraft[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-surface-500">
            <th className="text-left font-semibold px-2 py-2">Estado</th>
            <th className="text-left font-semibold px-2 py-2">Pedido</th>
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
