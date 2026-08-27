"use client";

import { useEffect, useState } from "react";
import {
  invidAccountApi,
  invidCheckoutApi,
  InvidOrder,
  InvidAccountMovement,
  InvidNodoDraft,
  InvidFileForm,
  uploadAuthedFile,
} from "@/lib/api";
import { loadAccountCached, clearAccountCache } from "@/lib/account-portal-cache";
import NodoSpinner from "@/components/NodoSpinner";
import { Wallet, XCircle } from "lucide-react";
import Link from "next/link";
import AccountRowDetail, { VerMasButton } from "@/components/account/AccountRowDetail";
import { draftItems, draftLines } from "@/components/account/draftDetail";
import { invidOrderAmountLines, invidOrderHeaderLines, invidOrderItems } from "@/components/account/invidOrderDetail";
import AccountHistoryChrome from "@/components/account/AccountHistoryChrome";
import {
  useAccountHistoryState,
  useClampPage,
  usePagedMonthRows,
} from "@/components/account/useAccountHistory";
import { formatAccountSum, parseAccountAmount, sumAccountAmounts } from "@/lib/account-history";
import { usePrefs } from "@/lib/prefs";

type Detail =
  | { kind: "order"; row: InvidOrder }
  | { kind: "movement"; row: InvidAccountMovement }
  | { kind: "draft"; row: InvidNodoDraft };

type SectionId = "cta" | "orders" | "nodo";

type CtaPayload = { balance: number | null; movements: InvidAccountMovement[] };
type OrdersPayload = {
  orders: InvidOrder[];
  currentExchangeRate?: number;
  paymentUploads: InvidFileForm[];
  note: string | null;
};
type NodoPayload = { drafts: InvidNodoDraft[] };

const SECTIONS = [
  { id: "cta", label: "Cuenta corriente" },
  { id: "orders", label: "Mis pedidos" },
  { id: "nodo", label: "Desde Nodo" },
] as const;

const CACHE = {
  cta: "INVID:cta",
  orders: "INVID:orders:v2",
  nodo: "INVID:nodo",
} as const;

