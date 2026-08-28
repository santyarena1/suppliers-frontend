"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import TgsPage from "@/components/tgs/TgsPage";
import TgsPager from "@/components/tgs/TgsPager";
import TgsBadge from "@/components/tgs/TgsBadge";
import { TgsButton, TgsEmpty, TgsError, TgsInput, TgsLoading } from "@/components/tgs/TgsUi";
import { dash, tgsMoney } from "@/components/tgs/tgs-format";
import { tgsApi, type TgsCliente, type TgsPageMeta } from "@/lib/tgs-api";

export default function TgsClientesPage() {
  const [q, setQ] = useState("");
  const [needle, setNeedle] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TgsCliente[]>([]);
  const [meta, setMeta] = useState<TgsPageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tgsApi.clientes({ q: needle.trim() || undefined, page, per_page: 20 });
      setItems(res.data.items);
      setMeta(res.data.meta);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [needle, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <TgsPage title="Clientes" subtitle="Agenda de AcuStock">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setNeedle(q);
        }}
        className="flex flex-wrap gap-2"
      >
        <TgsInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, mail o documento" className="flex-1 min-w-[180px]" />
        <TgsButton type="submit">
          <Search className="w-3.5 h-3.5" />
          Buscar
        </TgsButton>
      </form>
      <TgsError err={error} fallback="No se pudieron cargar los clientes" />
      {loading ? (
        <TgsLoading />
      ) : !items.length ? (
        <TgsEmpty text="No hay clientes con ese filtro" />
      ) : (
        <div className="overflow-x-auto border border-surface-800 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-surface-500 bg-surface-900">
              <tr>
                <th className="text-left font-medium px-3 py-2">Cliente</th>
                <th className="text-left font-medium px-3 py-2">CUIT / DNI</th>
                <th className="text-left font-medium px-3 py-2">Teléfono</th>
                <th className="text-left font-medium px-3 py-2">IVA</th>
                <th className="text-right font-medium px-3 py-2">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-surface-900/60">
                  <td className="px-3 py-2">
                    <Link href={`/sistema-tgs/clientes/${row.id}`} className="text-white hover:text-brand-300">
                      {row.display_name}
                    </Link>
                    <p className="text-[11px] text-surface-500">{dash(row.email)}</p>
                  </td>
                  <td className="px-3 py-2 text-surface-300 font-mono text-xs">{dash(row.cuit_dni)}</td>
                  <td className="px-3 py-2 text-surface-300">{dash(row.telefono)}</td>
                  <td className="px-3 py-2">
                    <TgsBadge>{dash(row.tipo_iva)}</TgsBadge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-white">{tgsMoney(row.saldo_cuenta)}</td>
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
