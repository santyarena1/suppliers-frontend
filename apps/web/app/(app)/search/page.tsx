"use client";

import { useState, useCallback, useMemo, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import PrefsPanel from "@/components/PrefsPanel";
import PriceTag from "@/components/PriceTag";
import AddToCartButton from "@/components/AddToCartButton";
import SearchLanding from "@/components/search/SearchLanding";
import { searchApi, catalogApi, ProductDTO, Provider } from "@/lib/api";
import { useMyProviders } from "@/lib/myProviders";
import { useResults } from "@/lib/results";
import { trackSearch } from "@/lib/history";
import { parsePrice, proxyImg } from "@/lib/format";
import { PROVIDER_TEXT_COLOR as PROVIDER_COLOR } from "@/lib/providerColors";
import Image from "next/image";
import Link from "next/link";
import {
  Search, SlidersHorizontal, Loader2, X, LayoutGrid,
  List, ArrowUpDown, AlertCircle, Package, Filter,
  ChevronDown, ChevronRight,
} from "lucide-react";

type SortKey = "default" | "price_asc" | "price_desc" | "name_asc";
type ViewMode = "grid" | "list" | "grouped";

export default function SearchPageWrapper() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-surface-500 text-sm">Cargando…</div>}>
      <SearchPage />
    </Suspense>
  );
}

