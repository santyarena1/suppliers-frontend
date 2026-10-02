"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { adminSubscriptionsApi } from "@/lib/api";
import {
  ADMIN_SUBSCRIPTION_FILTERS,
  PLAN_CATALOG,
  formatUsd,
  type AdminSubscriptionFilter,
  type AdminSubscriptionRow,
} from "@/lib/plans";
import SubscriptionDetailDialog from "./subscription/SubscriptionDetailDialog";
import { StatusPill, fmtDate, type ShowToast } from "./subscription/shared";
import { CreditCard, Loader2, Search } from "lucide-react";

export default function SubscriptionsPanel({ showToast }: { showToast: ShowToast }) {
  const [filter, setFilter] = useState<AdminSubscriptionFilter>("all");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AdminSubscriptionRow[]>([]);
  const [counts, setCounts] = useState<Partial<Record<AdminSubscriptionFilter, number>>>({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const closeDetail = useCallback(() => setOpenId(null), []);
  // Acceso directo desde el Directorio: /admin?tab=subscriptions&org=<id> abre esa suscripción.
  const searchParams = useSearchParams();
  const orgParam = searchParams.get("org");
  useEffect(() => {
    if (orgParam) setOpenId(orgParam);
  }, [orgParam]);

  const load = useCallback(async () => {
    try {
      const res = await adminSubscriptionsApi.list(filter, query);
      setRows(res.data.rows);
      setCounts(res.data.counts);
    } catch {
      showToast("No se pudieron cargar las suscripciones", false);
    } finally {
      setLoading(false);
    }
  }, [filter, query, showToast]);

  useEffect(() => {
    const t = setTimeout(() => void load(), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <CreditCard className="w-4 h-4 text-brand-400 mt-0.5" />
        <p className="text-sm text-surface-300">
          Planes y facturación de los comercios. Los pagos se registran a mano; el estado se recalcula solo con las fechas (vencida, en gracia, suspendida). Nada de esto borra datos del comercio.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {ADMIN_SUBSCRIPTION_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`text-xs rounded-full px-3 py-1 border ${
              filter === key ? "border-brand-500 bg-brand-500/10 text-brand-300" : "border-surface-700 text-surface-400 hover:text-surface-200"
            }`}
          >
            {label}
            {counts[key] !== undefined && <span className="ml-1.5 text-surface-500">{counts[key]}</span>}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 rounded-md border border-surface-700 bg-surface-900 px-2 py-1">
          <Search className="w-3.5 h-3.5 text-surface-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar comercio"
            className="bg-transparent text-xs text-white outline-none w-40"
          />
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-surface-500 py-10 text-center">No hay suscripciones en este filtro.</p>
      ) : (
        <div className="border border-surface-800 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[860px] text-xs">
            <thead className="text-[11px] text-surface-500 text-left">
              <tr className="border-b border-surface-800">
                <th className="px-3 py-2 font-medium">Comercio</th>
                <th className="px-3 py-2 font-medium">Plan</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Precio</th>
                <th className="px-3 py-2 font-medium">Próximo vencimiento</th>
                <th className="px-3 py-2 font-medium">Último pago</th>
                <th className="px-3 py-2 font-medium">Cortesía</th>
                <th className="px-3 py-2 font-medium">Puesta en marcha</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.tenantId} className="border-t border-surface-800 first:border-t-0 hover:bg-surface-900/60">
                  <td className="px-3 py-2">
                    <p className="text-white">{row.tenantName}</p>
                    {row.pendingRequest && (
                      <p className="text-[10px] text-amber-300">
                        Pidió {row.pendingRequest.plan ? PLAN_CATALOG[row.pendingRequest.plan].label : "un cambio"}
                      </p>
                    )}
                    {row.paymentNoticeAt && <p className="text-[10px] text-sky-300">Avisó un pago el {fmtDate(row.paymentNoticeAt)}</p>}
                  </td>
                  <td className="px-3 py-2 text-surface-200">{row.planLabel}</td>
                  <td className="px-3 py-2">
                    <StatusPill row={row} />
                  </td>
                  <td className="px-3 py-2 text-surface-200 whitespace-nowrap">
                    {formatUsd(row.price)}
                    {row.priceOverridden && <span className="text-[10px] text-surface-500"> (pactado)</span>}
                  </td>
                  <td className="px-3 py-2 text-surface-300 whitespace-nowrap">
                    {fmtDate(row.dueAt)}
                    {row.daysUntilDue !== null && row.daysUntilDue >= 0 && row.daysUntilDue <= 7 && (
                      <span className="text-[10px] text-amber-300"> · en {row.daysUntilDue} d</span>
                    )}
                    {row.daysOverdue !== null && row.daysOverdue > 0 && <span className="text-[10px] text-red-300"> · {row.daysOverdue} d vencida</span>}
                  </td>
                  <td className="px-3 py-2 text-surface-300 whitespace-nowrap">
                    {row.lastPayment ? `${formatUsd(row.lastPayment.amount)} · ${fmtDate(row.lastPayment.paidAt)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-surface-300 whitespace-nowrap">
                    {row.courtesy.active ? (row.courtesy.until ? `Hasta ${fmtDate(row.courtesy.until)}` : "Sin vencimiento") : "—"}
                  </td>
                  <td className="px-3 py-2 text-surface-300">{row.setupFee.status === "NOT_APPLICABLE" ? "—" : row.setupFee.statusLabel}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => setOpenId(row.tenantId)} className="text-xs font-medium text-brand-400 hover:text-brand-300">
                      Gestionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <SubscriptionDetailDialog
          tenantId={openId}
          showToast={showToast}
          onClose={closeDetail}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}
