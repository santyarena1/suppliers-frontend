"use client";

import { useEffect, useState } from "react";
import {
  grupoNucleoAccountApi,
  grupoNucleoCheckoutApi,
  NodoProviderDraft,
} from "@/lib/api";
import NodoSpinner from "@/components/NodoSpinner";
import { Receipt, XCircle } from "lucide-react";
import Link from "next/link";

export default function GrupoNucleoAccountPanel() {
  const [note, setNote] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<NodoProviderDraft[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [accountRes, draftsRes] = await Promise.all([
        grupoNucleoAccountApi.account(),
        grupoNucleoCheckoutApi.drafts().catch(() => ({ data: [] as NodoProviderDraft[] })),
      ]);
      setNote(accountRes.data.note);
      setDrafts(draftsRes.data ?? accountRes.data.drafts ?? []);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudieron traer los pedidos de Grupo Núcleo. ¿Están las credenciales?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <p className="text-xs text-surface-500">
        {note || "La API de Grupo Núcleo no publica historial de pedidos ni cuenta corriente. Acá están solo los pedidos creados desde Nodo."}
      </p>
      {loading ? (
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
          <button onClick={load} className="underline flex-shrink-0">Reintentar</button>
        </div>
      ) : (
        <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Receipt className="w-4 h-4 text-sky-400" />
            Pedidos creados desde Nodo
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-surface-500">
                  <th className="text-left font-semibold px-2 py-2">Estado</th>
                  <th className="text-left font-semibold px-2 py-2">Pedido</th>
                  <th className="text-left font-semibold px-2 py-2">Fecha</th>
                  <th className="text-right font-semibold px-2 py-2">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {(drafts ?? []).map((d) => (
                  <tr key={d.id}>
                    <td className="px-2 py-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        d.status === "CREATED" ? "bg-sky-500/10 text-sky-400" : "bg-red-500/10 text-red-400"
                      }`}>{d.status === "CREATED" ? "Creado" : d.status}</span>
                    </td>
                    <td className="px-2 py-2 text-surface-400 font-mono text-xs">{d.invidOrderNumber ?? d.invidWebOrderNumber ?? "—"}</td>
                    <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{new Date(d.createdAt).toLocaleString("es-AR")}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-surface-200">{d.total ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(drafts ?? []).length === 0 && (
              <p className="text-center text-xs text-surface-500 py-6">Todavía no creaste pedidos desde Nodo.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
