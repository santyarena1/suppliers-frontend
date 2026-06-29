"use client";

import { useState, useCallback, useMemo, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import ProductCard from "@/components/ProductCard";
import AuthGuard from "@/components/AuthGuard";
import PrefsPanel from "@/components/PrefsPanel";
import PriceTag from "@/components/PriceTag";
import AddToCartButton from "@/components/AddToCartButton";
import { searchApi, ALL_PROVIDERS, ProductDTO, Provider } from "@/lib/api";
import { useResults } from "@/lib/results";
import { trackSearch } from "@/lib/history";
import { parsePrice, proxyImg } from "@/lib/format";
import Image from "next/image";
import Link from "next/link";
import {
  Search, SlidersHorizontal, Loader2, X, LayoutGrid,
  List, ArrowUpDown, AlertCircle, Package, Filter,
  ChevronDown, ChevronRight
} from "lucide-react";

type SortKey = "default" | "price_asc" | "price_desc" | "name_asc";
type ViewMode = "grid" | "list" | "grouped";

const PROVIDER_COLOR: Record<string, string> = {
  NEW_BYTES: "text-sky-400", ELIT: "text-purple-400", GRUPO_NUCLEO: "text-emerald-400",
  AIR: "text-cyan-400", NEW_TREE: "text-teal-400", INVID: "text-orange-400",
  GC: "text-red-400", POLYTECH: "text-pink-400", ASHIR: "text-indigo-400",
  HDC: "text-yellow-400", SOLUTION_BOX: "text-lime-400", DISTECNA: "text-violet-400",
  CEVEN: "text-rose-400", DIAPSTORE: "text-blue-400",
};

export default function SearchPageWrapper() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-surface-500 text-sm">Cargando…</div>}>
      <SearchPage />
    </Suspense>
  );
}

