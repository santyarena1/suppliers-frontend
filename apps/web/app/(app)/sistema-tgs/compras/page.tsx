"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TgsPage from "@/components/tgs/TgsPage";
import TgsPager from "@/components/tgs/TgsPager";
import TgsBadge from "@/components/tgs/TgsBadge";
import { TgsEmpty, TgsError, TgsLoading } from "@/components/tgs/TgsUi";
import { tgsFecha, tgsMoney } from "@/components/tgs/tgs-format";
import { tgsApi, type TgsCompra, type TgsPageMeta } from "@/lib/tgs-api";

export default function TgsComprasPage() {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TgsCompra[]>([]);
  const [meta, setMeta] = useState<TgsPageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tgsApi.compras({ page, per_page: 20 });
      setItems(res.data.items);
      setMeta(res.data.meta);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <TgsPage title="Compras" subtitle="Ingresos de mercadería">
      <TgsError err={error} fallback="No se pudieron cargar las compras" />
      {loading ? (
        <TgsLoading />
      ) : !items.length ? (
        <TgsEmpty text="No hay compras" />
      ) : (
        <div className="overflow-x-auto border border-surface-800 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-surface-500 bg-surface-900">
              <tr>
                <th className="text-left font-medium px-3 py-2">Número</th>
                <th className="text-left font-medium px-3 py-2">Fecha</th>
                <th className="text-left font-medium px-3 py-2">Proveedor</th>
                <th className="text-left font-medium px-3 py-2">Estado</th>
                <th className="text-right font-medium px-3 py-2">Total</th>
                <th className="text-right font-medium px-3 py-2">ARS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-surface-900/60">
                  <td className="px-3 py-2">
                    <Link href={`/sistema-tgs/compras/${row.id}`} className="text-white hover:text-brand-300 font-mono text-xs">
                      {row.numero}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-surface-400 whitespace-nowrap">{tgsFecha(row.fecha_emision)}</td>
                  <td className="px-3 py-2">
                    {row.proveedor_id ? (
                      <Link href={`/sistema-tgs/ctacte?tipo=proveedor&id=${row.proveedor_id}`} className="text-surface-200 hover:text-brand-300">
                        {row.proveedor}
                      </Link>
                    ) : (
                      row.proveedor ?? "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <TgsBadge>{row.estado}</TgsBadge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-white">{tgsMoney(row.total, row.moneda)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-surface-300">{tgsMoney(row.total_ars)}</td>
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
