"use client";

import { useEffect, useState } from "react";
import {
  elitAccountApi,
  elitCheckoutApi,
  NodoProviderDraft,
  ElitSaleNote,
  ElitMovement,
  ElitPayment,
} from "@/lib/api";
import { loadAccountCached, clearAccountCache } from "@/lib/account-portal-cache";
import NodoSpinner from "@/components/NodoSpinner";
import { Wallet, XCircle } from "lucide-react";
import Link from "next/link";
import AccountRowDetail, { VerMasButton, type AccountDetailDoc } from "@/components/account/AccountRowDetail";
import { draftItems, draftLines, draftTotals } from "@/components/account/draftDetail";
import {
  elitSaleNoteDocs,
  elitSaleNoteHeaderLines,
  elitSaleNoteItems,
  elitSaleNoteTotals,
} from "@/components/account/elitOrderDetail";
import ElitPaymentModal from "@/components/account/ElitPaymentModal";
import { CheckoutGhostButton } from "@/components/checkout/CheckoutForm";
import AccountHistoryChrome from "@/components/account/AccountHistoryChrome";
import {
  useAccountHistoryState,
  useClampPage,
  usePagedMonthRows,
} from "@/components/account/useAccountHistory";
import { formatAccountSum, parseAccountAmount, sumAccountAmounts } from "@/lib/account-history";

type ElitAccount = Awaited<ReturnType<typeof elitAccountApi.account>>["data"];
type Detail =
  | { kind: "order"; row: ElitSaleNote }
  | { kind: "movement"; row: ElitMovement }
  | { kind: "draft"; row: NodoProviderDraft }
  | { kind: "payment"; row: ElitPayment };

type SectionId = "cta" | "payments" | "nodo" | "orders";

type CachedPayload = { account: ElitAccount; drafts: NodoProviderDraft[] };

const SECTIONS = [
  { id: "cta", label: "Cuenta corriente" },
  { id: "payments", label: "Informes de pago" },
  { id: "nodo", label: "Desde Nodo" },
  { id: "orders", label: "Notas de venta" },
] as const;

