"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { XCircle } from "lucide-react";
import {
  newTreeAccountApi,
  newTreeCheckoutApi,
  NodoProviderDraft,
  NewTreeMovement,
  NewTreePortalOrder,
} from "@/lib/api";
import { loadAccountCached, clearAccountCache } from "@/lib/account-portal-cache";
import NodoSpinner from "@/components/NodoSpinner";
import AccountRowDetail, { VerMasButton } from "@/components/account/AccountRowDetail";
import { draftItems, draftLines, draftTotals } from "@/components/account/draftDetail";
import AccountHistoryChrome from "@/components/account/AccountHistoryChrome";
import { useAccountHistoryState, useClampPage, usePagedMonthRows } from "@/components/account/useAccountHistory";
import { formatAccountSum, sumAccountAmounts } from "@/lib/account-history";

type NewTreeAccount = Awaited<ReturnType<typeof newTreeAccountApi.account>>["data"];
type Detail =
  | { kind: "movement"; row: NewTreeMovement }
  | { kind: "order"; row: NewTreePortalOrder }
  | { kind: "draft"; row: NodoProviderDraft };

type SectionId = "cta" | "invoices" | "orders" | "nodo";
type CachedPayload = { account: NewTreeAccount; drafts: NodoProviderDraft[] };

const SECTIONS = [
  { id: "cta", label: "Cuenta corriente" },
  { id: "invoices", label: "Facturas" },
  { id: "orders", label: "Pedidos web" },
  { id: "nodo", label: "Desde Nodo" },
] as const;

function documentHref(m: NewTreeMovement): string | undefined {
  if (!m.documentToken) return undefined;
  const name = `${m.form}-${m.number}`.replace(/[^\w-]+/g, "-");
  return `/providers/NEW_TREE/documents?token=${encodeURIComponent(m.documentToken)}&name=${encodeURIComponent(name)}`;
}

function movementDocs(m: NewTreeMovement) {
  const href = documentHref(m);
  return href ? [{ label: "Descargar PDF", href, filename: `${m.voucher}.pdf` }] : [];
}

function money(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null) return "";
  return formatAccountSum(value, currency || "ARS");
}

