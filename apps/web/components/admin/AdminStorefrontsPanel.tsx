"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Store } from "lucide-react";
import { storefrontApi, type AdminStorefront } from "@/lib/api";
import { ago, apiError, hiddenReasonText } from "@/lib/storefront";

/**
 * Tiendas de comercios (Vender en NODO). El superadmin las ve todas y puede
 * frenarlas; el comercio no puede reactivar una tienda frenada.
 */
export default function AdminStorefrontsPanel({ showToast }: { showToast: (msg: string, ok?: boolean) => void }) {
  const [rows, setRows] = useState<AdminStorefront[]>([]);
  const [loading, setLoading] = useState(true);
  const [suspending, setSuspending] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await storefrontApi.adminList();
      setRows(res.data);
    } catch (err) {
      showToast(apiError(err, "No se pudieron cargar las tiendas"), false);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(row: AdminStorefront, status: "ACTIVE" | "SUSPENDED") {
    if (status === "SUSPENDED" && !reason.trim()) return showToast("Indicá el motivo", false);
    setWorking(row.id);
    try {
      await storefrontApi.adminSetStatus(row.id, status, status === "SUSPENDED" ? reason.trim() : undefined);
      showToast(status === "SUSPENDED" ? `Frenaste la tienda de ${row.name}` : `Reactivaste la tienda de ${row.name}`);
      setSuspending(null);
      setReason("");
      await load();
    } catch (err) {
      showToast(apiError(err, "No se pudo cambiar el estado"), false);
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Store className="h-4 w-4 text-brand-400" /> Tiendas de locales
          </h2>
          <p className="text-xs text-surface-500">
            Comercios que venden parte de su stock a otros comercios. Los pedidos para ser distribuidor o marca llegan a Solicitudes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-1.5 text-xs text-surface-300 hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-surface-800 bg-surface-900 px-4 py-8 text-center text-sm text-surface-400">
          Ningún comercio abrió su tienda todavía.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-800">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-surface-900 text-surface-500">
              <tr>
                <th className="px-3 py-2 font-medium">Comercio</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Productos</th>
                <th className="px-3 py-2 font-medium">Pedidos</th>
                <th className="px-3 py-2 font-medium">Stock confirmado</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-white">{r.name}</p>
                    <p className="font-mono text-[10px] text-surface-500">{r.provider}</p>
                    {r.contactPhone && <p className="text-[11px] text-surface-400">{r.contactPhone}</p>}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className={r.hiddenReason ? "text-amber-300" : "text-emerald-300"}>{r.hiddenReason ? "No se ve" : "Visible"}</p>
                    {r.hiddenReason && <p className="max-w-[220px] text-[11px] text-surface-500">{hiddenReasonText(r.hiddenReason, r.suspendedReason)}</p>}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-surface-200">{r.products}</td>
                  <td className="px-3 py-2.5 tabular-nums text-surface-200">
                    {r.orders}
                    {r.pendingOrders > 0 && <span className="ml-1 text-sky-300">({r.pendingOrders} pend.)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-surface-300">{ago(r.stockConfirmedAt)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {r.status === "SUSPENDED" ? (
                      <button
                        type="button"
                        onClick={() => void setStatus(r, "ACTIVE")}
                        disabled={working === r.id}
                        className="rounded-lg border border-emerald-500/30 px-2.5 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
                      >
                        Reactivar
                      </button>
                    ) : suspending === r.id ? (
                      <div className="flex flex-col items-end gap-1.5">
                        <input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          maxLength={500}
                          placeholder="Motivo (lo ve el comercio)"
                          className="w-56 rounded-lg border border-surface-700 bg-surface-950 px-2 py-1 text-[11px] text-white focus:border-brand-500 focus:outline-none"
                        />
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => void setStatus(r, "SUSPENDED")}
                            disabled={working === r.id}
                            className="rounded-lg bg-red-600/80 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                          >
                            Frenar
                          </button>
                          <button type="button" onClick={() => setSuspending(null)} className="text-[11px] text-surface-400 hover:text-white">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSuspending(r.id);
                          setReason("");
                        }}
                        className="rounded-lg border border-surface-700 px-2.5 py-1 text-[11px] text-surface-300 hover:text-white"
                      >
                        Frenar tienda
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