export default function ElitAccountPanel() {
  const history = useAccountHistoryState("cta");
  const [account, setAccount] = useState<ElitAccount | null>(null);
  const [drafts, setDrafts] = useState<NodoProviderDraft[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailNote, setDetailNote] = useState<ElitSaleNote | null>(null);

  useEffect(() => {
    void load(false);
  }, []);

  async function load(refresh: boolean) {
    setLoading(true);
    setError(null);
    try {
      if (refresh) clearAccountCache("ELIT:");
      const { data, fromCache: hit } = await loadAccountCached<CachedPayload>(
        "ELIT:account",
        async () => {
          const [accountRes, draftsRes] = await Promise.all([
            elitAccountApi.account({ refresh }),
            elitCheckoutApi.drafts().catch(() => ({ data: [] as NodoProviderDraft[] })),
          ]);
          return {
            account: accountRes.data,
            drafts: draftsRes.data ?? accountRes.data.drafts ?? [],
          };
        },
        { refresh }
      );
      setAccount(data.account);
      setDrafts(data.drafts);
      setFromCache(hit);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo traer Pedidos/Cta. Cte. de Elit. ¿Están el nº de cliente y la contraseña del portal?");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (detail?.kind !== "order") {
      setDetailNote(null);
      return;
    }
    const number = detail.row.orderNumber;
    if (!number || (detail.row.items && detail.row.items.length > 0)) {
      setDetailNote(detail.row);
      return;
    }
    void elitAccountApi.saleNote(number).then((res) => setDetailNote(res.data)).catch(() => setDetailNote(detail.row));
  }, [detail]);

  const section = history.section as SectionId;
  const rowsForSection =
    section === "cta"
      ? (account ? account.movements ?? [] : null)
      : section === "payments"
        ? (account ? account.payments ?? [] : null)
        : section === "nodo"
          ? drafts
          : (account ? account.orders ?? [] : null);

  const getDate =
    section === "cta"
      ? (m: ElitMovement) => m.date
      : section === "payments"
        ? (p: ElitPayment) => p.date
        : section === "nodo"
          ? (d: NodoProviderDraft) => d.createdAt
          : (o: ElitSaleNote) => o.date;

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
      const moves = rows as ElitMovement[];
      const debit = sumAccountAmounts(moves.map((m) => m.debit));
      const credit = sumAccountAmounts(moves.map((m) => m.credit));
      if (debit == null && credit == null) return null;
      const net = (debit ?? 0) - (credit ?? 0);
      return `Débito ${formatAccountSum(debit ?? 0, "USD")} · Crédito ${formatAccountSum(credit ?? 0, "USD")} · Neto ${formatAccountSum(net, "USD")}`;
    }
    if (section === "payments") {
      const s = sumAccountAmounts((rows as ElitPayment[]).map((p) => p.total));
      return s != null ? formatAccountSum(s, "USD") : null;
    }
    if (section === "nodo") {
      const s = sumAccountAmounts((rows as NodoProviderDraft[]).map((d) => d.total));
      return s != null ? formatAccountSum(s) : null;
    }
    const orders = rows as ElitSaleNote[];
    const byCur = new Map<string, number>();
    for (const o of orders) {
      const n = parseAccountAmount(o.amount);
      if (n == null) continue;
      const cur = o.currency === "ARS" ? "ARS" : "USD";
      byCur.set(cur, (byCur.get(cur) ?? 0) + n);
    }
    if (byCur.size === 0) return null;
    return [...byCur.entries()].map(([cur, n]) => formatAccountSum(n, cur)).join(" · ");
  })();

  const openOrder = detail?.kind === "order" ? (detailNote ?? detail.row) : null;
  const ready = account != null && drafts != null;

  return (
    <>
      {account?.profile?.name && (
        <p className="text-xs text-surface-400 mb-3 max-w-3xl">
          {account.profile.name}
          {account.profile.id ? ` · cliente ${account.profile.id}` : ""}
          {account.profile.exchange != null ? ` · USD ${account.profile.exchange}` : ""}
        </p>
      )}

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
        onRefresh={() => void load(true)}
        refreshing={loading}
        fromCache={fromCache}
        amountTotal={amountTotal}
        hint="Pedidos y comprobantes de elit.com.ar. Informes de pago: Adjuntar abre el formulario de Elit (banco, tipo, fecha, importe y un archivo)."
        header={
          section === "cta" && account?.balance != null ? (
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-sky-400" />
              <div>
                <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Saldo</span>
                <p className={`text-xl font-bold tabular-nums ${account.balance < 0 ? "text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                  {account.balance.toLocaleString("es-AR", { style: "currency", currency: "USD" })}
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
              <Link href="/proveedores/ELIT?tab=credentials" className="underline text-red-300 hover:text-white">
                Cargar cuenta
              </Link>
            </span>
            <button type="button" onClick={() => void load(true)} className="underline flex-shrink-0">Reintentar</button>
          </div>
        ) : section === "cta" ? (
          <MovementsTable
            rows={paged.items as ElitMovement[]}
            onOpen={(m) => setDetail({ kind: "movement", row: m })}
          />
        ) : section === "payments" ? (
          <ElitPaymentSection
            payments={paged.items as ElitPayment[]}
            canCreate={account?.canCreateReport}
            onOpen={(p) => setDetail({ kind: "payment", row: p })}
            onDone={() => void load(true)}
          />
        ) : section === "nodo" ? (
          <DraftsTable
            drafts={paged.items as NodoProviderDraft[]}
            onOpen={(d) => setDetail({ kind: "draft", row: d })}
          />
        ) : (
          <OrdersTable
            rows={paged.items as ElitSaleNote[]}
            onOpen={(o) => setDetail({ kind: "order", row: o })}
          />
        )}
      </AccountHistoryChrome>

      {detail?.kind === "order" && openOrder && (
        <AccountRowDetail
          open
          title={`Nota de venta ${openOrder.orderNumber}`}
          lines={elitSaleNoteHeaderLines(openOrder)}
          items={elitSaleNoteItems(openOrder)}
          totals={elitSaleNoteTotals(openOrder)}
          documents={elitSaleNoteDocs(openOrder)}
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.kind === "movement" && (
        <AccountRowDetail
          open
          title={`${detail.row.form} ${detail.row.number}`.trim()}
          lines={[
            { label: "Tipo", value: detail.row.form },
            { label: "Número", value: detail.row.number },
            { label: "Fecha", value: detail.row.date },
            { label: "Débito", value: fmt(detail.row.debit, detail.row.currency) },
            { label: "Crédito", value: fmt(detail.row.credit, detail.row.currency) },
            { label: "Saldo", value: fmt(detail.row.balanceUsd ?? detail.row.balance, detail.row.currency) },
          ]}
          documents={elitMovementDocs(detail.row)}
          note={/saldo/i.test(detail.row.form) ? "El saldo no es un comprobante descargable." : undefined}
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.kind === "draft" && (
        <AccountRowDetail
          open
          title="Pedido desde Nodo"
          lines={draftLines(detail.row)}
          items={draftItems(detail.row)}
          totals={draftTotals(detail.row)}
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.kind === "payment" && (
        <AccountRowDetail
          open
          title={`Informe ${detail.row.id}`}
          lines={[
            { label: "Id", value: detail.row.id },
            { label: "Fecha", value: detail.row.date },
            { label: "Estado", value: detail.row.status },
            { label: "Total", value: detail.row.total != null ? String(detail.row.total) : "" },
            { label: "Aprobado", value: detail.row.totalApproved != null ? String(detail.row.totalApproved) : "" },
          ]}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

function elitMovementDocs(m: ElitMovement): AccountDetailDoc[] {
  if (!m.number || /saldo/i.test(m.form)) return [];
  return [{
    label: `Descargar ${m.form}`,
    href: `/providers/ELIT/documents?form=${encodeURIComponent(m.form)}&number=${encodeURIComponent(m.number)}`,
    filename: `${m.form}-${m.number}.pdf`,
  }];
}

function fmt(n: number | null | undefined, currency?: string) {
  if (n == null) return "—";
  const code = currency === "ARS" ? "ARS" : "USD";
  return n.toLocaleString("es-AR", { style: "currency", currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusClass(status: string) {
  if (/cerrad|entreg|factur|complet|aprob/i.test(status)) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (/cancel|anul|vencid/i.test(status)) return "bg-red-500/10 text-red-400";
  return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
}

function MovementsTable({
  rows,
  onOpen,
}: {
  rows: ElitMovement[];
  onOpen: (m: ElitMovement) => void;
}) {
  return (
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
            <th className="text-right font-semibold px-2 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {rows.map((m, i) => (
            <tr key={`${m.number}-${i}`}>
              <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{m.date || "—"}</td>
              <td className="px-2 py-2 text-surface-200">{m.form || "—"}</td>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">{m.number || "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">{fmt(m.debit, m.currency)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">{fmt(m.credit, m.currency)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">{fmt(m.balanceUsd ?? m.balance, m.currency)}</td>
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
  rows: ElitSaleNote[];
  onOpen: (o: ElitSaleNote) => void;
}) {
  return (
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
            <th className="text-right font-semibold px-2 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {rows.map((o, i) => (
            <tr key={`${o.orderNumber}-${i}`}>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">{o.orderNumber || "—"}</td>
              <td className={`px-2 py-2 font-mono text-xs ${o.invoiceNumber?.trim() ? "text-surface-400" : "text-amber-400"}`}>
                {o.invoiceNumber?.trim() || "Pendiente"}
              </td>
              <td className="px-2 py-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusClass(o.status)}`}>{o.status || "—"}</span>
              </td>
              <td className="px-2 py-2 text-surface-400">{o.warehouseName || "—"}</td>
              <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{o.date || "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">{fmt(o.amount, o.currency)}</td>
              <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(o)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">Sin notas de venta en este período.</p>
      )}
    </div>
  );
}