function SearchPage() {
  const { setResults: persistResults } = useResults();
  const searchParams = useSearchParams();
  const initialQ = searchParams?.get("q") || "";
  const [query, setQuery] = useState(initialQ);
  const [activeQuery, setActiveQuery] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<Set<Provider>>(new Set(ALL_PROVIDERS));
  const [results, setResults] = useState<ProductDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("price_asc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // In-results filters
  const [refineText, setRefineText] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [hideNoImage, setHideNoImage] = useState(false);
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set());

  // Calculate price bounds for filter
  const priceBounds = useMemo(() => {
    if (results.length === 0) return { min: 0, max: 0 };
    const prices = results.map((r) => parsePrice(r.price)).filter((n) => n > 0);
    if (!prices.length) return { min: 0, max: 0 };
    return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
  }, [results]);

  const toggleProvider = useCallback((p: Provider) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }, []);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setError("");
    setLoading(true);
    setSearched(true);
    setActiveQuery(query.trim());
    setRefineText("");
    setMinPrice("");
    setMaxPrice("");
    try {
      let data: ProductDTO[];
      if (selectedProviders.size === ALL_PROVIDERS.length) {
        const res = await searchApi.all(query.trim());
        data = res.data;
      } else {
        const filters: Record<string, boolean> = {};
        ALL_PROVIDERS.forEach((p) => { filters[p] = selectedProviders.has(p); });
        const res = await searchApi.filtered(query.trim(), filters);
        data = res.data;
      }
      setResults(data);
      persistResults(query.trim(), data);
      trackSearch(query.trim());
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
      setError(e?.response?.data?.message || e?.message || "Error al consultar la API");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  // Apply in-results filters + sort
  const filtered = useMemo(() => {
    let arr = results;
    if (refineText.trim()) {
      const q = refineText.toLowerCase();
      arr = arr.filter((p) => p.name?.toLowerCase().includes(q));
    }
    if (hideNoImage) arr = arr.filter((p) => !!p.imageUrl);
    if (minPrice) {
      const m = parseFloat(minPrice);
      if (!isNaN(m)) arr = arr.filter((p) => parsePrice(p.price) >= m);
    }
    if (maxPrice) {
      const m = parseFloat(maxPrice);
      if (!isNaN(m)) arr = arr.filter((p) => parsePrice(p.price) <= m);
    }
    if (sortBy === "price_asc") arr = [...arr].sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
    if (sortBy === "price_desc") arr = [...arr].sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
    if (sortBy === "name_asc") arr = [...arr].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return arr;
  }, [results, refineText, hideNoImage, minPrice, maxPrice, sortBy]);

  const providerCounts = useMemo(() => {
    const c: Record<string, number> = {};
    filtered.forEach((p) => { c[p.provider] = (c[p.provider] || 0) + 1; });
    return c;
  }, [filtered]);

  const groupedByProvider = useMemo(() => {
    const m: Record<string, ProductDTO[]> = {};
    filtered.forEach((p) => {
      if (!m[p.provider]) m[p.provider] = [];
      m[p.provider].push(p);
    });
    return m;
  }, [filtered]);

  function toggleProviderCollapse(p: string) {
    setCollapsedProviders((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }

  useEffect(() => { setCollapsedProviders(new Set()); }, [activeQuery]);

  const autoSearched = useRef(false);
  useEffect(() => {
    if (initialQ && !autoSearched.current) {
      autoSearched.current = true;
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  const unselectedCount = ALL_PROVIDERS.length - selectedProviders.size;
  const hasInResultsFilter = refineText || minPrice || maxPrice || hideNoImage;

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Navbar />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0 pt-12 lg:pt-0">
          {/* Top bar */}
          <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-6 py-3.5 flex items-center gap-3">
            <form onSubmit={handleSearch} className="flex-1 max-w-xl flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder='Buscar producto...'
                  className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-9 pr-8 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-all"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg px-4 py-2 transition-all flex-shrink-0"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Buscar
              </button>
            </form>

            <div className="flex items-center gap-2 ml-auto">
              <PrefsPanel />

              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-all ${
                  showFilters || unselectedCount > 0
                    ? "border-brand-500 text-brand-400 bg-brand-600/10"
                    : "border-surface-700 text-surface-400 hover:text-surface-200"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {unselectedCount > 0 && (
                  <span className="bg-brand-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] leading-none">
                    {selectedProviders.size}
                  </span>
                )}
              </button>

              <div className="flex border border-surface-700 rounded-lg overflow-hidden">
                {([
                  { mode: "grid" as ViewMode, Icon: LayoutGrid },
                  { mode: "list" as ViewMode, Icon: List },
                  { mode: "grouped" as ViewMode, Icon: Filter },
                ]).map(({ mode, Icon }) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`p-2 transition-colors ${viewMode === mode ? "bg-surface-700 text-white" : "text-surface-500 hover:text-surface-300"}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>
          </header>

          {/* Provider filters bar */}
          {showFilters && (
            <div className="flex-shrink-0 border-b border-surface-800 bg-surface-900 px-6 py-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                  {ALL_PROVIDERS.map((p) => (
                    <button
                      key={p}
                      onClick={() => toggleProvider(p)}
                      className={`text-[11px] font-medium px-2 py-1 rounded border transition-all ${
                        selectedProviders.has(p)
                          ? `${PROVIDER_COLOR[p]} bg-current/10 border-current/30`
                          : "text-surface-600 bg-transparent border-surface-800 hover:border-surface-600 hover:text-surface-400"
                      }`}
                      style={selectedProviders.has(p) ? { borderColor: "currentColor" } : {}}
                    >
                      {p.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setSelectedProviders(new Set(ALL_PROVIDERS))} className="text-xs text-surface-400 hover:text-white">Todos</button>
                  <span className="text-surface-700">·</span>
                  <button onClick={() => setSelectedProviders(new Set())} className="text-xs text-surface-400 hover:text-white">Ninguno</button>
                </div>
              </div>
            </div>
          )}

          {/* Results area */}
          <div className="flex-1 overflow-y-auto">
            {/* In-results filters bar */}
            {searched && !loading && results.length > 0 && (
              <div className="sticky top-0 z-10 bg-surface-950/95 backdrop-blur-sm border-b border-surface-800 px-6 py-2.5 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-600" />
                    <input
                      type="text"
                      value={refineText}
                      onChange={(e) => setRefineText(e.target.value)}
                      placeholder="Refinar resultados..."
                      className="w-full bg-surface-800 border border-surface-700 rounded-md pl-8 pr-2 py-1.5 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <div className="flex items-center gap-1 text-[11px] text-surface-500">
                    <span>USD</span>
                    <input
                      type="number"
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      placeholder={priceBounds.min.toString()}
                      className="w-16 bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500 tabular-nums"
                    />
                    <span>—</span>
                    <input
                      type="number"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      placeholder={priceBounds.max.toString()}
                      className="w-16 bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500 tabular-nums"
                    />
                  </div>

                  <button
                    onClick={() => setHideNoImage(!hideNoImage)}
                    className={`text-[11px] font-medium px-2 py-1.5 rounded-md border transition-all ${
                      hideNoImage
                        ? "border-brand-500 bg-brand-600/15 text-brand-400"
                        : "border-surface-700 text-surface-500 hover:text-surface-300"
                    }`}
                  >
                    Con imagen
                  </button>

                  {hasInResultsFilter && (
                    <button
                      onClick={() => { setRefineText(""); setMinPrice(""); setMaxPrice(""); setHideNoImage(false); }}
                      className="text-[11px] text-surface-500 hover:text-white flex items-center gap-1"
                    >
                      <X className="w-3 h-3" />Limpiar
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-surface-500">
                    <span className="text-surface-200 font-semibold tabular-nums">{filtered.length}</span>
                    {filtered.length !== results.length && (
                      <span className="text-surface-600"> / {results.length}</span>
                    )}
                    {" "}productos · <span className="text-surface-200 font-semibold">{Object.keys(providerCounts).length}</span> prov.
                  </span>
                  <div className="flex items-center gap-1">
                    <ArrowUpDown className="w-3 h-3 text-surface-500" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortKey)}
                      className="bg-transparent text-surface-300 focus:outline-none cursor-pointer"
                    >
                      <option value="default">Defecto</option>
                      <option value="price_asc">Precio ↑</option>
                      <option value="price_desc">Precio ↓</option>
                      <option value="name_asc">Nombre A-Z</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="px-6 py-5">
              {loading && (
                <div className="flex flex-col items-center justify-center py-32 gap-3">
                  <div className="w-10 h-10 rounded-full border-2 border-surface-700 border-t-brand-500 animate-spin" />
                  <p className="text-sm text-surface-400">Consultando proveedores...</p>
                </div>
              )}

              {!loading && error && (
                <div className="flex items-start gap-3 bg-red-500/8 border border-red-500/15 rounded-xl p-5 max-w-lg">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              {!loading && searched && !error && results.length === 0 && (
                <div className="flex flex-col items-center justify-center py-32 gap-2 text-center">
                  <Package className="w-9 h-9 text-surface-700 mb-1" />
                  <p className="text-sm font-medium text-surface-300">Sin resultados</p>
                  <p className="text-xs text-surface-500">Probá con otro término o activá más proveedores</p>
                </div>
              )}

              {!loading && !searched && (
                <div className="flex flex-col items-center justify-center py-32 gap-2 text-center">
                  <Search className="w-9 h-9 text-surface-700 mb-1" />
                  <p className="text-sm font-medium text-surface-300">Realizá una búsqueda</p>
                  <p className="text-xs text-surface-500">
                    Buscá simultáneamente en {ALL_PROVIDERS.length} proveedores mayoristas
                  </p>
                </div>
              )}

              {/* Grid */}
              {!loading && filtered.length > 0 && viewMode === "grid" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {filtered.map((product, i) => (
                    <ProductCard key={`${product.provider}-${product.externalId}-${i}`} product={product} />
                  ))}
                </div>
              )}

              {/* List */}
              {!loading && filtered.length > 0 && viewMode === "list" && (
                <ListView items={filtered} />
              )}

              {/* Grouped */}
              {!loading && filtered.length > 0 && viewMode === "grouped" && (
                <div className="flex flex-col gap-5">
                  {Object.entries(groupedByProvider).sort((a, b) => b[1].length - a[1].length).map(([prov, items]) => {
                    const collapsed = collapsedProviders.has(prov);
                    return (
                      <section key={prov}>
                        <button
                          onClick={() => toggleProviderCollapse(prov)}
                          className="w-full flex items-center gap-2 mb-3 group"
                        >
                          {collapsed ? <ChevronRight className="w-4 h-4 text-surface-500" /> : <ChevronDown className="w-4 h-4 text-surface-500" />}
                          <h3 className={`text-sm font-bold ${PROVIDER_COLOR[prov] || "text-surface-300"}`}>
                            {prov.replace(/_/g, " ")}
                          </h3>
                          <span className="text-xs text-surface-500">{items.length}</span>
                          <div className="flex-1 border-b border-surface-800 ml-2" />
                        </button>
                        {!collapsed && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                            {items.map((p, i) => (
                              <ProductCard key={`${p.provider}-${p.externalId}-${i}`} product={p} />
                            ))}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

function ListView({ items }: { items: ProductDTO[] }) {
  return (
    <div className="flex flex-col divide-y divide-surface-800 border border-surface-800 rounded-xl overflow-hidden">
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-2.5 bg-surface-900 text-[10px] font-semibold text-surface-500 uppercase tracking-wider items-center">
        <span className="w-10" />
        <span>Producto</span>
        <span className="text-right w-28">Proveedor</span>
        <span className="text-right w-28">Precio</span>
        <span className="w-8" />
      </div>
      {items.map((p, i) => (
        <Link
          key={`${p.provider}-${p.externalId}-${i}`}
          href={`/product/${encodeURIComponent(p.provider)}/${encodeURIComponent(p.externalId)}`}
          className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-4 py-3 bg-surface-950 hover:bg-surface-900 transition-colors"
        >
          <div className="w-10 h-10 relative flex-shrink-0 bg-surface-800 rounded overflow-hidden">
            {p.imageUrl
              ? <Image src={proxyImg(p.imageUrl)} alt="" fill className="object-contain" unoptimized />
              : <Package className="w-4 h-4 text-surface-600 absolute inset-0 m-auto" />
            }
          </div>
          <div className="min-w-0">
            <p className="text-sm text-surface-100 font-medium truncate">{p.name}</p>
            {p.externalId && <p className="text-[11px] text-surface-500 font-mono">#{p.externalId}</p>}
          </div>
          <span className={`text-xs font-semibold w-28 text-right ${PROVIDER_COLOR[p.provider] || "text-surface-400"}`}>
            {p.provider.replace(/_/g, " ")}
          </span>
          <div className="w-28 text-right">
            <PriceTag usdPrice={p.price} size="sm" showSecondary />
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <AddToCartButton product={p} variant="icon" />
          </div>
        </Link>
      ))}
    </div>
  );
}
