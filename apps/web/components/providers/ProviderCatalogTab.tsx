"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ImageOff, Search } from "lucide-react";
import NodoSpinner from "@/components/NodoSpinner";
import { providersApi, searchApi, type ProductDTO, type Provider } from "@/lib/api";
import { proxyImg } from "@/lib/format";
import { useCart } from "@/lib/cart";
import { inStock, useOfferPricer } from "@/lib/pc-builder/state";

const PAGE = 25;
type Sort = "name" | "price" | "price-desc" | "stock";

/** Catálogo de un distribuidor: buscador, marca, categoría, orden y paginado. */
export default function ProviderCatalogTab({ provider }: { provider: Provider }) {
  const price = useOfferPricer();
  const cart = useCart();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [withStock, setWithStock] = useState(true);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: ProductDTO[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [facets, setFacets] = useState<{ brands: { value: string; count: number }[]; categories: { value: string; count: number }[] }>({ brands: [], categories: [] });
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    providersApi.catalogFacets(provider).then((r) => setFacets(r.data)).catch(() => undefined);
  }, [provider]);
  useEffect(() => {
    const t = setTimeout(() => { setQuery(q); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    searchApi
      .catalog(provider, { q: query, brand, category, sort, includeOutOfStock: !withStock, skip: (page - 1) * PAGE, take: PAGE })
      .then((r) => { if (alive) setData(r.data); })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [provider, query, brand, category, sort, withStock, page]);

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const select = "h-9 rounded-lg border border-surface-700 bg-surface-950 px-2.5 text-sm text-surface-200 focus:border-brand-500 focus:outline-none";

  return (
    <section className="flex flex-col gap-3" data-tour="provider-tab-content" aria-label="Catálogo">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-surface-800 bg-surface-900/60 p-2.5">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, marca o código" className="h-9 w-full rounded-lg border border-surface-700 bg-surface-950 pl-9 pr-3 text-sm text-white placeholder:text-surface-500 focus:border-brand-500 focus:outline-none" />
        </label>
        <label><span className="sr-only">Categoría</span>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className={`${select} max-w-[220px]`}>
            <option value="">Todas las categorías</option>
            {facets.categories.map((c) => <option key={c.value} value={c.value}>{c.value} ({c.count})</option>)}
          </select>
        </label>
        <label><span className="sr-only">Marca</span>
          <select value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }} className={`${select} max-w-[200px]`}>
            <option value="">Todas las marcas</option>
            {facets.brands.map((b) => <option key={b.value} value={b.value}>{b.value} ({b.count})</option>)}
          </select>
        </label>
        <label><span className="sr-only">Ordenar</span>
          <select value={sort} onChange={(e) => { setSort(e.target.value as Sort); setPage(1); }} className={select}>
            <option value="name">Nombre A–Z</option>
            <option value="price">Menor precio</option>
            <option value="price-desc">Mayor precio</option>
            <option value="stock">Más stock</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-2 px-1 text-sm text-surface-300">
          <input type="checkbox" checked={withStock} onChange={(e) => { setWithStock(e.target.checked); setPage(1); }} className="accent-brand-500" /> Con stock
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-surface-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-surface-800 text-left text-[11px] uppercase tracking-wide text-surface-500">
                <th className="px-3 py-2.5 font-semibold">Producto</th>
                <th className="px-3 py-2.5 font-semibold">Marca</th>
                <th className="px-3 py-2.5 font-semibold">Categoría</th>
                <th className="px-3 py-2.5 text-right font-semibold">Precio final</th>
                <th className="px-3 py-2.5 text-right font-semibold">Stock</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((p) => {
                const pr = price(p);
                const key = `${p.provider}:${p.externalId}`;
                return (
                  <tr key={key} className="border-b border-surface-800/70 last:border-0 hover:bg-surface-900/60">
                    <td className="px-3 py-2">
                      <Link href={`/product/${encodeURIComponent(p.provider)}/${encodeURIComponent(p.externalId)}`} className="flex items-center gap-3">
                        <span className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
                          {p.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={proxyImg(p.imageUrl)} alt="" loading="lazy" className="h-full w-full object-contain p-0.5" />
                          ) : <ImageOff className="h-4 w-4 text-surface-400" />}
                        </span>
                        <span className="line-clamp-2 max-w-[380px] text-white hover:text-brand-200">{p.name}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-surface-300">{p.brand || "—"}</td>
                    <td className="px-3 py-2 text-surface-400">{p.category || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-white">{pr ? pr.label : <span className="text-surface-500">Sin precio</span>}</td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums ${inStock(p) ? "text-emerald-300" : "text-surface-500"}`}>{p.stock ?? (inStock(p) ? "Sí" : "—")}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={!pr || !inStock(p)}
                        onClick={() => { cart.add(p, 1); setAdded(key); setTimeout(() => setAdded((k) => (k === key ? null : k)), 1800); }}
                        className="h-8 rounded-lg border border-surface-700 px-3 text-xs font-semibold text-surface-100 hover:border-surface-500 disabled:opacity-40"
                      >
                        {added === key ? "Agregado" : "Al carrito"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {loading && !data && <div className="flex justify-center py-10"><NodoSpinner className="h-5 w-5" /></div>}
        {error && <p className="px-4 py-6 text-center text-sm text-red-300">No se pudo traer el catálogo. Reintentá en un momento.</p>}
        {data && !data.items.length && !loading && <p className="px-4 py-8 text-center text-sm text-surface-400">Nada coincide. Probá con otra marca o categoría, o destildá “Con stock”.</p>}
        <div className="flex items-center justify-between border-t border-surface-800 px-3 py-2.5 text-sm text-surface-400">
          <span>{total ? `${((page - 1) * PAGE + 1).toLocaleString("es-AR")}–${Math.min(total, page * PAGE).toLocaleString("es-AR")} de ${total.toLocaleString("es-AR")}` : "0 productos"}{loading && data ? " · cargando…" : ""}</span>
          <span className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 rounded-lg border border-surface-700 px-3 font-semibold text-surface-200 disabled:opacity-40">Anterior</button>
            <span className="font-mono text-xs">{page} / {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="h-8 rounded-lg border border-surface-700 px-3 font-semibold text-surface-200 disabled:opacity-40">Siguiente</button>
          </span>
        </div>
      </div>
    </section>
  );
}
