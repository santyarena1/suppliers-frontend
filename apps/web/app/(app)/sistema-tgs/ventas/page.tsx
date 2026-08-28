"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import TgsPage from "@/components/tgs/TgsPage";
import TgsPager from "@/components/tgs/TgsPager";
import TgsBadge from "@/components/tgs/TgsBadge";
import { TgsButton, TgsEmpty, TgsError, TgsInput, TgsLoading, TgsSelect } from "@/components/tgs/TgsUi";
import { currentMonthRange, tgsFecha, tgsMoney } from "@/components/tgs/tgs-format";
import { tgsApi, type TgsPageMeta, type TgsVenta } from "@/lib/tgs-api";

const month = currentMonthRange();

export default function TgsVentasPage() {
  const [desde, setDesde] = useState(month.desde);
  const [hasta, setHasta] = useState(month.hasta);
  const [estado, setEstado] = useState("");
  const [applied, setApplied] = useState(month);
  const [estadoApplied, setEstadoApplied] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TgsVenta[]>([]);
  const [meta, setMeta] = useState<TgsPageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tgsApi.ventas({
        desde: applied.desde,
        hasta: applied.hasta,
        estado: estadoApplied || undefined,
        page,
        per_page: 20,
      });
      setItems(res.data.items);
      setMeta(res.data.meta);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [applied, estadoApplied, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <TgsPage
      title="Ventas"
      subtitle="Comprobantes emitidos en AcuStock"
      action={
        <Link href="/sistema-tgs/ventas/nuevo">
          <TgsButton>
            <Plus className="w-3.5 h-3.5" />
            Nueva
          </TgsButton>
        </Link>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setApplied({ desde, hasta });
          setEstadoApplied(estado);
        }}
        className="flex flex-wrap gap-2 items-end"
      >
        <label className="flex flex-col gap-1 text-[11px] text-surface-500">
          Desde
          <TgsInput type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-surface-500">
          Hasta
          <TgsInput type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-surface-500">
          Estado
          <TgsSelect value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="pagada">pagada</option>
            <option value="completada">completada</option>
            <option value="pendiente">pendiente</option>
            <option value="anulada">anulada</option>
          </TgsSelect>
        </label>
        <TgsButton type="submit">
          <Search className="w-3.5 h-3.5" />
          Filtrar
        </TgsButton>
      </form>
      <TgsError err={error} fallback="No se pudieron cargar las ventas" />
      {loading ? (
        <TgsLoading />
      ) : !items.length ? (
        <TgsEmpty text="No hay ventas en ese período" />
      ) : (
        <div className="overflow-x-auto border border-surface-800 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-surface-500 bg-surface-900">
              <tr>
                <th className="text-left font-medium px-3 py-2">Número</th>
                <th className="text-left font-medium px-3 py-2">Fecha</th>
                <th className="text-left font-medium px-3 py-2">Cliente</th>
                <th className="text-left font-medium px-3 py-2">Estado</th>
                <th className="text-left font-medium px-3 py-2">Tipo</th>
                <th className="text-right font-medium px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-surface-900/60">
                  <td className="px-3 py-2">
                    <Link href={`/sistema-tgs/ventas/${row.id}`} className="text-white hover:text-brand-300 font-mono text-xs">
                      {row.numero}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-surface-400 whitespace-nowrap">{tgsFecha(row.fecha_emision)}</td>
                  <td className="px-3 py-2">
                    {row.cliente_id ? (
                      <Link href={`/sistema-tgs/clientes/${row.cliente_id}`} className="text-surface-200 hover:text-brand-300">
                        {row.cliente}
                      </Link>
                    ) : (
                      row.cliente ?? "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <TgsBadge>{row.estado}</TgsBadge>
                  </td>
                  <td className="px-3 py-2 text-surface-400">
                    {row.tipo_documento}
                    {row.tipo_factura ? ` ${row.tipo_factura}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-white">{tgsMoney(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TgsPager meta={meta} onPage={setPage} />
    </TgsPage>
  );
}