export default function InvidAccountPanel() {
  const history = useAccountHistoryState("cta");
  const prefs = usePrefs();
  const [balance, setBalance] = useState<number | null>(null);
  const [movements, setMovements] = useState<InvidAccountMovement[] | null>(null);
  const [orders, setOrders] = useState<InvidOrder[] | null>(null);
  const [currentExchangeRate, setCurrentExchangeRate] = useState<number | undefined>(undefined);
  const [paymentUploads, setPaymentUploads] = useState<InvidFileForm[]>([]);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<InvidNodoDraft[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const section = history.section as SectionId;

  useEffect(() => {
    void loadSection(section, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar sección
  }, [section]);

  async function loadSection(id: SectionId, refresh: boolean) {
    setLoading(true);
    setError(null);
    try {
      if (refresh) clearAccountCache("INVID:");

      if (id === "cta") {
        const { data, fromCache: hit } = await loadAccountCached<CtaPayload>(
          CACHE.cta,
          async () => {
            const res = await invidAccountApi.accountStatement({ refresh });
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
            const res = await invidAccountApi.orders({ refresh });
            return {
              orders: res.data.orders ?? [],
              currentExchangeRate: res.data.currentExchangeRate,
              paymentUploads: res.data.paymentUploads ?? [],
              note: res.data.note ?? null,
            };
          },
          { refresh }
        );
        setOrders(data.orders);
        setCurrentExchangeRate(data.currentExchangeRate);
        setPaymentUploads(data.paymentUploads);
        setUploadNote(data.note);
        setFromCache(hit);
      } else {
        const { data, fromCache: hit } = await loadAccountCached<NodoPayload>(
          CACHE.nodo,
          async () => {
            const res = await invidCheckoutApi.drafts().catch(() => ({
              data: [] as InvidNodoDraft[],
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
      setError(msg || "No se pudo traer Pedidos/Cuenta Corriente de Invid");
    } finally {
      setLoading(false);
    }
  }

  const rowsForSection =
    section === "cta" ? movements : section === "orders" ? orders : drafts;

  const getDate =
    section === "cta"
      ? (m: InvidAccountMovement) => m.date
      : section === "nodo"
        ? (d: InvidNodoDraft) => d.createdAt
        : (o: InvidOrder) => o.date;

  const paged = usePagedMonthRows(
    rowsForSection as never[],
    getDate as never,
    history.month,
    history.page
  );
  useClampPage(history.page, paged.pages, history.setPage);

  const amountTotal = (() => {
    const rows = paged.filtered as unknown[];
    if (!rows.length) return null;
    if (section === "cta") {
      const filtered = rows as InvidAccountMovement[];
      const byCurrency = new Map<string, number>();
      for (const m of filtered) {
        const n = parseAccountAmount(m.total);
        if (n == null) continue;
        const cur = (m.currency || "ARS").toUpperCase().includes("USD") ? "USD" : "ARS";
        byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + n);
      }
      if (byCurrency.size === 0) return null;
      return [...byCurrency.entries()]
        .map(([cur, n]) => formatAccountSum(n, cur))
        .join(" · ");
    }
    if (section === "nodo") {
      const s = sumAccountAmounts((rows as InvidNodoDraft[]).map((d) => d.total));
      return s != null ? formatAccountSum(s) : null;
    }
    const s = sumAccountAmounts((rows as InvidOrder[]).map((o) => o.amount));
    return s != null ? formatAccountSum(s) : null;
  })();

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
        amountTotal={amountTotal}
        hint="Datos reales de tu cuenta en invidcomputers.com. Ver más muestra productos, impuestos, tipo de cambio y el total en pesos. Mes actual por defecto, de a 25. Actualizar vuelve a consultar el portal."
        header={
          section === "cta" && balance != null ? (
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-sky-400" />
              <div>
                <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Saldo</span>
                <p className={`text-xl font-bold tabular-nums ${balance < 0 ? "text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                  {balance.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
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
              <Link href="/proveedores/INVID?tab=credentials" className="underline text-red-300 hover:text-white">
                Cargar cuenta
              </Link>
            </span>
            <button type="button" onClick={() => void loadSection(section, true)} className="underline flex-shrink-0">
              Reintentar
            </button>
          </div>
        ) : section === "cta" ? (
          <MovementsTable
            rows={paged.items as InvidAccountMovement[]}
            onOpen={(m) => setDetail({ kind: "movement", row: m })}
          />
        ) : section === "nodo" ? (
          <DraftsTable
            drafts={paged.items as InvidNodoDraft[]}
            onOpen={(d) => setDetail({ kind: "draft", row: d })}
          />
        ) : (
          <OrdersTable
            rows={paged.items as InvidOrder[]}
            onOpen={(o) => setDetail({ kind: "order", row: o })}
          />
        )}
      </AccountHistoryChrome>

      {detail?.kind === "order" && (
        <InvidOrderDetail
          row={detail.row}
          currentExchangeRate={currentExchangeRate}
          fallbackNodoRate={
            prefs.currentRate?.venta
              ? { rate: prefs.currentRate.venta, label: `Cotización ${prefs.dollarLabel(prefs.dollarType)} (Nodo)` }
              : undefined
          }
          paymentUploads={paymentUploads}
          uploadNote={uploadNote}
          uploading={uploading}
          uploadError={uploadError}
          onFile={(file) => {
            setUploading(true);
            setUploadError(null);
            void uploadAuthedFile("/providers/INVID/payments/attach", file)
              .then(() => { setUploadError(null); })
              .catch((e: unknown) => setUploadError(e instanceof Error ? e.message : "No se pudo subir"))
              .finally(() => setUploading(false));
          }}
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.kind === "movement" && (
        <AccountRowDetail
          open
          title={`${detail.row.docType} ${detail.row.docNumber}`.trim()}
          lines={[
            { label: "Fecha", value: detail.row.date },
            { label: "Tipo", value: detail.row.docType },
            { label: "Número", value: detail.row.docNumber },
            { label: "Interno", value: detail.row.internalNumber },
            { label: "Moneda", value: detail.row.currency },
            { label: "Total", value: detail.row.total },
          ]}
          documents={(detail.row.hrefs ?? []).map((href, i) => ({
            label: "Descargar",
            href: `/providers/INVID/documents?href=${encodeURIComponent(href)}`,
            filename: `invid-${detail.row.docNumber || i}.pdf`,
          }))}
          note={(detail.row.hrefs ?? []).length === 0 ? "Este movimiento no trae un link de PDF en el HTML de Invid." : undefined}
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.kind === "draft" && (
        <AccountRowDetail
          open
          title="Borrador desde Nodo"
          lines={draftLines(detail.row)}
          items={draftItems(detail.row)}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

function InvidOrderDetail({
  row,
  currentExchangeRate,
  fallbackNodoRate,
  paymentUploads,
  uploadNote,
  uploading,
  uploadError,
  onFile,
  onClose,
}: {
  row: InvidOrder;
  currentExchangeRate?: number;
  fallbackNodoRate?: { rate: number; label: string };
  paymentUploads: InvidFileForm[];
  uploadNote: string | null;
  uploading: boolean;
  uploadError: string | null;
  onFile: (file: File) => void;
  onClose: () => void;
}) {
  const fallback = row.exchangeRate
    ? undefined
    : currentExchangeRate
      ? { rate: currentExchangeRate, label: "TC actual Invid" }
      : fallbackNodoRate;
  const amounts = invidOrderAmountLines(row, fallback);
  return (
    <AccountRowDetail
      open
      title={`Pedido ${row.orderNumber}`}
      lines={invidOrderHeaderLines(row)}
      items={invidOrderItems(row)}
      totals={amounts.lines}
      documents={[
        ...(row.invoiceHrefs ?? []).map((href, i) => ({
          label: "Descargar factura",
          href: `/providers/INVID/documents?href=${encodeURIComponent(href)}`,
          filename: `invid-factura-${row.orderNumber || i}.pdf`,
        })),
        ...(row.links ?? [])
          .filter((l) => !/ultima\.php/i.test(l.href))
          .map((l) => ({
            label: l.label || "Descargar",
            href: `/providers/INVID/documents?href=${encodeURIComponent(l.href)}`,
            filename: l.label || "invid-doc",
          })),
      ]}
      note={[
        ...amounts.notes,
        paymentUploads.length === 0
          ? (uploadNote || "Si Invid no muestra un formulario de comprobante en esta sesión, el alta se hace desde su portal.")
          : "",
      ].filter(Boolean).join(" ")}
      upload={
        paymentUploads.length > 0
          ? {
              label: "Subir comprobante de pago",
              loading: uploading,
              error: uploadError,
              onFile,
            }
          : undefined
      }
      onClose={onClose}
    />
  );
}

function MovementsTable({
  rows,
  onOpen,
}: {
  rows: InvidAccountMovement[];
  onOpen: (m: InvidAccountMovement) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-surface-500">
            <th className="text-left font-semibold px-2 py-2">Fecha</th>
            <th className="text-left font-semibold px-2 py-2">Tipo</th>
            <th className="text-left font-semibold px-2 py-2">Número</th>
            <th className="text-right font-semibold px-2 py-2">Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {rows.map((m, i) => (
            <tr key={i}>
              <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{m.date || "—"}</td>
              <td className="px-2 py-2 text-surface-200">{m.docType || "—"}</td>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">{m.docNumber || "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">
                {m.currency} {m.total}
              </td>
              <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(m)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">Sin movimientos en este período.</p>
      )}
    </div>
  );
}

function OrdersTable({
  rows,
  onOpen,
}: {
  rows: InvidOrder[];
  onOpen: (o: InvidOrder) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-surface-500">
            <th className="text-left font-semibold px-2 py-2">N° Orden</th>
            <th className="text-left font-semibold px-2 py-2">N° Pedido Web</th>
            <th className="text-left font-semibold px-2 py-2">Estado</th>
            <th className="text-left font-semibold px-2 py-2">Fecha</th>
            <th className="text-right font-semibold px-2 py-2">Importe</th>
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {rows.map((o, i) => (
            <tr key={i}>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">{o.orderNumber || "—"}</td>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">{o.webOrderNumber || "—"}</td>
              <td className="px-2 py-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  o.status === "Cerrado"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : o.status === "Vencido" || o.status === "Cancelado"
                      ? "bg-red-500/10 text-red-400"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                }`}>{o.status || "—"}</span>
              </td>
              <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{o.date || "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">{o.amount || "—"}</td>
              <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(o)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">Sin pedidos en este período.</p>
      )}
    </div>
  );
}

function DraftsTable({ drafts, onOpen }: { drafts: InvidNodoDraft[]; onOpen: (d: InvidNodoDraft) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-surface-500">
            <th className="text-left font-semibold px-2 py-2">Estado</th>
            <th className="text-left font-semibold px-2 py-2">Pedido web</th>
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
                  d.status === "CREATED" ? "bg-amber-500/10 text-amber-400"
                    : d.status === "PENDING" ? "bg-sky-500/10 text-sky-400"
                    : "bg-red-500/10 text-red-400"
                }`}>
                  {d.status === "CREATED" ? "Pendiente" : d.status === "PENDING" ? "Procesando" : d.status}
                </span>
              </td>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">{d.invidWebOrderNumber ?? "—"}</td>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">{d.invidOrderNumber ?? "—"}</td>
              <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{new Date(d.createdAt).toLocaleString("es-AR")}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">{d.total ?? "—"}</td>
              <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(d)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {drafts.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">Todavía no creaste borradores desde Nodo en este período.</p>
      )}
    </div>
  );
}
