"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import TgsPage from "@/components/tgs/TgsPage";
import TgsPager from "@/components/tgs/TgsPager";
import TgsBadge from "@/components/tgs/TgsBadge";
import { TgsButton, TgsEmpty, TgsError, TgsInput, TgsLoading, TgsSelect } from "@/components/tgs/TgsUi";
import { dash } from "@/components/tgs/tgs-format";
import { tgsApi, type TgsPageMeta, type TgsRma } from "@/lib/tgs-api";

export default function TgsRmaPage() {
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [applied, setApplied] = useState({ q: "", estado: "" });
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TgsRma[]>([]);
  const [meta, setMeta] = useState<TgsPageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tgsApi.rma({
        q: applied.q.trim() || undefined,
        estado: applied.estado || undefined,
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
  }, [applied, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <TgsPage
      title="RMA"
      subtitle="Garantías en recepción"
      action={
        <Link href="/sistema-tgs/rma/nuevo">
          <TgsButton>
            <Plus className="w-3.5 h-3.5" />
            Nuevo RMA
          </TgsButton>
        </Link>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setApplied({ q, estado });
        }}
        className="flex flex-wrap gap-2"
      >
        <TgsInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cliente o producto" className="flex-1 min-w-[160px]" />
        <TgsSelect value={estado} onChange={(e) => setEstado(e.target.value)} className="w-44">
          <option value="">Todos los estados</option>
          <option value="recepcion">recepcion</option>
          <option value="en_proceso">en_proceso</option>
          <option value="cerrado">cerrado</option>
        </TgsSelect>
        <TgsButton type="submit">
          <Search className="w-3.5 h-3.5" />
          Filtrar
        </TgsButton>
      </form>
      {error && <TgsError err={error} fallback="No se pudieron cargar los RMA" />}
      {loading ? (
        <TgsLoading />
      ) : !items.length ? (
        <TgsEmpty text="No hay casos de RMA" />
      ) : (
        <div className="overflow-x-auto border border-surface-800 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-surface-500 bg-surface-900">
              <tr>
                <th className="text-left font-medium px-3 py-2">Caso</th>
                <th className="text-left font-medium px-3 py-2">Cliente</th>
                <th className="text-left font-medium px-3 py-2">Producto</th>
                <th className="text-left font-medium px-3 py-2">Estado</th>
                <th className="text-left font-medium px-3 py-2">Falla</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-surface-900/60">
                  <td className="px-3 py-2">
                    <Link href={`/sistema-tgs/rma/${row.id}`} className="text-white hover:text-brand-300 font-mono text-xs">
                      {dash(row.numero) !== "—" ? dash(row.numero) : `#${row.id}`}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {row.cliente_id ? (
                      <Link href={`/sistema-tgs/clientes/${row.cliente_id}`} className="text-surface-200 hover:text-brand-300">
                        {dash(row.cliente)}
                      </Link>
                    ) : (
                      dash(row.cliente)
                    )}
                  </td>
                  <td className="px-3 py-2 text-surface-300">{dash(row.producto_nombre)}</td>
                  <td className="px-3 py-2">
                    <TgsBadge>{row.estado}</TgsBadge>
                  </td>
                  <td className="px-3 py-2 text-surface-400 max-w-[240px] truncate">{dash(row.falla_reportada)}</td>
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
