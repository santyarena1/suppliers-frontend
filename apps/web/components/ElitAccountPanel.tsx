"use client";

import { useEffect, useState } from "react";
import {
  elitAccountApi,
  elitCheckoutApi,
  NodoProviderDraft,
  ElitSaleNote,
  ElitMovement,
  ElitPayment,
  ElitUsdVoucher,
} from "@/lib/api";
import { loadAccountCached, clearAccountCache } from "@/lib/account-portal-cache";
import NodoSpinner from "@/components/NodoSpinner";
import { XCircle } from "lucide-react";
import Link from "next/link";
import AccountRowDetail, { VerMasButton, type AccountDetailDoc } from "@/components/account/AccountRowDetail";
import { draftItems, draftLines, draftTotals } from "@/components/account/draftDetail";
import {
  elitSaleNoteDocs,
  elitSaleNoteHeaderLines,
  elitSaleNoteItems,
  elitSaleNoteNetMismatch,
  elitSaleNoteNote,
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
import { formatAccountSum, parseAccountAmount, sumAccountAmounts, currentMonthKey, latestMonthKey, formatMonthLabel, filterByMonth } from "@/lib/account-history";

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
  const history = useAccountHistoryState("cta", "all");
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
    setDetailNote(detail.row);
    if (!number) return;
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

  const ctaLastMonth = section === "cta" ? latestMonthKey(account?.movements ?? [], (m) => m.date) : null;

  const paged = usePagedMonthRows(
    rowsForSection as never[],
    getDate as never,
    history.month,
    history.page,
    (section === "cta"
      ? { extraDates: (m: ElitMovement) => [m.dueDate] }
      : undefined) as never
  );
  useClampPage(history.page, paged.pages, history.setPage);

  const ctaBreakdown = (() => {
    if (section !== "cta") return undefined;
    const moves = paged.filtered as ElitMovement[];
    if (!moves.length) return undefined;
    const billed = sumAccountAmounts(moves.map((m) => m.debit));
    const paid = sumAccountAmounts(moves.map((m) => m.credit));
    if (billed == null && paid == null) return undefined;
    const billedN = billed ?? 0;
    const paidN = paid ?? 0;
    const diff = billedN - paidN;
    return [
      {
        label: "Facturado",
        hint: "Lo que Elit cargó a tu cuenta",
        value: formatAccountSum(billedN, "ARS"),
        tone: "debit" as const,
      },
      {
        label: "Pagos y recibos",
        hint: "Lo que se descontó: recibos y saldo a favor",
        value: formatAccountSum(paidN, "ARS"),
        tone: "credit" as const,
      },
      {
        label: "Diferencia",
        hint: "Facturado menos pagos, en este recorte",
        value: formatAccountSum(diff, "ARS"),
        tone: diff > 0 ? ("debit" as const) : diff < 0 ? ("credit" as const) : ("neutral" as const),
      },
    ];
  })();

  const amountTotal = (() => {
    const rows = paged.filtered as unknown[];
    if (!rows.length) return null;
    if (section === "cta") return null;
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
        <p className="text-xs text-surface-400 mb-3 max-w-6xl">
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
        onMonth={(m) => {
          if (section === "cta" && m === currentMonthKey()) {
            const rows = account?.movements ?? [];
            const hits = filterByMonth(rows, (r) => r.date, m, { extraDates: (r) => [r.dueDate] });
            if (hits.length === 0) {
              const last = latestMonthKey(rows, (r) => r.date) ?? latestMonthKey(rows, (r) => r.dueDate);
              history.setMonth(last ?? m);
              return;
            }
          }
          history.setMonth(m);
        }}
        page={paged.page}
        pages={paged.pages}
        total={paged.total}
        onPage={history.setPage}
        onRefresh={() => void load(true)}
        refreshing={loading}
        fromCache={fromCache}
        amountTotal={amountTotal}
        amountTotalLabel={section === "cta" ? "En este período" : "Total período"}
        amountBreakdown={ctaBreakdown}
        hint="Pedidos y comprobantes de elit.com.ar. Informes de pago: Adjuntar abre el formulario de Elit (banco, tipo, fecha, importe y un archivo)."
        wide={section === "cta"}
        header={section === "cta" ? <CtaOverview account={account} /> : undefined}
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
          <div className="flex flex-col gap-5">
            <UsdVouchersTable rows={account?.usdVouchers ?? []} />
            <MovementsTable
              rows={paged.items as ElitMovement[]}
              onOpen={(m) => setDetail({ kind: "movement", row: m })}
              emptyHint={
                history.month !== "all" && ctaLastMonth && ctaLastMonth !== history.month
                  ? `Sin movimientos en ${formatMonthLabel(history.month)}. El último está en ${formatMonthLabel(ctaLastMonth)}.`
                  : undefined
              }
            />
          </div>
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
          note={elitSaleNoteNote(openOrder)}
          showIvaColumn
          alert={(() => {
            const mismatch = elitSaleNoteNetMismatch(openOrder);
            if (!mismatch) return null;
            const cur = openOrder.currency === "ARS" ? "ARS" : "USD";
            return {
              title: "La suma de la columna Total no cierra con el total sin imp.",
              detail: `Líneas ${formatAccountSum(mismatch.lineSum, cur)} · Total sin imp. ${formatAccountSum(mismatch.expected, cur)}. Es solo un aviso: no se corrige nada.`,
            };
          })()}
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
            { label: "Vencimiento", value: detail.row.dueDate || "" },
            { label: "Remito", value: detail.row.remito || "" },
            { label: "Moneda", value: detail.row.currency || "" },
            { label: "Cotización", value: detail.row.exchangeRate != null ? detail.row.exchangeRate.toLocaleString("es-AR", { minimumFractionDigits: 2 }) : "" },
            { label: "Importe", value: fmt(detail.row.amount ?? detail.row.total, detail.row.currency) },
            { label: "Cargado a la cuenta", value: fmt(detail.row.debit, "ARS") },
            { label: "Pagado / descontado", value: fmt(detail.row.credit, "ARS") },
            { label: "Saldo", value: fmt(detail.row.balance, "ARS") },
            { label: "Estado", value: detail.row.status || "" },
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

function fmtDate(raw: string | undefined): string {
  if (!raw) return "—";
  const iso = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
}

function fmtStatus(raw: string | undefined): string {
  if (!raw || /^(true|false)$/i.test(raw)) return "—";
  return raw;
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

function moneyCell(n: number | null | undefined, currency: string, tone?: "debit" | "credit") {
  if (n == null || n === 0) return "—";
  const cls =
    tone === "debit" ? "text-red-400" : tone === "credit" ? "text-emerald-400" : "text-surface-200";
  return <span className={cls}>{fmt(n, currency)}</span>;
}

function CtaOverview({ account }: { account: ElitAccount | null }) {
  if (!account) return null;
  const s = account.summary;
  const cards = (
    [
      { label: "Cupo asignado", hint: "Tope que te dio Elit", value: s?.creditLimit },
      { label: "Cuenta corriente", hint: "Saldo actual en pesos", value: s?.currentAccount ?? account.balance },
      { label: "Cheques en cartera", hint: "Cheques todavía no cobrados", value: s?.checks },
      { label: "Pedidos pendientes", hint: "Pedidos abiertos, aún sin facturar", value: s?.pendingOrders },
      { label: "Disponible", hint: "Lo que te queda para comprar", value: s?.availableCredit },
    ] as const
  ).filter((c) => c.value != null);
  if (cards.length === 0 && !s?.status) return null;
  return (
    <div className="flex flex-col gap-3">
      {s?.status ? (
        <p className={`text-xs font-semibold ${s.approved ? "text-emerald-400" : "text-amber-300"}`}>
          {s.status}
        </p>
      ) : null}
      {cards.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {cards.map((c) => (
            <div
              key={c.label}
              className="min-w-[11rem] flex-1 max-w-[16rem] rounded-xl border border-surface-800 bg-surface-900/50 px-3 py-2.5"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 leading-tight">{c.label}</p>
              <p className="text-[11px] text-surface-500 mt-0.5 leading-snug">{c.hint}</p>
              <p className="text-sm font-bold tabular-nums text-white mt-1.5">{fmt(c.value, "ARS")}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function UsdVouchersTable({ rows }: { rows: ElitUsdVoucher[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-1">Comprobantes en dólares</p>
      <p className="text-[11px] text-surface-500 mb-2">Se cancelan a la cotización del día de pago.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-surface-500">
              <th className="text-left font-semibold px-2 py-2">Fecha</th>
              <th className="text-left font-semibold px-2 py-2">Vencimiento</th>
              <th className="text-left font-semibold px-2 py-2">Comprobante</th>
              <th className="text-left font-semibold px-2 py-2">Número</th>
              <th className="text-right font-semibold px-2 py-2">Debe (USD)</th>
              <th className="text-right font-semibold px-2 py-2">Haber (USD)</th>
              <th className="text-left font-semibold px-2 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-800">
            {rows.map((r, i) => (
              <tr key={`${r.number}-${i}`}>
                <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{fmtDate(r.date)}</td>
                <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{fmtDate(r.dueDate)}</td>
                <td className="px-2 py-2 text-surface-200">{r.form || "—"}</td>
                <td className="px-2 py-2 text-surface-400 font-mono text-xs">{r.number || "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{moneyCell(r.debit, "USD", "debit")}</td>
                <td className="px-2 py-2 text-right tabular-nums">{moneyCell(r.credit, "USD", "credit")}</td>
                <td className="px-2 py-2 text-surface-400">{fmtStatus(r.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MovementsTable({
  rows,
  onOpen,
  emptyHint,
}: {
  rows: ElitMovement[];
  onOpen: (m: ElitMovement) => void;
  emptyHint?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-2">Historial de cuenta corriente</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-surface-500">
              <th className="text-left font-semibold px-2 py-2">Fecha</th>
              <th className="text-left font-semibold px-2 py-2">Comprobante</th>
              <th className="text-left font-semibold px-2 py-2">Número</th>
              <th className="text-left font-semibold px-2 py-2">Remito</th>
              <th className="text-left font-semibold px-2 py-2">Moneda</th>
              <th className="text-right font-semibold px-2 py-2">Cotización</th>
              <th className="text-right font-semibold px-2 py-2">Importe</th>
              <th className="text-right font-semibold px-2 py-2">Debe</th>
              <th className="text-right font-semibold px-2 py-2">Haber</th>
              <th className="text-right font-semibold px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-800">
            {rows.map((m, i) => (
              <tr key={`${m.number}-${i}`}>
                <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{fmtDate(m.date)}</td>
                <td className="px-2 py-2 text-surface-200 whitespace-nowrap">{m.form || "—"}</td>
                <td className="px-2 py-2 text-surface-400 font-mono text-xs">{m.number || "—"}</td>
                <td className="px-2 py-2 text-surface-400 font-mono text-xs">{m.remito || "—"}</td>
                <td className="px-2 py-2 text-surface-400">{m.currency || "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums text-surface-400">
                  {m.exchangeRate != null
                    ? m.exchangeRate.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : m.currency === "ARS"
                      ? "1,00"
                      : "—"}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-surface-200">{fmt(m.amount ?? m.total, m.currency || "USD")}</td>
                <td className="px-2 py-2 text-right tabular-nums">{moneyCell(m.debit, "ARS", "debit")}</td>
                <td className="px-2 py-2 text-right tabular-nums">{moneyCell(m.credit, "ARS", "credit")}</td>
                <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(m)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">{emptyHint || "Sin movimientos en este período."}</p>
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
