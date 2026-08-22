"use client";

import { useEffect, useState } from "react";
import {
  airAccountApi,
  airCheckoutApi,
  NodoProviderDraft,
} from "@/lib/api";
import NodoSpinner from "@/components/NodoSpinner";
import { Receipt, Wallet, XCircle } from "lucide-react";
import Link from "next/link";
import AccountRowDetail, { VerMasButton, type AccountDetailDoc, type AccountDetailLine } from "@/components/account/AccountRowDetail";
import { draftItems, draftLines } from "@/components/account/draftDetail";

type AirAccount = Awaited<ReturnType<typeof airAccountApi.account>>["data"];
type AirRow = Record<string, string> & { _links?: { href: string; label: string }[]; _href?: string };
type Detail = { kind: "row"; title: string; row: AirRow } | { kind: "draft"; row: NodoProviderDraft };

export default function AirAccountPanel() {
  const [account, setAccount] = useState<AirAccount | null>(null);
  const [drafts, setDrafts] = useState<NodoProviderDraft[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [accountRes, draftsRes] = await Promise.all([
        airAccountApi.account(),
        airCheckoutApi.drafts().catch(() => ({ data: [] as NodoProviderDraft[] })),
      ]);
      setAccount(accountRes.data);
      setDrafts(draftsRes.data ?? accountRes.data.drafts ?? []);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo traer la cuenta de Air. ¿Están usuario y contraseña del portal?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <p className="text-xs text-surface-500">
        {account?.note || "Datos del portal www.air-intra.com (debe/haber y comprobantes)."}
      </p>
      {loading ? (
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
          <button onClick={load} className="underline flex-shrink-0">Reintentar</button>
        </div>
      ) : (
        <>
          <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Wallet className="w-4 h-4 text-sky-400" />
              Debe / Haber
            </div>
            {account?.balance != null && (
              <div>
                <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Saldo</span>
                <p className={`text-2xl font-bold tabular-nums ${account.balance < 0 ? "text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                  {account.balance.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
                </p>
              </div>
            )}
            <HtmlRowsTable rows={(account?.movements ?? []) as AirRow[]} empty="Sin movimientos." onOpen={(row) => setDetail({ kind: "row", title: "Movimiento", row })} />
          </div>

          <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Receipt className="w-4 h-4 text-sky-400" />
              Comprobantes
            </div>
            <HtmlRowsTable rows={(account?.invoices ?? []) as AirRow[]} empty="Sin comprobantes." onOpen={(row) => setDetail({ kind: "row", title: "Comprobante", row })} />
          </div>

          <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Receipt className="w-4 h-4 text-amber-400" />
              Comprobantes pendientes
            </div>
            <HtmlRowsTable rows={(account?.pending ?? []) as AirRow[]} empty="Sin pendientes." onOpen={(row) => setDetail({ kind: "row", title: "Pendiente", row })} />
          </div>

          <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Receipt className="w-4 h-4 text-brand-700 dark:text-brand-400" />
              Pedidos enviados desde Nodo
            </div>
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
                  {(drafts ?? []).map((d) => (
                    <tr key={d.id}>
                      <td className="px-2 py-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          d.status === "CREATED" ? "bg-sky-500/10 text-sky-400" : "bg-red-500/10 text-red-400"
                        }`}>{d.status === "CREATED" ? "Enviado" : d.status}</span>
                      </td>
                      <td className="px-2 py-2 text-surface-400 font-mono text-xs">{d.invidOrderNumber ?? d.invidWebOrderNumber ?? "—"}</td>
                      <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{new Date(d.createdAt).toLocaleString("es-AR")}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-surface-200">{d.total ?? "—"}</td>
                      <td className="px-2 py-2 text-right"><VerMasButton onClick={() => setDetail({ kind: "draft", row: d })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(drafts ?? []).length === 0 && (
                <p className="text-center text-xs text-surface-500 py-6">Todavía no enviaste canastos desde Nodo.</p>
              )}
            </div>
          </div>
        </>
      )}

      {detail?.kind === "row" && (
        <AccountRowDetail
          open
          title={detail.title}
          lines={airLines(detail.row)}
          documents={airDocs(detail.row)}
          note={airDocs(detail.row).length === 0 ? "Esta fila no trajo un link de PDF en el portal." : undefined}
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.kind === "draft" && (
        <AccountRowDetail
          open
          title="Canasto enviado desde Nodo"
          lines={draftLines(detail.row)}
          items={draftItems(detail.row)}
          note="El canasto de Air no cobra. No hay factura para descargar desde la API."
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function airLines(row: AirRow): AccountDetailLine[] {
  return Object.entries(row)
    .filter(([k]) => k !== "_links" && k !== "_href")
    .map(([label, value]) => ({ label, value: value == null ? "" : String(value) }));
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
