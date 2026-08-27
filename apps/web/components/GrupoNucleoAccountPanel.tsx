"use client";

import { useEffect, useState } from "react";
import {
  grupoNucleoAccountApi,
  grupoNucleoCheckoutApi,
  NodoProviderDraft,
} from "@/lib/api";
import { loadAccountCached, clearAccountCache } from "@/lib/account-portal-cache";
import NodoSpinner from "@/components/NodoSpinner";
import { XCircle } from "lucide-react";
import Link from "next/link";
import AccountRowDetail, { VerMasButton } from "@/components/account/AccountRowDetail";
import { draftItems, draftLines } from "@/components/account/draftDetail";
import AccountHistoryChrome from "@/components/account/AccountHistoryChrome";
import {
  useAccountHistoryState,
  useClampPage,
  usePagedMonthRows,
} from "@/components/account/useAccountHistory";
import { formatAccountSum, sumAccountAmounts } from "@/lib/account-history";

type CachedPayload = { drafts: NodoProviderDraft[] };

const SECTIONS = [{ id: "nodo", label: "Desde Nodo" }] as const;

export default function GrupoNucleoAccountPanel() {
  const history = useAccountHistoryState("nodo");
  const [drafts, setDrafts] = useState<NodoProviderDraft[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [open, setOpen] = useState<NodoProviderDraft | null>(null);

  useEffect(() => {
    void load(false);
  }, []);

  async function load(refresh: boolean) {
    setLoading(true);
    setError(null);
    try {
      if (refresh) clearAccountCache("GN:");
      const { data, fromCache: hit } = await loadAccountCached<CachedPayload>(
        "GN:account",
        async () => {
          const [accountRes, draftsRes] = await Promise.all([
            grupoNucleoAccountApi.account(),
            grupoNucleoCheckoutApi.drafts().catch(() => ({ data: [] as NodoProviderDraft[] })),
          ]);
          return {
            drafts: draftsRes.data ?? accountRes.data.drafts ?? [],
          };
        },
        { refresh }
      );
      setDrafts(data.drafts);
      setFromCache(hit);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudieron traer los pedidos de Grupo Núcleo. ¿Están las credenciales?");
    } finally {
      setLoading(false);
    }
  }

  const paged = usePagedMonthRows(
    drafts,
    (d) => d.createdAt,
    history.month,
    history.page
  );
  useClampPage(history.page, paged.pages, history.setPage);

  const amountSum = sumAccountAmounts(paged.filtered.map((d) => d.total));
  const amountTotal = amountSum != null ? formatAccountSum(amountSum) : null;

  return (
    <>
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
        hint="Grupo Núcleo no publica historial ni adjuntar comprobantes. Acá van solo los pedidos creados desde Nodo."
      >
        {loading && drafts == null ? (
          <div className="flex justify-center py-10"><NodoSpinner className="w-6 h-6" /></div>
        ) : error ? (
          <div className="flex items-start gap-2 text-xs rounded-lg px-3.5 py-2.5 bg-red-500/8 border border-red-500/20 text-red-400">
            <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="flex-1">
              {error}{" "}
              <Link href="/proveedores/GRUPO_NUCLEO?tab=credentials" className="underline text-red-300 hover:text-white">
                Cargar cuenta
              </Link>
            </span>
            <button type="button" onClick={() => void load(true)} className="underline flex-shrink-0">Reintentar</button>
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
                {paged.items.map((d) => (
                  <tr key={d.id}>
                    <td className="px-2 py-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        d.status === "CREATED" ? "bg-sky-500/10 text-sky-400" : "bg-red-500/10 text-red-400"
                      }`}>{d.status === "CREATED" ? "Creado" : d.status}</span>
                    </td>
                    <td className="px-2 py-2 text-surface-400 font-mono text-xs">{d.invidOrderNumber ?? d.invidWebOrderNumber ?? "—"}</td>
                    <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{new Date(d.createdAt).toLocaleString("es-AR")}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-surface-200">{d.total ?? "—"}</td>
                    <td className="px-2 py-2 text-right"><VerMasButton onClick={() => setOpen(d)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {paged.items.length === 0 && (
              <p className="text-center text-xs text-surface-500 py-6">Todavía no creaste pedidos desde Nodo en este período.</p>
            )}
          </div>
        )}
      </AccountHistoryChrome>
      {open && (
        <AccountRowDetail
          open
          title="Pedido Grupo Núcleo"
          lines={draftLines(open)}
          items={draftItems(open)}
          note="Grupo Núcleo no descarga facturas ni admite adjuntar pagos desde Nodo. Solo se puede informar el link de etiqueta de transporte."
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
