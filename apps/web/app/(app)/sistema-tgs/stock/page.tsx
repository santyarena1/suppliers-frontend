"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Search } from "lucide-react";
import TgsPage from "@/components/tgs/TgsPage";
import TgsPager from "@/components/tgs/TgsPager";
import TgsStockEditModal from "@/components/tgs/TgsStockEditModal";
import { TgsButton, TgsEmpty, TgsError, TgsInput, TgsLoading } from "@/components/tgs/TgsUi";
import { tgsMoney } from "@/components/tgs/tgs-format";
import { tgsApi, type TgsPageMeta, type TgsStockItem } from "@/lib/tgs-api";

export default function TgsStockPage() {
  const [q, setQ] = useState("");
  const [sku, setSku] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TgsStockItem[]>([]);
  const [meta, setMeta] = useState<TgsPageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<TgsStockItem | null>(null);
  const [needle, setNeedle] = useState({ q: "", sku: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tgsApi.stock({
        q: needle.q.trim() || undefined,
        sku: needle.sku.trim() || undefined,
        page,
        per_page: 50,
      });
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

  function search(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setNeedle({ q, sku });
  }

  function onSaved(updated: TgsStockItem) {
    setItems((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
  }

  return (
    <TgsPage title="Stock" subtitle="Disponible = depósito + catálogo − comprometido">
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <TgsInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre"
          className="flex-1 min-w-[160px]"
        />
        <TgsInput
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="SKU exacto"
          className="w-44"
        />
        <TgsButton type="submit">
          <Search className="w-3.5 h-3.5" />
          Buscar
        </TgsButton>
      </form>
      {error && <TgsError err={error} fallback="No se pudo cargar el stock" />}
      {loading ? (
        <TgsLoading />
      ) : !items.length ? (
        <TgsEmpty text="No hay productos con ese filtro" />
      ) : (
        <div className="overflow-x-auto border border-surface-800 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-surface-500 bg-surface-900">
              <tr>
                <th className="text-left font-medium px-3 py-2">SKU</th>
                <th className="text-left font-medium px-3 py-2">Producto</th>
                <th className="text-left font-medium px-3 py-2">Marca</th>
                <th className="text-right font-medium px-3 py-2">Depósito</th>
                <th className="text-right font-medium px-3 py-2">Catálogo</th>
                <th className="text-right font-medium px-3 py-2">Comprom.</th>
                <th className="text-right font-medium px-3 py-2">Disponible</th>
                <th className="text-right font-medium px-3 py-2">Precio</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-surface-900/60">
                  <td className="px-3 py-2 font-mono text-xs text-surface-400 whitespace-nowrap">{row.sku}</td>
                  <td className="px-3 py-2">
                    <Link href={`/sistema-tgs/stock/${encodeURIComponent(row.sku)}`} className="text-white hover:text-brand-300">
                      {row.nombre}
                    </Link>
                    {row.categoria && <p className="text-[11px] text-surface-500">{row.categoria}</p>}
                  </td>
                  <td className="px-3 py-2 text-surface-400">{row.marca ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.stock_deposito}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.stock_catalogo}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.comprometido}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-white font-medium">{row.disponible}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {tgsMoney(row.precio, row.moneda)}
                    {row.precio_manual && <span className="block text-[10px] text-amber-400">manual</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(row)}
                      className="p-1.5 rounded-md text-surface-400 hover:text-white hover:bg-surface-800"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TgsPager meta={meta} onPage={setPage} />
      {editing && <TgsStockEditModal item={editing} onClose={() => setEditing(null)} onSaved={onSaved} />}
    </TgsPage>
  );
}
