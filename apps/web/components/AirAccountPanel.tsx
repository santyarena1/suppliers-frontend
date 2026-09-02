"use client";

import { useEffect, useState } from "react";
import {
  airAccountApi,
  airCheckoutApi,
  NodoProviderDraft,
} from "@/lib/api";
import { loadAccountCached, clearAccountCache } from "@/lib/account-portal-cache";
import NodoSpinner from "@/components/NodoSpinner";
import { Wallet, XCircle } from "lucide-react";
import Link from "next/link";
import AccountRowDetail, { VerMasButton, type AccountDetailDoc, type AccountDetailLine } from "@/components/account/AccountRowDetail";
import { taxBreakdownLines, taxFromLabeledRecord } from "@/components/account/accountTaxBreakdown";
import { draftItems, draftLines, draftTotals } from "@/components/account/draftDetail";
import AccountHistoryChrome from "@/components/account/AccountHistoryChrome";
import {
  useAccountHistoryState,
  useClampPage,
  usePagedMonthRows,
} from "@/components/account/useAccountHistory";
import { formatAccountSum, parseAccountAmount, sumAccountAmounts } from "@/lib/account-history";

type AirAccount = Awaited<ReturnType<typeof airAccountApi.account>>["data"];
type AirRow = Record<string, string> & { _links?: { href: string; label: string }[]; _href?: string };
type Detail = { kind: "row"; title: string; row: AirRow } | { kind: "draft"; row: NodoProviderDraft };

type SectionId = "cta" | "invoices" | "pending" | "nodo";

type CachedPayload = { account: AirAccount; drafts: NodoProviderDraft[] };

const SECTIONS = [
  { id: "cta", label: "Debe/Haber" },
  { id: "invoices", label: "Comprobantes" },
  { id: "pending", label: "Pendientes" },
  { id: "nodo", label: "Desde Nodo" },
] as const;

function airRowDate(row: AirRow): string | null {
  const keys = ["Fecha", "fecha", "Date", "date"] as const;
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v);
  }
  return null;
}

function airCellText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v);
  return null;
}

function airRowAmount(row: AirRow): number | null {
  const prefer = ["Importe", "Total", "Monto", "Debe", "Haber", "importe", "total", "monto", "debe", "haber"];
  for (const k of prefer) {
    const n = parseAccountAmount(airCellText(row[k]));
    if (n != null) return n;
  }
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith("_")) continue;
    if (!/importe|total|monto|debe|haber|precio/i.test(k)) continue;
    const n = parseAccountAmount(airCellText(v));
    if (n != null) return n;
  }
  return null;
}

function airRowsSum(rows: AirRow[]): string | null {
  const hasDebe = rows.some((r) => airCellText(r.Debe ?? r.debe) != null);
  const hasHaber = rows.some((r) => airCellText(r.Haber ?? r.haber) != null);
  if (hasDebe && hasHaber) {
    const debe = sumAccountAmounts(rows.map((r) => airCellText(r.Debe ?? r.debe)));
    const haber = sumAccountAmounts(rows.map((r) => airCellText(r.Haber ?? r.haber)));
    if (debe == null && haber == null) return null;
    const net = (debe ?? 0) - (haber ?? 0);
    return `Debe ${formatAccountSum(debe ?? 0)} · Haber ${formatAccountSum(haber ?? 0)} · Neto ${formatAccountSum(net)}`;
  }
  const s = sumAccountAmounts(rows.map((r) => airRowAmount(r)));
  return s != null ? formatAccountSum(s) : null;
}