export default function NewTreeAccountPanel() {
  const history = useAccountHistoryState("cta", "all");
  const [account, setAccount] = useState<NewTreeAccount | null>(null);
  const [drafts, setDrafts] = useState<NodoProviderDraft[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    void load(false);
  }, []);

  async function load(refresh: boolean) {
    setLoading(true);
    setError(null);
    try {
      if (refresh) clearAccountCache("NEW_TREE:");
      const { data, fromCache: hit } = await loadAccountCached<CachedPayload>(
        "NEW_TREE:account",
        async () => {
          const [accountRes, draftsRes] = await Promise.all([
            newTreeAccountApi.account({ refresh }),
            newTreeCheckoutApi.drafts().catch(() => ({ data: [] as NodoProviderDraft[] })),
          ]);
          return { account: accountRes.data, drafts: draftsRes.data ?? accountRes.data.drafts ?? [] };
        },
        { refresh }
      );
      setAccount(data.account);
      setDrafts(data.drafts);
      setFromCache(hit);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo traer la cuenta de New Tree. ¿Están el usuario y la contraseña del portal?");
    } finally {
      setLoading(false);
    }
  }

  const section = history.section as SectionId;
  const rowsForSection =
    section === "cta"
      ? (account ? account.movements ?? [] : null)
      : section === "invoices"
        ? (account ? account.invoices ?? [] : null)
        : section === "orders"
          ? (account ? account.orders ?? [] : null)
          : drafts;
  const getDate =
    section === "nodo"
      ? (d: NodoProviderDraft) => d.createdAt
      : (m: NewTreeMovement | NewTreePortalOrder) => m.date;

  const paged = usePagedMonthRows(rowsForSection as never[], getDate as never, history.month, history.page);
  useClampPage(history.page, paged.pages, history.setPage);

  const ctaBreakdown = (() => {
    if (section !== "cta" && section !== "invoices") return undefined;
    const moves = paged.filtered as NewTreeMovement[];
    if (!moves.length) return undefined;
    const billed = sumAccountAmounts(moves.map((m) => m.debit)) ?? 0;
    const paid = sumAccountAmounts(moves.map((m) => m.credit)) ?? 0;
    const cur = moves.find((m) => m.currency)?.currency ?? "ARS";
    const diff = billed - paid;
    return [
      { label: "Facturado", hint: "Lo que New Tree cargó a tu cuenta", value: formatAccountSum(billed, cur), tone: "debit" as const },
      { label: "Pagos y recibos", hint: "Recibos y notas de crédito", value: formatAccountSum(paid, cur), tone: "credit" as const },
      {
        label: "Diferencia",
        hint: "Facturado menos pagos, en este recorte",
        value: formatAccountSum(diff, cur),
        tone: diff > 0 ? ("debit" as const) : diff < 0 ? ("credit" as const) : ("neutral" as const),
      },
    ];
  })();

  const amountTotal = (() => {
    const rows = paged.filtered as unknown[];
    if (!rows.length || section === "cta" || section === "invoices") return null;
    if (section === "nodo") {
      const s = sumAccountAmounts((rows as NodoProviderDraft[]).map((d) => d.total));
      return s != null ? formatAccountSum(s, "USD") : null;
    }
    const s = sumAccountAmounts((rows as NewTreePortalOrder[]).map((o) => o.amount));
    return s != null ? formatAccountSum(s, (rows as NewTreePortalOrder[])[0]?.currency || "USD") : null;
  })();

  const ready = account != null && drafts != null;

  return (
    <>
      {account?.profile?.id && (
        <p className="text-xs text-surface-400 mb-3 max-w-6xl">
          Cliente {account.profile.id} en newtree.com.ar
          {account.range ? ` · desde ${fmtYmd(account.range.from)} hasta ${fmtYmd(account.range.to)}` : ""}
        </p>
      )}

      <AccountHistoryChrome
        sections={[...SECTIONS]}
        section={section}
        onSection={(id) => history.setSection(id)}
        month={history.month}
        onMonth={(m) => history.setMonth(m)}
        page={paged.page}
        pages={paged.pages}
        total={paged.total}
        onPage={history.setPage}
        onRefresh={() => void load(true)}
        refreshing={loading}
        fromCache={fromCache}
        amountTotal={amountTotal}
        amountTotalLabel="Total período"
        amountBreakdown={ctaBreakdown}
        hint={account?.note ?? "Cuenta corriente, facturas y pedidos web de newtree.com.ar."}
        wide={section === "cta" || section === "invoices"}
        header={section === "cta" ? <BalanceOverview account={account} /> : undefined}
      >
        {loading && !ready ? (
          <div className="flex justify-center py-10"><NodoSpinner className="w-6 h-6" /></div>
        ) : error ? (
          <div className="flex items-start gap-2 text-xs rounded-lg px-3.5 py-2.5 bg-red-500/8 border border-red-500/20 text-red-400">
            <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="flex-1">
              {error}{" "}
              <Link href="/proveedores/NEW_TREE?tab=credentials" className="underline text-red-300 hover:text-white">
                Cargar cuenta
              </Link>
            </span>
            <button type="button" onClick={() => void load(true)} className="underline flex-shrink-0">Reintentar</button>
          </div>
        ) : section === "cta" || section === "invoices" ? (
          <MovementsTable
            rows={paged.items as NewTreeMovement[]}
            onlyInvoices={section === "invoices"}
            onOpen={(m) => setDetail({ kind: "movement", row: m })}
          />
        ) : section === "orders" ? (
          <OrdersTable rows={paged.items as NewTreePortalOrder[]} onOpen={(o) => setDetail({ kind: "order", row: o })} />
        ) : (
          <DraftsTable drafts={paged.items as NodoProviderDraft[]} onOpen={(d) => setDetail({ kind: "draft", row: d })} />
        )}
      </AccountHistoryChrome>

      {detail?.kind === "movement" && (
        <AccountRowDetail
          open
          title={detail.row.voucher}
          lines={[
            { label: "Tipo", value: detail.row.form },
            { label: "Número", value: detail.row.number },
            { label: "Fecha", value: detail.row.date },
            { label: "Vencimiento", value: detail.row.dueDate },
            { label: "Moneda", value: detail.row.currency || "" },
            { label: "Cargado a la cuenta", value: money(detail.row.debit, detail.row.currency) },
            { label: "Pagado / descontado", value: money(detail.row.credit, detail.row.currency) },
          ]}
          documents={movementDocs(detail.row)}
          note={documentHref(detail.row) ? undefined : "New Tree no ofrece descarga para este comprobante."}
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.kind === "order" && (
        <AccountRowDetail
          open
          title={`Pedido web ${detail.row.id}`}
          lines={[
            { label: "Fecha", value: detail.row.date },
            { label: "Estado", value: detail.row.status },
            { label: "Origen", value: detail.row.origin },
            { label: "Monto", value: money(detail.row.amount, detail.row.currency) },
          ]}
          documents={detail.row.detailUrl ? [{ label: "Ver en newtree.com.ar", href: absolutePortalUrl(detail.row.detailUrl) }] : []}
          note="El detalle de líneas vive en el portal; New Tree no lo expone fuera de la sesión web."
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.kind === "draft" && (
        <AccountRowDetail
          open
          title={`Pedido desde Nodo ${detail.row.invidOrderNumber ?? ""}`.trim()}
          lines={draftLines(detail.row)}
          items={draftItems(detail.row)}
          totals={draftTotals(detail.row)}
          note={detail.row.errorMessage ?? undefined}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

function fmtYmd(raw: string): string {
  return /^\d{8}$/.test(raw) ? `${raw.slice(6, 8)}/${raw.slice(4, 6)}/${raw.slice(0, 4)}` : raw;
}

function absolutePortalUrl(href: string): string {
  return href.startsWith("http") ? href : `https://www.newtree.com.ar${href.startsWith("/") ? "" : "/"}${href}`;
}

function BalanceOverview({ account }: { account: NewTreeAccount | null }) {
  const b = account?.balance;
  if (!b || b.total == null) return null;
  const box = (label: string, value: number | null, tone: "warn" | "ok" | "neutral") => (
    <div className={`rounded-lg border px-3 py-2 ${
      tone === "warn" ? "border-red-500/30 bg-red-500/5" : tone === "ok" ? "border-emerald-500/30 bg-emerald-500/5" : "border-surface-800"
    }`}>
      <p className="text-[10px] uppercase tracking-wider text-surface-500">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-surface-100">{value != null ? formatAccountSum(value, b.currency) : "—"}</p>
    </div>
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
      {box("Saldo total", b.total, b.total > 0 ? "warn" : "ok")}
      {box("Vencido", b.overdue, (b.overdue ?? 0) > 0 ? "warn" : "neutral")}
      {box("A vencer", b.toExpire, "neutral")}
    </div>
  );
}

function MovementsTable({
  rows,
  onlyInvoices,
  onOpen,
}: {
  rows: NewTreeMovement[];
  onlyInvoices: boolean;
  onOpen: (m: NewTreeMovement) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-surface-500">
            <th className="text-left font-semibold px-2 py-2">Fecha</th>
            <th className="text-left font-semibold px-2 py-2">Comprobante</th>
            <th className="text-left font-semibold px-2 py-2">Vence</th>
            <th className="text-right font-semibold px-2 py-2">Debe</th>
            <th className="text-right font-semibold px-2 py-2">Haber</th>
            <th className="text-right font-semibold px-2 py-2">PDF</th>
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {rows.map((m, i) => {
            const href = documentHref(m);
            return (
              <tr key={`${m.voucher}-${i}`}>
                <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{m.date}</td>
                <td className="px-2 py-2 text-surface-200 font-mono text-xs">{m.voucher}</td>
                <td className="px-2 py-2 text-surface-500 whitespace-nowrap">{m.dueDate}</td>
                <td className="px-2 py-2 text-right tabular-nums text-red-300">{money(m.debit, m.currency)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-emerald-300">{money(m.credit, m.currency)}</td>
                <td className="px-2 py-2 text-right">
                  {href ? (
                    <a href={href} className="text-[11px] font-medium text-sky-400 hover:text-white underline underline-offset-2" target="_blank" rel="noreferrer">
                      Descargar
                    </a>
                  ) : (
                    <span className="text-[11px] text-surface-600">—</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(m)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">
          {onlyInvoices ? "Sin facturas en este período." : "Sin movimientos en este período."}
        </p>
      )}
    </div>
  );
}

function OrdersTable({ rows, onOpen }: { rows: NewTreePortalOrder[]; onOpen: (o: NewTreePortalOrder) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-surface-500">
            <th className="text-left font-semibold px-2 py-2">Pedido</th>
            <th className="text-left font-semibold px-2 py-2">Fecha</th>
            <th className="text-left font-semibold px-2 py-2">Estado</th>
            <th className="text-left font-semibold px-2 py-2">Origen</th>
            <th className="text-right font-semibold px-2 py-2">Monto</th>
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {rows.map((o) => (
            <tr key={o.id}>
              <td className="px-2 py-2 text-surface-200 font-mono text-xs">{o.id}</td>
              <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{o.date}</td>
              <td className="px-2 py-2 text-surface-300">{o.status}</td>
              <td className="px-2 py-2 text-surface-500">{o.origin}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">{money(o.amount, o.currency)}</td>
              <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(o)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">
          Sin pedidos web en este período. Los pedidos que cargó tu vendedor aparecen en la cuenta corriente al facturarse.
        </p>
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
                  d.status === "CREATED" ? "bg-sky-500/10 text-sky-400" : d.status === "PENDING" || d.status === "PENDING_APPROVAL" ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"
                }`}>{d.status === "CREATED" ? "Creado" : d.status}</span>
              </td>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">{d.invidOrderNumber ?? d.invidWebOrderNumber ?? "—"}</td>
              <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{new Date(d.createdAt).toLocaleString("es-AR")}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">{d.total != null ? formatAccountSum(Number(d.total), "USD") : "—"}</td>
              <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(d)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {drafts.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">Todavía no creaste pedidos de New Tree desde Nodo.</p>
      )}
    </div>
  );
}
