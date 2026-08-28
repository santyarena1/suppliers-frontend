"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Clock, Search, Store, Truck, X } from "lucide-react";
import TgsPage from "@/components/tgs/TgsPage";
import TgsPager from "@/components/tgs/TgsPager";
import { TgsButton, TgsEmpty, TgsError, TgsInput, TgsLoading, TgsSelect } from "@/components/tgs/TgsUi";
import { currentMonthRange, tgsFechaCorta, tgsLocalLabel, tgsMoney2 } from "@/components/tgs/tgs-format";
import { tgsApi, type TgsPageMeta, type TgsProductoVendido } from "@/lib/tgs-api";

const month = currentMonthRange();

type SortKey = "fecha" | "venta" | "cliente" | "producto" | "cantidad" | "precio" | "subtotal" | "estado" | "entrega";

export default function TgsProductosVendidosPage() {
  const [desde, setDesde] = useState(month.desde);
  const [hasta, setHasta] = useState(month.hasta);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [entrega, setEntrega] = useState("");
  const [applied, setApplied] = useState({ ...month, q: "", estado: "", entrega: "" });
  const [sort, setSort] = useState<SortKey>("fecha");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TgsProductoVendido[]>([]);
  const [meta, setMeta] = useState<TgsPageMeta | null>(null);
  const [ventas, setVentas] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tgsApi.productosVendidos({
        desde: applied.desde,
        hasta: applied.hasta,
        estado: applied.estado || undefined,
        entrega: applied.entrega || undefined,
        q: applied.q.trim() || undefined,
        sort,
        dir,
        page,
        per_page: 50,
      });
      setItems(res.data.items);
      setMeta(res.data.meta);
      setVentas(res.data.ventas);
      setTruncated(res.data.truncated);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [applied, sort, dir, page]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((prev) => (prev === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "fecha" ? "desc" : "asc");
    }
    setPage(1);
  }

  const rangeLabel = `${tgsFechaCorta(applied.desde)} — ${tgsFechaCorta(applied.hasta)}`;

  return (
    <TgsPage
      title="Productos vendidos"
      subtitle="Detalle por venta · estado de entrega del ítem"
      wide
      action={<span className="hidden sm:block text-xs text-surface-400 tabular-nums">{rangeLabel}</span>}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setApplied({ desde, hasta, q, estado, entrega });
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
          Entrega
          <TgsSelect value={entrega} onChange={(e) => setEntrega(e.target.value)}>
            <option value="">Todas</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Listo">Listo</option>
            <option value="Enviado">Enviado</option>
            <option value="Entregado">Entregado</option>
          </TgsSelect>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-surface-500">
          Cobro
          <TgsSelect value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="pagada">pagada</option>
            <option value="completada">completada</option>
            <option value="pendiente">pendiente</option>
            <option value="anulada">anulada</option>
          </TgsSelect>
        </label>
        <TgsInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Producto, cliente, venta, proveedor o etiqueta"
          className="flex-1 min-w-[180px]"
        />
        <TgsButton type="submit">
          <Search className="w-3.5 h-3.5" />
          Ver detalle
        </TgsButton>
      </form>
      <TgsError err={error} fallback="No se pudo armar el detalle por venta" />
      {truncated && (
        <p className="text-[11px] text-amber-400">
          Se tomaron las últimas {ventas} ventas del período. Acotá las fechas para ver el resto.
        </p>
      )}
      {loading ? (
        <div>
          <TgsLoading />
          <p className="-mt-10 mb-8 text-center text-[11px] text-surface-500">
            La primera carga del mes puede tardar unos segundos.
          </p>
        </div>
      ) : !items.length ? (
        <TgsEmpty text="No hay productos vendidos en ese período" />
      ) : (
        <div className="overflow-x-auto border border-surface-800 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-surface-500 bg-surface-900">
              <tr>
                <SortTh label="Fecha" k="fecha" sort={sort} dir={dir} onSort={toggleSort} />
                <SortTh label="Venta" k="venta" sort={sort} dir={dir} onSort={toggleSort} />
                <th className="text-left font-medium px-3 py-2">Local</th>
                <SortTh label="Cliente" k="cliente" sort={sort} dir={dir} onSort={toggleSort} />
                <SortTh label="Producto" k="producto" sort={sort} dir={dir} onSort={toggleSort} />
                <th className="text-left font-medium px-3 py-2">Proveedor</th>
                <th className="text-left font-medium px-3 py-2">Etiquetas</th>
                <SortTh label="Cant" k="cantidad" sort={sort} dir={dir} onSort={toggleSort} align="right" />
                <SortTh label="Precio" k="precio" sort={sort} dir={dir} onSort={toggleSort} align="right" />
                <SortTh label="Subtotal" k="subtotal" sort={sort} dir={dir} onSort={toggleSort} align="right" />
                <SortTh label="Estado" k="entrega" sort={sort} dir={dir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {items.map((row) => (
                <tr key={`${row.venta_id}-${row.item_id}`} className="hover:bg-surface-900/60">
                  <td className="px-3 py-2.5 text-surface-300 whitespace-nowrap tabular-nums">
                    {tgsFechaCorta(row.fecha_emision)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/sistema-tgs/ventas/${row.venta_id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 text-sky-300 px-2.5 py-0.5 text-[11px] font-medium hover:bg-sky-500/25"
                    >
                      <span className="text-sky-400/70 font-normal">Venta</span>
                      {row.venta_numero}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 text-sky-200 px-2 py-0.5 text-[11px] whitespace-nowrap">
                      <Store className="w-3 h-3" />
                      {tgsLocalLabel(row.local_id)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.cliente_id ? (
                      <Link
                        href={`/sistema-tgs/clientes/${row.cliente_id}`}
                        className="block max-w-[140px] truncate text-surface-200 hover:text-brand-300"
                        title={row.cliente ?? undefined}
                      >
                        {row.cliente}
                      </Link>
                    ) : (
                      <span className="block max-w-[140px] truncate" title={row.cliente ?? undefined}>
                        {row.cliente ?? "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-white">
                    <span className="block max-w-[280px] truncate uppercase" title={row.producto}>
                      {row.producto}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center rounded-md border border-surface-700 bg-surface-900 px-2 py-0.5 text-[11px] whitespace-nowrap text-surface-300">
                      {row.proveedor || "— Sin prov."}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.etiquetas?.length ? (
                      <span className="text-[11px] text-surface-300">{row.etiquetas.join(", ")}</span>
                    ) : (
                      <span className="text-[11px] text-surface-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-surface-200">{row.cantidad}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-surface-200 whitespace-nowrap">
                    {tgsMoney2(row.precio_unitario)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-white whitespace-nowrap">
                    {tgsMoney2(row.subtotal)}
                  </td>
                  <td className="px-3 py-2.5">
                    <EstadoChip estado={row.estado_entrega || "Pendiente"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && meta && (
        <p className="text-[11px] text-surface-500">
          {meta.total.toLocaleString("es-AR")} líneas · {ventas.toLocaleString("es-AR")} ventas
        </p>
      )}
      <TgsPager meta={meta} onPage={setPage} />
    </TgsPage>
  );
}

function EstadoChip({ estado }: { estado: string }) {
  const key = estado.toLowerCase();
  const Icon =
    ["entregado", "completada", "cerrado"].some((s) => key.includes(s))
      ? Check
      : ["anulado", "cancelad", "rechaz"].some((s) => key.includes(s))
        ? X
        : ["listo", "despach", "envio", "enviado"].some((s) => key.includes(s))
          ? Truck
          : Clock;
  const tone =
    Icon === Check
      ? "bg-emerald-600 text-white"
      : Icon === X
        ? "bg-red-600 text-white"
        : Icon === Truck
          ? "bg-sky-600 text-white"
          : "bg-surface-700 text-surface-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${tone}`}>
      <Icon className="w-3 h-3" />
      {estado}
    </span>
  );
}

function SortTh({
  label,
  k,
  sort,
  dir,
  onSort,
  align,
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "right";
}) {
  const active = sort === k;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`font-medium px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 ${active ? "text-white" : "text-surface-500 hover:text-surface-300"} ${
          align === "right" ? "ml-auto" : ""
        }`}
      >
        {label}
        <Icon className={`w-3 h-3 ${active && k === "fecha" && dir === "desc" ? "text-red-400" : ""}`} />
      </button>
    </th>
  );
}