function DraftsTable({ drafts, onOpen }: { drafts: NodoProviderDraft[]; onOpen: (d: NodoProviderDraft) => void }) {
  return (
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

function ElitPaymentSection({
  payments,
  canCreate,
  onOpen,
  onDone,
}: {
  payments: ElitPayment[];
  canCreate?: boolean;
  onOpen: (p: ElitPayment) => void;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-surface-500">
        Adjuntar abre el informe de Elit (no es por pedido): banco, tipo, fecha, importe y un archivo. Enviar crea la operación, adjunta el comprobante y cierra el informe.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-surface-500">
              <th className="text-left font-semibold px-2 py-2">Id</th>
              <th className="text-left font-semibold px-2 py-2">Fecha</th>
              <th className="text-left font-semibold px-2 py-2">Estado</th>
              <th className="text-right font-semibold px-2 py-2">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-800">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-2 py-2 font-mono text-xs text-surface-400">{p.id}</td>
                <td className="px-2 py-2 text-surface-400">{p.date || "—"}</td>
                <td className="px-2 py-2 text-surface-200">{p.status || "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{p.total ?? "—"}</td>
                <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(p)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && <p className="text-center text-xs text-surface-500 py-4">Sin informes en este período.</p>}
      </div>
      {canCreate !== false ? (
        <CheckoutGhostButton type="button" onClick={() => setOpen(true)}>Adjuntar comprobante</CheckoutGhostButton>
      ) : (
        <p className="text-xs text-amber-200/90">
          Elit no deja crear otro informe ahora: suele haber uno abierto. Cuando se acredite o se cierre, aparece Adjuntar.
        </p>
      )}
      {open && (
        <ElitPaymentModal
          onClose={() => setOpen(false)}
          onSent={() => { void onDone(); }}
        />
      )}
    </div>
  );
}
