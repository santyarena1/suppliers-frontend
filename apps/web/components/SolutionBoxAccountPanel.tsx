"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { XCircle } from "lucide-react";
import { solutionBoxAccountApi, solutionBoxCheckoutApi, NodoProviderDraft, SolutionBoxOrder } from "@/lib/api";
import { loadAccountCached, clearAccountCache } from "@/lib/account-portal-cache";
import NodoSpinner from "@/components/NodoSpinner";
import AccountRowDetail, { VerMasButton } from "@/components/account/AccountRowDetail";
import { draftItems, draftLines, draftTotals } from "@/components/account/draftDetail";
import { sbOrderItems, sbOrderTotals } from "@/components/account/sbOrderDetail";
import AccountHistoryChrome from "@/components/account/AccountHistoryChrome";
import { useAccountHistoryState, useClampPage, usePagedMonthRows } from "@/components/account/useAccountHistory";
import { formatAccountSum, sumAccountAmounts } from "@/lib/account-history";

type SolutionBoxAccount = Awaited<ReturnType<typeof solutionBoxAccountApi.account>>["data"];
type Detail = { kind: "order"; row: SolutionBoxOrder } | { kind: "draft"; row: NodoProviderDraft };
type SectionId = "orders" | "invoices" | "nodo";
type CachedPayload = { account: SolutionBoxAccount; drafts: NodoProviderDraft[] };

const SECTIONS = [
  { id: "orders", label: "Pedidos" },
  { id: "invoices", label: "Facturas" },
  { id: "nodo", label: "Desde Nodo" },
] as const;

function invoiceHref(o: SolutionBoxOrder): string | undefined {
  if (!o.invoice) return undefined;
  return `/providers/SOLUTION_BOX/orders/${encodeURIComponent(o.number)}/${encodeURIComponent(o.extension)}/invoice`;
}

function money(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null) return "";
  return formatAccountSum(value, currency || "USD");
}

