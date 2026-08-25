"use client";

import { useEffect, useState } from "react";
import {
  newBytesAccountApi,
  newBytesCheckoutApi,
  NewBytesComprobante,
  NewBytesNodoDraft,
  NewBytesOrder,
} from "@/lib/api";
import { loadAccountCached, clearAccountCache } from "@/lib/account-portal-cache";
import NodoSpinner from "@/components/NodoSpinner";
import { Wallet, XCircle } from "lucide-react";
import Link from "next/link";
import AccountRowDetail, { VerMasButton, type AccountDetailDoc } from "@/components/account/AccountRowDetail";
import { draftItems, draftLines } from "@/components/account/draftDetail";
import AccountHistoryChrome from "@/components/account/AccountHistoryChrome";
import {
  useAccountHistoryState,
  useClampPage,
  usePagedMonthRows,
} from "@/components/account/useAccountHistory";

type Detail =
  | { kind: "movement"; row: NewBytesComprobante }
  | { kind: "order"; row: NewBytesOrder; title: string }
  | { kind: "draft"; row: NewBytesNodoDraft };

type SectionId = "cta" | "orders" | "purchase" | "nodo";

type CtaPayload = { balance: number | null; movements: NewBytesComprobante[] };
type OrdersPayload = { orders: NewBytesOrder[] };
type PurchasePayload = { orders: NewBytesOrder[] };
type NodoPayload = { drafts: NewBytesNodoDraft[] };

const SECTIONS = [
  { id: "cta", label: "Cuenta corriente" },
  { id: "orders", label: "Mis pedidos" },
  { id: "purchase", label: "Órdenes de compra" },
  { id: "nodo", label: "Desde Nodo" },
] as const;

const CACHE = {
  cta: "NEW_BYTES:cta",
  orders: "NEW_BYTES:orders",
  purchase: "NEW_BYTES:purchase",
  nodo: "NEW_BYTES:nodo",
} as const;

