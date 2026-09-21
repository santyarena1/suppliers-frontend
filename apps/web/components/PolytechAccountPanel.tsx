"use client";

import { useEffect, useState } from "react";
import {
  polytechAccountApi,
  polytechCheckoutApi,
  NodoProviderDraft,
  type PolytechAddress,
  type PolytechCourier,
  type PolytechHistoryOrder,
  type PolytechPerception,
} from "@/lib/api";
import { loadAccountCached, clearAccountCache } from "@/lib/account-portal-cache";
import NodoSpinner from "@/components/NodoSpinner";
import { XCircle } from "lucide-react";
import Link from "next/link";
import AccountRowDetail, { VerMasButton, type AccountDetailItem } from "@/components/account/AccountRowDetail";
import { draftItems, draftLines, draftTotals } from "@/components/account/draftDetail";
import AccountHistoryChrome from "@/components/account/AccountHistoryChrome";
import {
  useAccountHistoryState,
  useClampPage,
  usePagedMonthRows,
} from "@/components/account/useAccountHistory";
import { formatAccountSum, sumAccountAmounts } from "@/lib/account-history";
import { formatUSD } from "@/lib/format";

type CachedPayload = {
  profile: {
    legalName: string | null;
    userName: string | null;
    email: string | null;
    phone: string | null;
    showsVat: boolean;
  } | null;
  addresses: PolytechAddress[];
  couriers: PolytechCourier[];
  perceptions: PolytechPerception[];
  exchangeRate: number | null;
  orders: PolytechHistoryOrder[];
  drafts: NodoProviderDraft[];
  note: string;
};

const SECTIONS = [
  { id: "portal", label: "En Polytech" },
  { id: "nodo", label: "Desde Nodo" },
] as const;

const BUCKET_LABEL: Record<PolytechHistoryOrder["bucket"], string> = {
  pending: "Pendiente",
  in_process: "En proceso",
  shipped: "Despachado",
};

