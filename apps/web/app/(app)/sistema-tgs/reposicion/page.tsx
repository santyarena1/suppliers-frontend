"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, PackagePlus, Search, ShoppingCart, Trash2 } from "lucide-react";
import TgsPage from "@/components/tgs/TgsPage";
import { TgsButton, TgsEmpty, TgsError, TgsInput, TgsLoading } from "@/components/tgs/TgsUi";
import { currentMonthRange, tgsFechaCorta } from "@/components/tgs/tgs-format";
import PriceTag from "@/components/PriceTag";
import ProviderBadge from "@/components/ProviderBadge";
import { PROVIDER_LABELS, searchApi, type ProductDTO, type Provider } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { tgsApi, type TgsProductoVendido } from "@/lib/tgs-api";
import {
  genericSearchQueries,
  hasEntregaDato,
  isPendingEntrega,
  loadRestockDone,
  loadRestockDraft,
  rankRestockHits,
  saleLineKey,
  saveRestockDone,
  saveRestockDraft,
  type RestockDraftLine,
} from "@/lib/tgs-restock";

const month = currentMonthRange();

type Hit = { product: ProductDTO; score: number; inStock: boolean };

export default function TgsReposicionPage() {
  const cart = useCart();
  const [desde, setDesde] = useState(month.desde);
  const [hasta, setHasta] = useState(month.hasta);
  const [applied, setApplied] = useState({ ...month });
  const [includeUnknown, setIncludeUnknown] = useState(false);
  const [items, setItems] = useState<TgsProductoVendido[]>([]);
  const [ventas, setVentas] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [queryUsed, setQueryUsed] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<RestockDraftLine[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [exported, setExported] = useState<string | null>(null);

  useEffect(() => {
    setDraft(loadRestockDraft());
    setDone(loadRestockDone());
  }, []);

  const persistDraft = useCallback((next: RestockDraftLine[]) => {
    setDraft(next);
    saveRestockDraft(next);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all: TgsProductoVendido[] = [];
      let truncatedFlag = false;
      let ventasCount = 0;
      for (let page = 1; page <= 8; page++) {
        const res = await tgsApi.productosVendidos({
          desde: applied.desde,
          hasta: applied.hasta,
          sort: "fecha",
          dir: "desc",
          page,
          per_page: 100,
        });
        all.push(...res.data.items);
        ventasCount = res.data.ventas;
        truncatedFlag = res.data.truncated;
        if (page >= (res.data.meta?.total_pages ?? 1)) break;
      }
      setItems(all);
      setVentas(ventasCount);
      setTruncated(truncatedFlag);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    void load();
  }, [load]);

  const queue = useMemo(() => {
    return items.filter((row) => {
      const key = saleLineKey(row);
      if (done.has(key)) return false;
      if (isPendingEntrega(row)) return true;
      if (includeUnknown && !hasEntregaDato(row)) return true;
      return false;
    });
  }, [items, done, includeUnknown]);

  const selected = queue.find((row) => saleLineKey(row) === selectedKey) ?? queue[0] ?? null;
  const activeKey = selected ? saleLineKey(selected) : null;
  const selectedName = selected?.producto ?? "";
  const unknownCount = useMemo(
    () => items.filter((row) => !done.has(saleLineKey(row)) && !hasEntregaDato(row)).length,
    [items, done],
  );

  useEffect(() => {
    if (!selected) return;
    if (selectedKey !== activeKey) setSelectedKey(activeKey);
  }, [selected, selectedKey, activeKey]);

  useEffect(() => {
    if (!activeKey || !selectedName) {
      setHits([]);
      setQueryUsed("");
      setSearching(false);
      return;
    }
    let alive = true;
    const queries = genericSearchQueries(selectedName);
    setSearching(true);
    setSearchErr(null);
    setHits([]);
    setQueryUsed(queries[0] ?? "");
    if (queries.length === 0) {
      setSearching(false);
      return;
    }
    void (async () => {
      let anyOk = false;
      const batches = await Promise.all(
        queries.slice(0, 4).map((q) =>
          searchApi
            .all(q, { includeOutOfStock: true })
            .then((res) => {
              anyOk = true;
              return res;
            })
            .catch(() => ({ data: [] as ProductDTO[] })),
        ),
      );
      if (!alive) return;
      const merged: ProductDTO[] = [];
      for (const res of batches) {
        merged.push(...(Array.isArray(res.data) ? res.data : []));
      }
      setHits(rankRestockHits(selectedName, merged));
      if (!anyOk) setSearchErr("No se pudo buscar en los distros");
      setSearching(false);
    })();
    return () => {
      alive = false;
    };
  }, [activeKey, selectedName]);

  function addHit(hit: Hit) {
    if (!selected) return;
    const saleKey = saleLineKey(selected);
    persistDraft([
      ...draft.filter((line) => line.saleKey !== saleKey),
      {
        saleKey,
        ventaNumero: selected.venta_numero,
        soldName: selected.producto,
        soldQty: selected.cantidad,
        product: hit.product,
        qty: selected.cantidad || 1,
      },
    ]);
  }

  function skipSelected() {
    if (!selected) return;
    const key = saleLineKey(selected);
    const next = new Set(done);
    next.add(key);
    setDone(next);
    saveRestockDone(next);
    persistDraft(draft.filter((line) => line.saleKey !== key));
  }

  function exportDraft() {
    if (draft.length === 0) return;
    const count = draft.length;
    const nextDone = new Set(done);
    for (const line of draft) {
      cart.add(line.product, line.qty);
      nextDone.add(line.saleKey);
    }
    setDone(nextDone);
    saveRestockDone(nextDone);
    persistDraft([]);
    setExported(`Pasaron ${count} ítems al carrito de Nodo, agrupados por distro.`);
  }

  const byProvider = useMemo(() => {
    const map = new Map<string, RestockDraftLine[]>();
    for (const line of draft) {
      const list = map.get(line.product.provider) ?? [];
      list.push(line);
      map.set(line.product.provider, list);
    }
    return [...map.entries()];
  }, [draft]);

  return (
    <TgsPage
      title="Reposición"
      subtitle="Lo vendido en AcuStock · sugerencias de compra en tus distros"
      wide
      action={
        <TgsButton disabled={draft.length === 0} onClick={exportDraft}>
          <ShoppingCart className="w-3.5 h-3.5" />
          Exportar al carrito ({draft.length})
        </TgsButton>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ desde, hasta });
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
        <label className="flex items-center gap-2 text-xs text-surface-300 pb-2">
          <input type="checkbox" checked={includeUnknown} onChange={(e) => setIncludeUnknown(e.target.checked)} />
          Incluir líneas sin estado de entrega
        </label>
        <TgsButton type="submit">
          <Search className="w-3.5 h-3.5" />
          Actualizar
        </TgsButton>
      </form>

      <p className="text-xs text-surface-500">
        Solo entran las líneas con entrega pendiente de verdad. Si AcuStock no mandó el estado, no se asume pendiente.
      </p>

      <TgsError err={error} fallback="No se pudieron leer las ventas de AcuStock" />
      {exported && <p className="text-xs rounded-md px-3 py-2 bg-emerald-500/10 text-emerald-400">{exported}</p>}
      {truncated && (
        <p className="text-[11px] text-amber-400">
          Se tomaron las últimas {ventas} ventas del período. Acotá las fechas para ver el resto.
        </p>
      )}

      {loading ? (
        <TgsLoading />
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4 items-start">
          <section className="border border-surface-800 rounded-xl overflow-hidden bg-surface-900">
            <div className="px-4 py-3 border-b border-surface-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Por reponer</h2>
              <span className="text-[11px] text-surface-500 tabular-nums">{queue.length}</span>
            </div>
            {queue.length === 0 ? (
              <div className="px-4 py-6 flex flex-col gap-2">
                <TgsEmpty text="No hay pendientes de entrega en este período" />
                {unknownCount > 0 && !includeUnknown && (
                  <p className="text-[11px] text-surface-500 text-center pb-4">
                    Hay {unknownCount} líneas sin estado de AcuStock. No se asumen pendientes: marcá el checkbox
                    para incluirlas.
                  </p>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-surface-800 max-h-[640px] overflow-y-auto">
                {queue.map((row) => {
                  const key = saleLineKey(row);
                  const active = key === activeKey;
                  const inDraft = draft.some((line) => line.saleKey === key);
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(key)}
                        className={`w-full text-left px-4 py-3 ${active ? "bg-brand-600/10" : "hover:bg-surface-800/60"}`}
                      >
                        <p className="text-sm text-white uppercase truncate">{row.producto}</p>
                        <p className="text-[11px] text-surface-500 mt-0.5 flex flex-wrap gap-x-2">
                          <span>Venta {row.venta_numero}</span>
                          <span>{tgsFechaCorta(row.fecha_emision)}</span>
                          <span>×{row.cantidad}</span>
                          {row.estado_entrega ? <span>{row.estado_entrega}</span> : <span>Sin estado</span>}
                          {inDraft && <span className="text-emerald-400">En el armado</span>}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="flex flex-col gap-4">
            <section className="border border-surface-800 rounded-xl overflow-hidden bg-surface-900">
              <div className="px-4 py-3 border-b border-surface-800">
                <h2 className="text-sm font-semibold text-white">Dónde comprarlo</h2>
                {selected && (
                  <p className="text-[11px] text-surface-500 mt-0.5 truncate">
                    Buscando {queryUsed ? `“${queryUsed}”` : selected.producto}
                  </p>
                )}
              </div>
              {!selected ? (
                <TgsEmpty text="Elegí una línea a la izquierda" />
              ) : searching && hits.length === 0 ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
                </div>
              ) : searchErr ? (
                <p className="text-xs text-red-400 px-4 py-6">{searchErr}</p>
              ) : hits.length === 0 ? (
                <div className="px-4 py-6 flex flex-col gap-2">
                  <p className="text-sm text-surface-400">No hubo coincidencias útiles en tus distros.</p>
                  <Link
                    href={`/search?q=${encodeURIComponent(queryUsed || selected.producto)}`}
                    className="text-xs text-brand-400"
                  >
                    Abrir en búsqueda
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-surface-800 max-h-[360px] overflow-y-auto">
                  {hits.map((hit) => (
                    <li key={`${hit.product.provider}:${hit.product.externalId}`} className="px-4 py-3 flex gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">{hit.product.name}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <ProviderBadge
                            provider={hit.product.provider}
                            label={PROVIDER_LABELS[hit.product.provider as Provider]}
                            variant="inline"
                            size="sm"
                          />
                          <span className="text-[11px] text-surface-500 tabular-nums">
                            {Math.round(hit.score * 100)}% parecido
                          </span>
                          {!hit.inStock && <span className="text-[11px] text-amber-400">Sin stock</span>}
                          <PriceTag product={hit.product} size="sm" />
                        </div>
                      </div>
                      <TgsButton onClick={() => addHit(hit)}>
                        <PackagePlus className="w-3.5 h-3.5" />
                        Sumar
                      </TgsButton>
                    </li>
                  ))}
                </ul>
              )}
              {selected && (
                <div className="px-4 py-2 border-t border-surface-800 flex justify-end">
                  <button type="button" onClick={skipSelected} className="text-[11px] text-surface-500 hover:text-white">
                    Saltar esta línea
                  </button>
                </div>
              )}
            </section>

            <section className="border border-surface-800 rounded-xl overflow-hidden bg-surface-900">
              <div className="px-4 py-3 border-b border-surface-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Armado por distro</h2>
                <span className="text-[11px] text-surface-500">{draft.length} ítems</span>
              </div>
              {draft.length === 0 ? (
                <TgsEmpty text="Las coincidencias que sumes se agrupan acá, sin tocar el carrito de Nodo." />
              ) : (
                <div className="divide-y divide-surface-800">
                  {byProvider.map(([provider, lines]) => (
                    <div key={provider} className="px-4 py-3">
                      <p className="text-xs font-semibold text-surface-300 mb-2">
                        {PROVIDER_LABELS[provider as Provider] ?? provider}
                      </p>
                      <ul className="flex flex-col gap-2">
                        {lines.map((line) => (
                          <li key={line.saleKey} className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-white truncate">{line.product.name}</p>
                              <p className="text-[11px] text-surface-500 truncate">
                                ×{line.qty} · de {line.soldName} · {line.ventaNumero}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => persistDraft(draft.filter((d) => d.saleKey !== line.saleKey))}
                              className="text-surface-500 hover:text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              {draft.length > 0 && (
                <div className="px-4 py-3 border-t border-surface-800">
                  <TgsButton onClick={exportDraft} className="w-full">
                    <ShoppingCart className="w-3.5 h-3.5" />
                    Pasar al carrito de Nodo
                  </TgsButton>
                  <p className="text-[11px] text-surface-500 mt-2">
                    Ahí queda el carrito normal, por distribuidor, para confirmar cuando quieras.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </TgsPage>
  );
}