export default function AirAccountPanel() {
  const history = useAccountHistoryState("cta");
  const [account, setAccount] = useState<AirAccount | null>(null);
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
      if (refresh) clearAccountCache("AIR:");
      const { data, fromCache: hit } = await loadAccountCached<CachedPayload>(
        "AIR:account",
        async () => {
          const [accountRes, draftsRes] = await Promise.all([
            airAccountApi.account({ refresh }),
            airCheckoutApi.drafts().catch(() => ({ data: [] as NodoProviderDraft[] })),
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
      setError(msg || "No se pudo traer la cuenta de Air. ¿Están usuario y contraseña del portal?");
    } finally {
      setLoading(false);
    }
  }

  const section = history.section as SectionId;
  const rowsForSection =
    section === "cta"
      ? ((account?.movements ?? null) as AirRow[] | null)
      : section === "invoices"
        ? ((account?.invoices ?? null) as AirRow[] | null)
        : section === "pending"
          ? ((account?.pending ?? null) as AirRow[] | null)
          : drafts;

  const getDate =
    section === "nodo"
      ? (d: NodoProviderDraft) => d.createdAt
      : (row: AirRow) => airRowDate(row);

  const paged = usePagedMonthRows(
    rowsForSection as never[],
    getDate as never,
    history.month,
    history.page
  );
  useClampPage(history.page, paged.pages, history.setPage);

  const amountTotal = (() => {
    if (!paged.filtered.length) return null;
    if (section === "nodo") {
      const s = sumAccountAmounts((paged.filtered as NodoProviderDraft[]).map((d) => d.total));
      return s != null ? formatAccountSum(s) : null;
    }
    return airRowsSum(paged.filtered as AirRow[]);
  })();

  const ready = account != null && drafts != null;

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
        onRefresh={() => void load(true)}
        refreshing={loading}
        fromCache={fromCache}
        amountTotal={amountTotal}
        hint="Debe/haber y comprobantes de air-intra.com. Se ven y descargan PDFs; Air no tiene adjuntar pago desde Nodo."
        header={
          section === "cta" && account?.balance != null ? (
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-sky-400" />
              <div>
                <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Saldo</span>
                <p className={`text-xl font-bold tabular-nums ${account.balance < 0 ? "text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                  {account.balance.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
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
              <Link href="/proveedores/AIR?tab=credentials" className="underline text-red-300 hover:text-white">
                Cargar cuenta
              </Link>
            </span>
            <button type="button" onClick={() => void load(true)} className="underline flex-shrink-0">Reintentar</button>
          </div>
        ) : section === "nodo" ? (
          <DraftsTable
            drafts={paged.items as NodoProviderDraft[]}
            onOpen={(d) => setDetail({ kind: "draft", row: d })}
          />
        ) : (
          <HtmlRowsTable
            rows={paged.items as AirRow[]}
            empty={
              section === "cta"
                ? "Sin movimientos en este período."
                : section === "invoices"
                  ? "Sin comprobantes en este período."
                  : "Sin pendientes en este período."
            }
            onOpen={(row) =>
              setDetail({
                kind: "row",
                title: section === "cta" ? "Movimiento" : section === "invoices" ? "Comprobante" : "Pendiente",
                row,
              })
            }
          />
        )}
      </AccountHistoryChrome>

      {detail?.kind === "row" && (
        <AccountRowDetail
          open
          title={detail.title}
          lines={airLines(detail.row)}
          totals={airTaxTotals(detail.row)}
          documents={airDocs(detail.row)}
          note={
            airDocs(detail.row).length === 0
              ? "Esta fila no trajo un PDF en el portal. Air no admite adjuntar pagos desde Nodo."
              : undefined
          }
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.kind === "draft" && (
        <AccountRowDetail
          open
          title="Canasto enviado desde Nodo"
          lines={draftLines(detail.row)}
          items={draftItems(detail.row)}
          totals={draftTotals(detail.row)}
          note="El canasto de Air no cobra. No hay factura para descargar desde la API."
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

function airLines(row: AirRow): AccountDetailLine[] {
  return Object.entries(row)
    .filter(([k]) => k !== "_links" && k !== "_href")
    .map(([label, value]) => ({ label, value: value == null ? "" : String(value) }));
}

function airTaxTotals(row: AirRow): AccountDetailLine[] {
  const parsed = taxFromLabeledRecord(row);
  return parsed ? taxBreakdownLines(parsed) : [];
}

function airDocs(row: AirRow): AccountDetailDoc[] {
  const links = row._links ?? (row._href ? [{ href: row._href, label: "Descargar" }] : []);
  return links.map((l, i) => ({
    label: l.label && l.label !== l.href ? l.label : `Descargar ${i + 1}`,
    href: `/providers/AIR/documents?href=${encodeURIComponent(l.href)}`,
    filename: l.label || "comprobante-air",
  }));
}

function HtmlRowsTable({ rows, empty, onOpen }: { rows: AirRow[]; empty: string; onOpen: (row: AirRow) => void }) {
  const keys = rows[0] ? Object.keys(rows[0]).filter((k) => k !== "_links" && k !== "_href").slice(0, 8) : [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-surface-500">
            {keys.map((k) => (
              <th key={k} className="text-left font-semibold px-2 py-2 whitespace-nowrap">{k}</th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {rows.map((row, i) => (
            <tr key={i}>
              {keys.map((k) => (
                <td key={k} className="px-2 py-2 text-surface-400 whitespace-nowrap">{String(row[k] ?? "—")}</td>
              ))}
              <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(row)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">{empty}</p>
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
                }`}>{d.status === "CREATED" ? "Enviado" : d.status}</span>
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
        <p className="text-center text-xs text-surface-500 py-6">Todavía no enviaste canastos desde Nodo en este período.</p>
      )}
    </div>
  );
}