export default function PolytechAccountPanel() {
  const history = useAccountHistoryState("portal");
  const [data, setData] = useState<CachedPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [openDraft, setOpenDraft] = useState<NodoProviderDraft | null>(null);
  const [openOrder, setOpenOrder] = useState<PolytechHistoryOrder | null>(null);
  const [detailItems, setDetailItems] = useState<AccountDetailItem[] | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    void load(false);
  }, []);

  async function load(refresh: boolean) {
    setLoading(true);
    setError(null);
    try {
      if (refresh) clearAccountCache("PT:");
      const { data: payload, fromCache: hit } = await loadAccountCached<CachedPayload>(
        "PT:account",
        async () => {
          const accountRes = await polytechAccountApi.account({ refresh });
          const draftsRes = await polytechCheckoutApi.drafts().catch(() => ({ data: [] as NodoProviderDraft[] }));
          return {
            ...accountRes.data,
            drafts: draftsRes.data ?? accountRes.data.drafts ?? [],
          };
        },
        { refresh }
      );
      setData(payload);
      setFromCache(hit);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudieron traer los datos de Polytech. ¿Están las credenciales?");
    } finally {
      setLoading(false);
    }
  }

  async function openPortal(order: PolytechHistoryOrder) {
    setOpenOrder(order);
    setDetailItems(null);
    setDetailError(null);
    try {
      const query = order.bucket === "pending" ? { stateId: order.id } : { salesOrderId: order.id };
      const res = await polytechAccountApi.detail(query);
      setDetailItems(res.data.items.map((it) => ({
        code: it.sku,
        name: it.description || it.sku || "Ítem",
        qty: it.quantity ?? undefined,
        total: it.total ?? undefined,
        iva: it.vat ?? undefined,
      })));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDetailError(msg || "No se pudo leer el detalle del pedido.");
    }
  }

  const drafts = data?.drafts ?? null;
  const orders = data?.orders ?? null;
  const portalRows = usePagedMonthRows(orders, (o) => o.createdAt, history.month, history.page);
  const nodoRows = usePagedMonthRows(drafts, (d) => d.createdAt, history.month, history.page);
  const paged = history.section === "nodo" ? nodoRows : portalRows;
  useClampPage(history.page, paged.pages, history.setPage);

  const amountSum = sumAccountAmounts(
    (history.section === "nodo" ? paged.filtered.map((d) => (d as NodoProviderDraft).total) : paged.filtered.map((o) => (o as PolytechHistoryOrder).total))
  );
  const amountTotal = amountSum != null ? formatAccountSum(amountSum) : null;

  return (
    <>
      {data?.profile && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="border border-surface-800 rounded-xl px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">Cuenta</p>
            <p className="text-sm text-surface-200">{data.profile.legalName || data.profile.userName || "—"}</p>
            {data.profile.email && <p className="text-[11px] text-surface-500 mt-0.5">{data.profile.email}</p>}
          </div>
          <div className="border border-surface-800 rounded-xl px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">Percepciones</p>
            {data.perceptions.length === 0 ? (
              <p className="text-sm text-surface-500">Ninguna</p>
            ) : (
              <ul className="text-sm text-surface-200 space-y-1">
                {data.perceptions.map((p) => (
                  <li key={p.id}>{p.description} · {p.percent}%</li>
                ))}
              </ul>
            )}
          </div>
          <div className="border border-surface-800 rounded-xl px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">Dólar y direcciones</p>
            <p className="text-sm text-surface-200">{data.exchangeRate != null ? `USD ${data.exchangeRate.toLocaleString("es-AR")}` : "Sin cotización"}</p>
            <p className="text-[11px] text-surface-500 mt-0.5">{data.addresses.length} direcciones · {data.couriers.length} transportes</p>
          </div>
        </div>
      )}
      <AccountHistoryChrome
        sections={[...SECTIONS]}
        section={history.section}
        onSection={(id) => history.setSection(id)}
        month={history.month}
        onMonth={history.setMonth}
        page={paged.page}
        pages={paged.pages}
        total={paged.total}
        onPage={history.setPage}
        onRefresh={() => void load(true)}
        refreshing={loading}
        fromCache={fromCache}
        amountTotal={amountTotal}
        hint={data?.note || "Pedidos de la cuenta de Polytech y los creados desde Nodo."}
      >
        {loading && data == null ? (
          <div className="flex justify-center py-10"><NodoSpinner className="w-6 h-6" /></div>
        ) : error ? (
          <div className="flex items-start gap-2 text-xs rounded-lg px-3.5 py-2.5 bg-red-500/8 border border-red-500/20 text-red-400">
            <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="flex-1">
              {error}{" "}
              <Link href="/proveedores/POLYTECH?tab=credentials" className="underline text-red-300 hover:text-white">
                Cargar cuenta
              </Link>
            </span>
            <button type="button" onClick={() => void load(true)} className="underline flex-shrink-0">Reintentar</button>
          </div>
        ) : history.section === "nodo" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-surface-500">
                  <th className="text-left font-semibold px-2 py-2">Estado</th>
                  <th className="text-left font-semibold px-2 py-2">Pedido</th>
                  <th className="text-left font-semibold px-2 py-2">Fecha</th>
                  <th className="text-right font-semibold px-2 py-2">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {nodoRows.items.map((d) => (
                  <tr key={d.id}>
                    <td className="px-2 py-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        d.status === "CREATED" ? "bg-sky-500/10 text-sky-400" : "bg-red-500/10 text-red-400"
                      }`}>{d.status === "CREATED" ? "Creado" : d.status}</span>
                    </td>
                    <td className="px-2 py-2 text-surface-400 font-mono text-xs">{d.invidOrderNumber ?? "—"}</td>
                    <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{new Date(d.createdAt).toLocaleString("es-AR")}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-surface-200">{d.total != null ? formatUSD(Number(d.total)) : "—"}</td>
                    <td className="px-2 py-2 text-right"><VerMasButton onClick={() => setOpenDraft(d)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {nodoRows.items.length === 0 && (
              <p className="text-center text-xs text-surface-500 py-6">Todavía no creaste pedidos desde Nodo en este período.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-surface-500">
                  <th className="text-left font-semibold px-2 py-2">Estado</th>
                  <th className="text-left font-semibold px-2 py-2">Pedido</th>
                  <th className="text-left font-semibold px-2 py-2">Fecha</th>
                  <th className="text-right font-semibold px-2 py-2">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {portalRows.items.map((o) => (
                  <tr key={`${o.bucket}:${o.id}`}>
                    <td className="px-2 py-2 text-xs text-surface-300">{BUCKET_LABEL[o.bucket]}</td>
                    <td className="px-2 py-2 text-surface-400 font-mono text-xs">#{o.id}</td>
                    <td className="px-2 py-2 text-surface-400 whitespace-nowrap">
                      {o.createdAt ? new Date(o.createdAt).toLocaleString("es-AR") : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-surface-200">
                      {o.total != null ? formatUSD(o.total) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right"><VerMasButton onClick={() => void openPortal(o)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {portalRows.items.length === 0 && (
              <p className="text-center text-xs text-surface-500 py-6">No hay pedidos de Polytech en este período.</p>
            )}
          </div>
        )}
      </AccountHistoryChrome>
      {openDraft && (
        <AccountRowDetail
          open
          title="Pedido Polytech"
          lines={draftLines(openDraft)}
          items={draftItems(openDraft)}
          totals={draftTotals(openDraft)}
          onClose={() => setOpenDraft(null)}
        />
      )}
      {openOrder && (
        <AccountRowDetail
          open
          title={`Pedido #${openOrder.id}`}
          lines={[
            { label: "Estado", value: BUCKET_LABEL[openOrder.bucket] },
            { label: "Fecha", value: openOrder.createdAt ? new Date(openOrder.createdAt).toLocaleString("es-AR") : "—" },
          ]}
          items={detailItems ?? []}
          totals={openOrder.total != null ? [{ label: "Total", value: formatUSD(openOrder.total) }] : []}
          note={detailError ?? (detailItems == null ? "Cargando detalle…" : undefined)}
          onClose={() => setOpenOrder(null)}
        />
      )}
    </>
  );
}