function SearchPage() {
  const router = useRouter();
  const {
    setResults: persistResults,
    results: storedResults,
    query: storedQuery,
    hydrated,
    getUiState,
    setUiState,
    clearResults,
  } = useResults();
  const searchParams = useSearchParams();
  const initialQ = searchParams?.get("q") || "";
  const [query, setQuery] = useState(initialQ);
  const [activeQuery, setActiveQuery] = useState("");
  // Solo se puede buscar en los proveedores con los que el comercio está vinculado:
  // del resto no hay catálogo, y ni siquiera tiene por qué saber que existen.
  const { providers: myProviders } = useMyProviders();
  const searchable = myProviders.filter((p) => p.linked);
  const [selectedProviders, setSelectedProviders] = useState<Set<Provider>>(new Set());
  const [touchedFilters, setTouchedFilters] = useState(false);
  const [results, setResults] = useState<ProductDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("price_asc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const lastUrlQRef = useRef<string | null>(null);

  function syncSearchUrl(q: string) {
    const trimmed = q.trim();
    const next = trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search";
    const current = typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "";
    lastUrlQRef.current = trimmed;
    if (current !== next) {
      router.replace(next, { scroll: false });
    }
  }

  async function handleCategoryClick(category: string) {
    setError("");
    setLoading(true);
    setSearched(true);
    setQuery(category);
    setActiveQuery(category);
    setRefineText("");
    setMinPrice("");
    setMaxPrice("");
    try {
      const res = await catalogApi.byCategory(category);
      const data = Array.isArray(res.data) ? res.data : [];
      setResults(data);
      persistResults(category, data);
      setUiState({ refineText: "", minPrice: "", maxPrice: "", hideNoImage: false, scrollTop: 0 });
      syncSearchUrl(category);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e?.response?.data?.message || e?.message || "Error al consultar la categoría");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

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
    setTouchedFilters(true);
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }, []);

  async function runSearch(term: string, opts?: { track?: boolean }) {
    const q = term.trim();
    if (!q) return;
    setError("");
    setLoading(true);
    setSearched(true);
    setQuery(q);
    setActiveQuery(q);
    setRefineText("");
    setMinPrice("");
    setMaxPrice("");
    try {
      const res = await searchApi.all(q, {
        providers: searchable.filter((p) => selectedProviders.has(p.provider)).map((p) => p.provider),
      });
      const data = res.data;
      setResults(data);
      persistResults(q, data);
      setUiState({ refineText: "", minPrice: "", maxPrice: "", hideNoImage: false, scrollTop: 0 });
      if (opts?.track !== false) trackSearch(q);
      syncSearchUrl(q);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
      setError(e?.response?.data?.message || e?.message || "Error al consultar la API");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    await runSearch(query);
  }

  function resetToHome() {
    clearResults();
    setQuery("");
    setActiveQuery("");
    setResults([]);
    setSearched(false);
    setError("");
    setRefineText("");
    setMinPrice("");
    setMaxPrice("");
    setHideNoImage(false);
    setLoading(false);
    syncSearchUrl("");
  }

  function restoreFromStore(q: string, r: ProductDTO[]) {
    const ui = getUiState();
    setQuery(q);
    setActiveQuery(q);
    setResults(r);
    setSearched(true);
    setError("");
    if (ui?.sortBy) setSortBy(ui.sortBy);
    if (ui?.viewMode) setViewMode(ui.viewMode);
    if (typeof ui?.refineText === "string") setRefineText(ui.refineText);
    if (typeof ui?.minPrice === "string") setMinPrice(ui.minPrice);
    if (typeof ui?.maxPrice === "string") setMaxPrice(ui.maxPrice);
    if (typeof ui?.hideNoImage === "boolean") setHideNoImage(ui.hideNoImage);
    syncSearchUrl(q);
    // Restaurar scroll después del paint
    requestAnimationFrame(() => {
      const top = ui?.scrollTop ?? 0;
      if (scrollRef.current && top > 0) {
        scrollRef.current.scrollTop = top;
      }
    });
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

  // Al entrar, todos los proveedores del comercio están seleccionados. Si la lista
  // llega después, se completa sola; si ya tocaste los filtros, no se pisa.
  useEffect(() => {
    if (touchedFilters || searchable.length === 0) return;
    setSelectedProviders(new Set(searchable.map((p) => p.provider)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchable.length, touchedFilters]);

  // Restaurar la última búsqueda al volver (producto → atrás, o /search sin q).
  useEffect(() => {
    if (!hydrated || restoredRef.current) return;
    restoredRef.current = true;

    const urlQ = initialQ.trim();
    const cachedQ = storedQuery.trim();
    const sameAsCache =
      !!urlQ &&
      !!cachedQ &&
      urlQ.toLowerCase() === cachedQ.toLowerCase() &&
      storedResults.length > 0;

    if (sameAsCache || (!urlQ && cachedQ && storedResults.length > 0)) {
      restoreFromStore(urlQ || cachedQ, storedResults);
      return;
    }

    lastUrlQRef.current = urlQ;
    if (urlQ) {
      void runSearch(urlQ, { track: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Si cambia ?q= desde afuera (home, link) y no es un sync nuestro, buscar de nuevo.
  // Si ?q= queda vacío (sidebar → Búsqueda / clear), volver al landing.
  useEffect(() => {
    if (!hydrated || !restoredRef.current) return;
    const urlQ = initialQ.trim();
    if (urlQ === (lastUrlQRef.current ?? "")) return;
    lastUrlQRef.current = urlQ;
    if (!urlQ) {
      setQuery("");
      setActiveQuery("");
      setResults([]);
      setSearched(false);
      setError("");
      setRefineText("");
      setMinPrice("");
      setMaxPrice("");
      setHideNoImage(false);
      return;
    }
    if (urlQ.toLowerCase() === activeQuery.trim().toLowerCase() && results.length > 0) return;
    void runSearch(urlQ, { track: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  // Si el sidebar limpia el store estando en /search, salir a landing.
  useEffect(() => {
    if (!hydrated || !restoredRef.current) return;
    if (storedQuery || storedResults.length > 0) return;
    if (!searched && results.length === 0) return;
    const urlQ = initialQ.trim();
    if (urlQ) return;
    setQuery("");
    setActiveQuery("");
    setResults([]);
    setSearched(false);
    setError("");
    setRefineText("");
    setMinPrice("");
    setMaxPrice("");
    setHideNoImage(false);
    lastUrlQRef.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, storedQuery, storedResults.length]);

  // Persistir filtros / vista / scroll mientras hay una búsqueda activa.
  useEffect(() => {
    if (!searched) return;
    setUiState({
      sortBy,
      viewMode,
      refineText,
      minPrice,
      maxPrice,
      hideNoImage,
    });
  }, [searched, sortBy, viewMode, refineText, minPrice, maxPrice, hideNoImage, setUiState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !searched) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setUiState({ scrollTop: el.scrollTop });
        ticking = false;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [searched, setUiState]);

  const unselectedCount = searchable.length - selectedProviders.size;
  const hasInResultsFilter = refineText || minPrice || maxPrice || hideNoImage;

  return (
    <>
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
                  <button
                    type="button"
                    onClick={() => {
                      if (searched) resetToHome();
                      else setQuery("");
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
                    title={searched ? "Volver al inicio" : "Limpiar"}
                  >
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
                  {searchable.length === 0 && (
                    <span className="text-xs text-surface-500">
                      Todavía no estás conectado con ningún proveedor.
                    </span>
                  )}
                  {searchable.map(({ provider, name }) => (
                    <button
                      key={provider}
                      onClick={() => toggleProvider(provider)}
                      className={`text-[11px] font-medium px-2 py-1 rounded border transition-all ${
                        selectedProviders.has(provider)
                          ? `${PROVIDER_COLOR[provider]} bg-current/10 border-current/30`
                          : "text-surface-600 bg-transparent border-surface-800 hover:border-surface-600 hover:text-surface-400"
                      }`}
                      style={selectedProviders.has(provider) ? { borderColor: "currentColor" } : {}}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => { setTouchedFilters(true); setSelectedProviders(new Set(searchable.map((p) => p.provider))); }} className="text-xs text-surface-400 hover:text-white">Todos</button>
                  <span className="text-surface-700">·</span>
                  <button onClick={() => { setTouchedFilters(true); setSelectedProviders(new Set()); }} className="text-xs text-surface-400 hover:text-white">Ninguno</button>
                </div>
              </div>
            </div>
          )}

          {/* Results area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            {/* In-results filters bar */}
            {searched && !loading && hydrated && results.length > 0 && (
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
              {(!hydrated || loading) && (
                <div className="flex flex-col items-center justify-center py-32 gap-3">
                  <div className="w-10 h-10 rounded-full border-2 border-surface-700 border-t-brand-500 animate-spin" />
                  <p className="text-sm text-surface-400">
                    {loading ? "Consultando proveedores..." : "Cargando…"}
                  </p>
                </div>
              )}

              {hydrated && !loading && error && (
                <div className="flex items-start gap-3 bg-red-500/8 border border-red-500/15 rounded-xl p-5 max-w-lg">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              {hydrated && !loading && searched && !error && results.length === 0 && (
                <div className="flex flex-col items-center justify-center py-32 gap-2 text-center">
                  <Package className="w-9 h-9 text-surface-700 mb-1" />
                  <p className="text-sm font-medium text-surface-300">Sin resultados</p>
                  <p className="text-xs text-surface-500">Probá con otro término o activá más proveedores</p>
                </div>
              )}

              {hydrated && !loading && !searched && (
                <SearchLanding onCategoryClick={handleCategoryClick} />
              )}

              {/* Grid */}
              {hydrated && !loading && filtered.length > 0 && viewMode === "grid" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {filtered.map((product, i) => (
                    <ProductCard key={`${product.provider}-${product.externalId}-${i}`} product={product} />
                  ))}
                </div>
              )}

              {/* List */}
              {hydrated && !loading && filtered.length > 0 && viewMode === "list" && (
                <ListView items={filtered} />
              )}

              {/* Grouped */}
              {hydrated && !loading && filtered.length > 0 && viewMode === "grouped" && (
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
    </>
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
            <PriceTag product={p} size="sm" showSecondary />
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <AddToCartButton product={p} variant="icon" />
          </div>
        </Link>
      ))}
    </div>
  );
}