export default function SolutionBoxAccountPanel() {
  const history = useAccountHistoryState("orders", "all");
  const [account, setAccount] = useState<SolutionBoxAccount | null>(null);
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
      if (refresh) clearAccountCache("SOLUTION_BOX:");
      const { data, fromCache: hit } = await loadAccountCached<CachedPayload>(
        "SOLUTION_BOX:account",
        async () => {
          const [accountRes, draftsRes] = await Promise.all([
            solutionBoxAccountApi.account({ refresh }),
            solutionBoxCheckoutApi.drafts().catch(() => ({ data: [] as NodoProviderDraft[] })),
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
      setError(msg || "No se pudo traer la cuenta de Solution Box. ¿Están el mail y la contraseña del sitio?");
    } finally {
      setLoading(false);
    }
  }

  const section = history.section as SectionId;
  const rowsForSection =
    section === "orders"
      ? (account ? account.orders ?? [] : null)
      : section === "invoices"
        ? (account ? account.invoices ?? [] : null)
        : drafts;
  const getDate = section === "nodo" ? (d: NodoProviderDraft) => d.createdAt : (o: SolutionBoxOrder) => o.date;
  const paged = usePagedMonthRows(rowsForSection as never[], getDate as never, history.month, history.page);
  useClampPage(history.page, paged.pages, history.setPage);

  const amountTotal = (() => {
    const rows = paged.filtered as unknown[];
    if (!rows.length) return null;
    if (section === "nodo") {
      const s = sumAccountAmounts((rows as NodoProviderDraft[]).map((d) => d.total));
      return s != null ? formatAccountSum(s, "USD") : null;
    }
    const byCur = new Map<string, number>();
    for (const o of rows as SolutionBoxOrder[]) {
      if (o.amount == null) continue;
      const cur = o.currency ?? "USD";
      byCur.set(cur, (byCur.get(cur) ?? 0) + o.amount);
    }
    if (byCur.size === 0) return null;
    return [...byCur.entries()].map(([cur, n]) => formatAccountSum(n, cur)).join(" · ");
  })();

  const ready = account != null && drafts != null;

  return (
    <>
      {account?.profile && (
        <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-2.5 rounded-xl border border-surface-800 bg-surface-900/40 px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
          <ProfileField label="Cliente" value={account.profile.name} />
          <ProfileField label="N° de cliente" value={account.profile.id} />
          <ProfileField label="CUIT" value={account.profile.cuit} />
          <ProfileField label="Condición de pago" value={account.profile.paymentCondition} />
          <ProfileField label="Entrega" value={account.profile.deliveryType} />
          <ProfileField
            label="Cotización"
            value={account.profile.exchange != null ? `USD ${account.profile.exchange}` : null}
          />
        </div>
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
        hint={account?.note ?? "Pedidos y facturas de solutionbox.com.ar."}
        wide={section !== "nodo"}
      >
        {loading && !ready ? (
          <div className="flex justify-center py-10"><NodoSpinner className="w-6 h-6" /></div>
        ) : error ? (
          <div className="flex items-start gap-2 text-xs rounded-lg px-3.5 py-2.5 bg-red-500/8 border border-red-500/20 text-red-400">
            <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="flex-1">
              {error}{" "}
              <Link href="/proveedores/SOLUTION_BOX?tab=credentials" className="underline text-red-300 hover:text-white">
                Cargar cuenta
              </Link>
            </span>
            <button type="button" onClick={() => void load(true)} className="underline flex-shrink-0">Reintentar</button>
          </div>
        ) : section === "nodo" ? (
          <DraftsTable drafts={paged.items as NodoProviderDraft[]} onOpen={(d) => setDetail({ kind: "draft", row: d })} />
        ) : (
          <OrdersTable rows={paged.items as SolutionBoxOrder[]} invoicesOnly={section === "invoices"} onOpen={(o) => setDetail({ kind: "order", row: o })} />
        )}
      </AccountHistoryChrome>

      {detail?.kind === "order" && (
        <AccountRowDetail
          open
          title={`Pedido ${detail.row.number}/${detail.row.extension}`}
          lines={[
            { label: "Fecha", value: detail.row.date },
            { label: "Estado", value: detail.row.status },
            { label: "Vendedor", value: detail.row.seller },
            { label: "Condición de pago", value: detail.row.paymentCondition },
            { label: "Factura", value: detail.row.invoice ?? "" },
            { label: "Cotización", value: detail.row.exchange != null ? String(detail.row.exchange) : "" },
            { label: "Importe", value: money(detail.row.amount, detail.row.currency) },
          ]}
          items={sbOrderItems(detail.row)}
          totals={sbOrderTotals(detail.row)}
          documents={invoiceHref(detail.row) ? [{ label: `Factura ${detail.row.invoice}`, href: invoiceHref(detail.row), filename: `factura-${detail.row.number}.pdf` }] : []}
          note={detail.row.invoice ? undefined : "Todavía no hay factura para este pedido."}
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

function OrdersTable({ rows, invoicesOnly, onOpen }: { rows: SolutionBoxOrder[]; invoicesOnly: boolean; onOpen: (o: SolutionBoxOrder) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-surface-500">
            <th className="text-left font-semibold px-2 py-2">Pedido</th>
            <th className="text-left font-semibold px-2 py-2">Fecha</th>
            <th className="text-left font-semibold px-2 py-2">Estado</th>
            <th className="text-left font-semibold px-2 py-2">Factura</th>
            <th className="text-right font-semibold px-2 py-2">Importe</th>
            <th className="text-right font-semibold px-2 py-2">PDF</th>
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {rows.map((o) => {
            const href = invoiceHref(o);
            return (
              <tr key={`${o.number}-${o.extension}`}>
                <td className="px-2 py-2 text-surface-200 font-mono text-xs">{o.number}/{o.extension}</td>
                <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{o.date}</td>
                <td className="px-2 py-2 text-surface-300">{o.status}</td>
                <td className="px-2 py-2 text-surface-500 font-mono text-xs">{o.invoice ?? "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums text-surface-200">{money(o.amount, o.currency)}</td>
                <td className="px-2 py-2 text-right">
                  {href ? (
                    <a href={href} className="text-[11px] font-medium text-sky-400 hover:text-white underline underline-offset-2" target="_blank" rel="noreferrer">
                      Descargar
                    </a>
                  ) : (
                    <span className="text-[11px] text-surface-600">—</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(o)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">{invoicesOnly ? "Sin facturas en este período." : "Sin pedidos en este período."}</p>
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
        <p className="text-center text-xs text-surface-500 py-6">Todavía no creaste pedidos de Solution Box desde Nodo.</p>
      )}
    </div>
  );
}

/** Un dato de la ficha del cliente. Se omite si el portal no lo manda. */
function ProfileField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500">{label}</p>
      <p className="mt-0.5 truncate text-xs text-surface-200" title={value}>
        {value}
      </p>
    </div>
  );
}