export default function NewBytesAccountPanel() {
  const history = useAccountHistoryState("cta");
  const [balance, setBalance] = useState<number | null>(null);
  const [movements, setMovements] = useState<NewBytesComprobante[] | null>(null);
  const [orders, setOrders] = useState<NewBytesOrder[] | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<NewBytesOrder[] | null>(null);
  const [drafts, setDrafts] = useState<NewBytesNodoDraft[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);

  const section = history.section as SectionId;

  useEffect(() => {
    void loadSection(section, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar sección
  }, [section]);

  async function loadSection(id: SectionId, refresh: boolean) {
    setLoading(true);
    setError(null);
    try {
      if (refresh) clearAccountCache("NEW_BYTES:");

      if (id === "cta") {
        const { data, fromCache: hit } = await loadAccountCached<CtaPayload>(
          CACHE.cta,
          async () => {
            const res = await newBytesAccountApi.accountStatement({ refresh });
            return { balance: res.data.balance, movements: res.data.movements ?? [] };
          },
          { refresh }
        );
        setBalance(data.balance);
        setMovements(data.movements);
        setFromCache(hit);
      } else if (id === "orders") {
        const { data, fromCache: hit } = await loadAccountCached<OrdersPayload>(
          CACHE.orders,
          async () => {
            const res = await newBytesAccountApi.orders({ refresh });
            return { orders: res.data.orders ?? [] };
          },
          { refresh }
        );
        setOrders(data.orders);
        setFromCache(hit);
      } else if (id === "purchase") {
        const { data, fromCache: hit } = await loadAccountCached<PurchasePayload>(
          CACHE.purchase,
          async () => {
            const res = await newBytesAccountApi.purchaseOrders({ refresh }).catch(() => ({
              data: { orders: [] as NewBytesOrder[] },
            }));
            return { orders: res.data.orders ?? [] };
          },
          { refresh }
        );
        setPurchaseOrders(data.orders);
        setFromCache(hit);
      } else {
        const { data, fromCache: hit } = await loadAccountCached<NodoPayload>(
          CACHE.nodo,
          async () => {
            const res = await newBytesCheckoutApi.drafts().catch(() => ({
              data: [] as NewBytesNodoDraft[],
            }));
            return { drafts: res.data ?? [] };
          },
          { refresh }
        );
        setDrafts(data.drafts);
        setFromCache(hit);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo traer Pedidos/Comprobantes de NewBytes. ¿Están user y password del portal?");
    } finally {
      setLoading(false);
    }
  }

  const rowsForSection =
    section === "cta"
      ? movements
      : section === "orders"
        ? orders
        : section === "purchase"
          ? purchaseOrders
          : drafts;

  const getDate =
    section === "cta"
      ? (m: NewBytesComprobante) => m.invoiceDate
      : section === "nodo"
        ? (d: NewBytesNodoDraft) => d.createdAt
        : (o: NewBytesOrder) => o.date;

  const paged = usePagedMonthRows(
    rowsForSection as never[],
    getDate as never,
    history.month,
    history.page
  );
  useClampPage(history.page, paged.pages, history.setPage);

  const ready = rowsForSection != null;

  return (
    <>
      <AccountHistoryChrome
        sections={[...SECTIONS]}
        section={section}
        onSection={(id) => history.setSection(id)}
        month={history.month}
        onMonth={history.setMonth}
        page={paged.page}
        pages={paged.pages}
        total={paged.total}
        onPage={history.setPage}
        onRefresh={() => void loadSection(section, true)}
        refreshing={loading}
        fromCache={fromCache}
        hint="Pedidos, comprobantes y órdenes de compra de tu cuenta en nb.com.ar. Mes actual por defecto, de a 25. Actualizar vuelve a consultar el portal."
        header={
          section === "cta" && balance != null ? (
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-sky-400" />
              <div>
                <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Saldo</span>
                <p className={`text-xl font-bold tabular-nums ${balance < 0 ? "text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                  {balance.toLocaleString("es-AR", { style: "currency", currency: "USD" })}
                </p>
              </div>
            </div>
          ) : undefined
        }
      >
        {loading && !ready ? (
          <div className="flex justify-center py-10"><NodoSpinner className="w-6 h-6" /></div>
        ) : error ? (
          <div className="flex items-start gap-2 text-xs rounded-lg px-3.5 py-2.5 bg-red-500/8 border border-red-500/20 text-red-400">
            <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="flex-1">
              {error}{" "}
              <Link href="/proveedores/NEW_BYTES?tab=credentials" className="underline text-red-300 hover:text-white">
                Cargar cuenta
              </Link>
            </span>
            <button type="button" onClick={() => void loadSection(section, true)} className="underline flex-shrink-0">
              Reintentar
            </button>
          </div>
        ) : section === "cta" ? (
          <MovementsTable
            rows={paged.items as NewBytesComprobante[]}
            onOpen={(m) => setDetail({ kind: "movement", row: m })}
          />
        ) : section === "nodo" ? (
          <DraftsTable
            drafts={paged.items as NewBytesNodoDraft[]}
            onOpen={(d) => setDetail({ kind: "draft", row: d })}
          />
        ) : section === "orders" ? (
          <OrdersTable
            rows={paged.items as NewBytesOrder[]}
            numberKey="albNumber"
            onOpen={(o) => setDetail({ kind: "order", row: o, title: "Pedido" })}
          />
        ) : (
          <OrdersTable
            rows={paged.items as NewBytesOrder[]}
            numberKey="orderNumber"
            onOpen={(o) => setDetail({ kind: "order", row: o, title: "Orden de compra" })}
          />
        )}
      </AccountHistoryChrome>

      {detail?.kind === "movement" && (
        <AccountRowDetail
          open
          title={`${detail.row.invoiceType ?? "Comprobante"} ${detail.row.invoiceNumber ?? ""}`.trim()}
          lines={[
            { label: "Fecha", value: detail.row.invoiceDate || "" },
            { label: "Tipo", value: detail.row.invoiceType || "" },
            { label: "Número", value: detail.row.invoiceNumber || "" },
            { label: "Detalle", value: detail.row.invoiceLabel || "" },
            { label: "Sucursal", value: detail.row.branch != null ? String(detail.row.branch) : "" },
            { label: "Subtotal USD", value: detail.row.subtotalUsd != null ? String(detail.row.subtotalUsd) : "" },
            { label: "Total USD", value: detail.row.totalUsd != null ? String(detail.row.totalUsd) : "" },
            { label: "Percepciones", value: detail.row.perceptions != null ? String(detail.row.perceptions) : "" },
          ]}
          documents={nbVoucherDocs(detail.row)}
          note={!detail.row.voucherUrl ? "Este comprobante no trajo voucherUrl: no hay PDF para descargar." : undefined}
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.kind === "order" && (
        <AccountRowDetail
          open
          title={`${detail.title} ${detail.row.orderNumber || detail.row.albNumber || ""}`.trim()}
          lines={[
            { label: "N°", value: String(detail.row.orderNumber || detail.row.albNumber || "") },
            { label: "Pedido web", value: detail.row.webOrderNumber || "" },
            { label: "Sucursal", value: detail.row.branch != null ? String(detail.row.branch) : "" },
            { label: "Estado", value: detail.row.status || "" },
            { label: "Detalle estado", value: detail.row.statusDescription || "" },
            { label: "Fecha", value: detail.row.date || "" },
            { label: "Importe", value: detail.row.amount != null ? String(detail.row.amount) : "" },
            { label: "Cliente", value: detail.row.clientName || "" },
            { label: "Tracking", value: detail.row.trackingNumber || "" },
            { label: "Factura", value: detail.row.invoice || "" },
          ]}
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.kind === "draft" && (
        <AccountRowDetail
          open
          title="Pedido desde Nodo"
          lines={draftLines(detail.row)}
          items={draftItems(detail.row)}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

function nbVoucherDocs(m: NewBytesComprobante): AccountDetailDoc[] {
  if (!m.voucherUrl || m.voucherId == null) return [];
  return [{
    label: "Descargar comprobante",
    href: `/providers/NEW_BYTES/documents?voucherId=${encodeURIComponent(String(m.voucherId))}`,
    filename: `nb-${m.invoiceNumber || m.voucherId}.pdf`,
  }];
}

function MovementsTable({
  rows,
  onOpen,
}: {
  rows: NewBytesComprobante[];
  onOpen: (m: NewBytesComprobante) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-surface-500">
            <th className="text-left font-semibold px-2 py-2">Fecha</th>
            <th className="text-left font-semibold px-2 py-2">Tipo</th>
            <th className="text-left font-semibold px-2 py-2">Número</th>
            <th className="text-left font-semibold px-2 py-2">Detalle</th>
            <th className="text-right font-semibold px-2 py-2">Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {rows.map((m, i) => (
            <tr key={String(m.voucherId ?? i)}>
              <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{m.invoiceDate || "—"}</td>
              <td className="px-2 py-2 text-surface-200">
                {m.invoiceType}{m.branch != null ? `-${m.branch}` : ""}
              </td>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">{m.invoiceNumber || "—"}</td>
              <td className="px-2 py-2 text-surface-400">{m.invoiceLabel || "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">
                {m.totalUsd != null ? `USD ${m.totalUsd.toLocaleString("es-AR", { maximumFractionDigits: 2 })}` : "—"}
              </td>
              <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(m)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">Sin comprobantes en este período.</p>
      )}
    </div>
  );
}

function DraftsTable({ drafts, onOpen }: { drafts: NewBytesNodoDraft[]; onOpen: (d: NewBytesNodoDraft) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-surface-500">
            <th className="text-left font-semibold px-2 py-2">Estado</th>
            <th className="text-left font-semibold px-2 py-2">Orden</th>
            <th className="text-left font-semibold px-2 py-2">Fecha</th>
            <th className="text-right font-semibold px-2 py-2">Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {drafts.map((d) => (
            <tr key={d.id}>
              <td className="px-2 py-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  d.status === "CREATED" ? "bg-sky-500/10 text-sky-400"
                    : d.status === "PENDING" ? "bg-amber-500/10 text-amber-400"
                    : "bg-red-500/10 text-red-400"
                }`}>
                  {d.status === "CREATED" ? "Creado" : d.status === "PENDING" ? "Procesando" : d.status}
                </span>
              </td>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">{d.invidOrderNumber ?? d.invidWebOrderNumber ?? "—"}</td>
              <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{new Date(d.createdAt).toLocaleString("es-AR")}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">{d.total ?? "—"}</td>
              <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(d)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {drafts.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">Todavía no creaste pedidos desde Nodo en este período.</p>
      )}
    </div>
  );
}

function OrdersTable({
  rows,
  numberKey,
  onOpen,
}: {
  rows: NewBytesOrder[];
  numberKey: "albNumber" | "orderNumber";
  onOpen: (o: NewBytesOrder) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-surface-500">
            <th className="text-left font-semibold px-2 py-2">N°</th>
            <th className="text-left font-semibold px-2 py-2">Sucursal</th>
            <th className="text-left font-semibold px-2 py-2">Estado</th>
            <th className="text-left font-semibold px-2 py-2">Fecha</th>
            <th className="text-right font-semibold px-2 py-2">Importe</th>
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {rows.map((o, i) => (
            <tr key={i}>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">
                {o[numberKey] || o.orderNumber || o.webOrderNumber || "—"}
              </td>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">{o.branch ?? "—"}</td>
              <td className="px-2 py-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  /cerrad|entreg|factur|complet/i.test(o.status ?? "")
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : /cancel|anul|vencid/i.test(o.status ?? "")
                      ? "bg-red-500/10 text-red-400"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                }`}>{o.status || "—"}</span>
              </td>
              <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{o.date || "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">{o.amount ?? "—"}</td>
              <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(o)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">Sin registros en este período.</p>
      )}
    </div>
  );
}
