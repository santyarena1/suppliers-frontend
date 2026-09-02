"use client";

import { useState, useCallback, useMemo, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import PrefsPanel from "@/components/PrefsPanel";
import PriceTag from "@/components/PriceTag";
import AddToCartButton from "@/components/AddToCartButton";
import SearchLanding from "@/components/search/SearchLanding";
import SponsoredStrip from "@/components/ads/SponsoredStrip";
import { OfflinePricesHelpButton } from "@/components/OfflinePricesHelp";
import {
  searchApi,
  catalogApi,
  ProductDTO,
  Provider,
  productDisplayBrand,
  productDisplayCategory,
} from "@/lib/api";
import { useMyProviders } from "@/lib/myProviders";
import { useIsRetailer, usePurchasePolicies, usePurchasePolicy } from "@/lib/purchase";
import { purchaseLinePricing, type PriceMode } from "@/lib/purchase-price";
import { displayAmountFromPricing } from "@/lib/display-price";
import { usePrefs } from "@/lib/prefs";
import { useIibbRatesEpoch } from "@/lib/iibb-rates";
import { useResults } from "@/lib/results";
import { trackSearch } from "@/lib/history";
import { parsePrice, proxyImg } from "@/lib/format";
import {
  entryKey,
  loadCompareEntries,
  newProviderEntry,
  saveCompareEntries,
} from "@/lib/compare-store";
import ProviderBadge from "@/components/ProviderBadge";
import Image from "next/image";
import Link from "next/link";
import {
  Search, SlidersHorizontal, Loader2, X, LayoutGrid,
  List, ArrowUpDown, AlertCircle, Package, Filter,
  ChevronDown, ChevronRight, GitCompare, Check,
} from "lucide-react";

type SortKey = "default" | "price_asc" | "price_desc" | "name_asc" | "name_desc";
type ViewMode = "grid" | "list" | "grouped";
type PriceView = "list" | "offline" | "scheme";

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
  const initialMarca = searchParams?.get("marca") || "";
  const initialCategoria = searchParams?.get("categoria") || "";
  const [query, setQuery] = useState(initialQ);
  const [brandFilter, setBrandFilter] = useState(initialMarca);
  const [activeQuery, setActiveQuery] = useState("");
  // Solo se puede buscar en los proveedores con los que el comercio está vinculado:
  // del resto no hay catálogo, y ni siquiera tiene por qué saber que existen.
  const { providers: myProviders } = useMyProviders();
  const retailer = useIsRetailer();
  const purchasePolicies = usePurchasePolicies();
  const { withIva, withIibb } = usePrefs();
  const iibbEpoch = useIibbRatesEpoch();
  const searchable = myProviders.filter((p) => p.linked);
  const anyOffline = searchable.some((p) => purchasePolicies[p.provider]?.acceptsOffline);
  const anyScheme = searchable.some((p) => purchasePolicies[p.provider]?.acceptsScheme);
  const [priceView, setPriceView] = useState<PriceView>("list");
  const priceMode: PriceMode = retailer && priceView !== "list" ? priceView : "list";
  const [selectedProviders, setSelectedProviders] = useState<Set<Provider>>(new Set());
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [touchedFilters, setTouchedFilters] = useState(false);
  const [results, setResults] = useState<ProductDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [includeOutOfStock, setIncludeOutOfStock] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("price_asc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const lastUrlKeyRef = useRef<string | null>(null);
  const lastSearchKind = useRef<"search" | "category">("search");

  function searchUrlKey(q: string, marca: string, categoria = "") {
    return `${q.trim()}||${marca.trim()}||${categoria.trim()}`;
  }

  function syncSearchUrl(q: string, marca = brandFilter, opts?: { categoria?: string }) {
    const trimmed = q.trim();
    const marcaTrim = marca.trim();
    const categoriaTrim =
      opts?.categoria !== undefined
        ? opts.categoria.trim()
        : lastSearchKind.current === "category"
          ? trimmed
          : "";
    const params = new URLSearchParams();
    if (trimmed) params.set("q", trimmed);
    if (marcaTrim) params.set("marca", marcaTrim);
    if (categoriaTrim) params.set("categoria", categoriaTrim);
    const next = params.toString() ? `/search?${params.toString()}` : "/search";
    const current = typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "";
    lastUrlKeyRef.current = searchUrlKey(trimmed, marcaTrim, categoriaTrim);
    if (current !== next) {
      router.replace(next, { scroll: false });
    }
  }

  async function handleCategoryClick(category: string, withZero = includeOutOfStock) {
    setError("");
    setLoading(true);
    setSearched(true);
    setQuery(category);
    setActiveQuery(category);
    setRefineText("");
    setMinPrice("");
    setMaxPrice("");
    setSelectedBrands(new Set());
    setSelectedCategories(new Set());
    lastSearchKind.current = "category";
    try {
      const res = await catalogApi.byCategory(category, 60, { includeOutOfStock: withZero });
      const data = Array.isArray(res.data) ? res.data : [];
      setResults(data);
      persistResults(category, data);
      setUiState({ refineText: "", minPrice: "", maxPrice: "", hideNoImage: false, scrollTop: 0 });
      syncSearchUrl(category, "", { categoria: category });
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

  async function runSearch(term: string, opts?: { track?: boolean; includeOutOfStock?: boolean; brand?: string }) {
    const q = term.trim();
    const brand = (opts?.brand ?? brandFilter).trim();
    if (!q && !brand) return;
    const withZero = opts?.includeOutOfStock ?? includeOutOfStock;
    lastSearchKind.current = "search";
    setError("");
    setLoading(true);
    setSearched(true);
    setQuery(q || brand);
    setActiveQuery(q || brand);
    setBrandFilter(brand);
    setRefineText("");
    setMinPrice("");
    setMaxPrice("");
    setSelectedBrands(new Set());
    setSelectedCategories(new Set());
    try {
      const res = await searchApi.all(q, {
        providers: searchable.filter((p) => selectedProviders.has(p.provider)).map((p) => p.provider),
        includeOutOfStock: withZero,
        brand: brand || undefined,
      });
      const data = res.data;
      setResults(data);
      persistResults(q || `marca:${brand}`, data);
      setUiState({ refineText: "", minPrice: "", maxPrice: "", hideNoImage: false, scrollTop: 0 });
      if (opts?.track !== false) trackSearch(q || brand);
      syncSearchUrl(q, brand, { categoria: "" });
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

  function toggleOutOfStock() {
    const next = !includeOutOfStock;
    setIncludeOutOfStock(next);
    if (!searched || !activeQuery.trim()) return;
    if (lastSearchKind.current === "category") void handleCategoryClick(activeQuery, next);
    else void runSearch(activeQuery, { track: false, includeOutOfStock: next });
  }

  function resetToHome() {
    clearResults();
    setQuery("");
    setActiveQuery("");
    setBrandFilter("");
    setResults([]);
    setSearched(false);
    setError("");
    setRefineText("");
    setMinPrice("");
    setMaxPrice("");
    setHideNoImage(false);
    setSelectedBrands(new Set());
    setSelectedCategories(new Set());
    setPriceView("list");
    setLoading(false);
    syncSearchUrl("", "", { categoria: "" });
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
    if (typeof ui?.includeOutOfStock === "boolean") setIncludeOutOfStock(ui.includeOutOfStock);
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
    // iibbEpoch fuerza reorden cuando se aprende una alícuota nueva
    void iibbEpoch;
    const sortPrice = (p: ProductDTO) => {
      const pricing = purchaseLinePricing(p, purchasePolicies[p.provider], priceMode);
      return displayAmountFromPricing(
        pricing,
        {
          withIva,
          withIibb: withIibb && pricing.mode !== "offline",
          provider: p.provider,
        }
      ).unitDisplayUsd;
    };
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
    if (selectedBrands.size > 0) {
      arr = arr.filter((p) => {
        const b = productDisplayBrand(p);
        return !!b && selectedBrands.has(b);
      });
    }
    if (selectedCategories.size > 0) {
      arr = arr.filter((p) => {
        const c = productDisplayCategory(p);
        return !!c && selectedCategories.has(c);
      });
    }
    if (sortBy === "price_asc") arr = [...arr].sort((a, b) => sortPrice(a) - sortPrice(b));
    if (sortBy === "price_desc") arr = [...arr].sort((a, b) => sortPrice(b) - sortPrice(a));
    if (sortBy === "name_asc") arr = [...arr].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (sortBy === "name_desc") arr = [...arr].sort((a, b) => (b.name || "").localeCompare(a.name || ""));
    return arr;
  }, [
    results, refineText, hideNoImage, minPrice, maxPrice, sortBy, priceMode,
    purchasePolicies, withIva, withIibb, iibbEpoch, selectedBrands, selectedCategories,
  ]);

  const brandFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of results) {
      const b = productDisplayBrand(p);
      if (!b) continue;
      counts.set(b, (counts.get(b) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [results]);

  const categoryFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of results) {
      const c = productDisplayCategory(p);
      if (!c) continue;
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [results]);

  const toggleBrand = useCallback((brand: string) => {
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      next.has(brand) ? next.delete(brand) : next.add(brand);
      return next;
    });
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      next.has(category) ? next.delete(category) : next.add(category);
      return next;
    });
  }, []);

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
    const urlMarca = initialMarca.trim();
    const urlCategoria = initialCategoria.trim();
    const cachedQ = storedQuery.trim();
    const sameAsCache =
      !urlMarca &&
      !urlCategoria &&
      !!urlQ &&
      !!cachedQ &&
      urlQ.toLowerCase() === cachedQ.toLowerCase() &&
      storedResults.length > 0;

    if (urlCategoria) {
      lastUrlKeyRef.current = searchUrlKey(urlQ || urlCategoria, urlMarca, urlCategoria);
      void handleCategoryClick(urlCategoria);
      return;
    }

    if (sameAsCache || (!urlQ && !urlMarca && cachedQ && storedResults.length > 0)) {
      restoreFromStore(urlQ || cachedQ, storedResults);
      return;
    }

    lastUrlKeyRef.current = searchUrlKey(urlQ, urlMarca);
    if (urlMarca) setBrandFilter(urlMarca);
    if (urlQ || urlMarca) {
      void runSearch(urlQ, { track: false, brand: urlMarca || undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Si cambia ?q= desde afuera (home, link) y no es un sync nuestro, buscar de nuevo.
  // Si ?q= queda vacío (sidebar → Búsqueda / clear), volver al landing.
  useEffect(() => {
    if (!hydrated || !restoredRef.current) return;
    const urlQ = initialQ.trim();
    const urlMarca = initialMarca.trim();
    const urlCategoria = initialCategoria.trim();
    const key = searchUrlKey(urlQ, urlMarca, urlCategoria);
    if (key === (lastUrlKeyRef.current ?? "")) return;
    lastUrlKeyRef.current = key;
    setBrandFilter(urlMarca);
    if (!urlQ && !urlMarca && !urlCategoria) {
      setQuery("");
      setActiveQuery("");
      setResults([]);
      setSearched(false);
      setError("");
      setRefineText("");
      setMinPrice("");
      setMaxPrice("");
      setHideNoImage(false);
      setSelectedBrands(new Set());
      setSelectedCategories(new Set());
      return;
    }
    if (urlCategoria) {
      void handleCategoryClick(urlCategoria);
      return;
    }
    if (
      !urlMarca &&
      urlQ.toLowerCase() === activeQuery.trim().toLowerCase() &&
      results.length > 0
    ) return;
    void runSearch(urlQ, { track: false, brand: urlMarca || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ, initialMarca, initialCategoria]);

  // Si el sidebar limpia el store estando en /search, salir a landing.
  useEffect(() => {
    if (!hydrated || !restoredRef.current) return;
    if (storedQuery || storedResults.length > 0) return;
    if (!searched && results.length === 0) return;
    const urlQ = initialQ.trim();
    const urlMarca = initialMarca.trim();
    const urlCategoria = initialCategoria.trim();
    if (urlQ || urlMarca || urlCategoria) return;
    setQuery("");
    setActiveQuery("");
    setResults([]);
    setSearched(false);
    setError("");
    setRefineText("");
    setMinPrice("");
    setMaxPrice("");
    setHideNoImage(false);
    setSelectedBrands(new Set());
    setSelectedCategories(new Set());
    lastUrlKeyRef.current = "";
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
      includeOutOfStock,
    });
  }, [searched, sortBy, viewMode, refineText, minPrice, maxPrice, hideNoImage, includeOutOfStock, setUiState]);

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
  const hasFacetFilters = selectedBrands.size > 0 || selectedCategories.size > 0;
  const hasInResultsFilter = refineText || minPrice || maxPrice || hideNoImage || hasFacetFilters;

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
                  placeholder={brandFilter ? `Productos de ${brandFilter}…` : "Buscar producto..."}
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
                disabled={loading || (!query.trim() && !brandFilter.trim())}
                className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg px-4 py-2 transition-all flex-shrink-0"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Buscar
              </button>
            </form>

            <div className="flex items-center gap-2 ml-auto">
              {retailer && (
                <span className="flex items-center gap-1">
                  {anyOffline ? (
                    <button
                      type="button"
                      onClick={() => setPriceView((v) => (v === "offline" ? "list" : "offline"))}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-all ${
                        priceView === "offline"
                          ? "border-amber-500 text-amber-300 bg-amber-500/10"
                          : "border-surface-700 text-surface-400 hover:text-surface-200"
                      }`}
                    >
                      Precios offline
                    </button>
                  ) : (
                    <Link
                      href="/proveedores"
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-amber-500/30 text-amber-200/90 hover:text-white hover:border-amber-400/50"
                      title="Se activa en Proveedores → el distribuidor → Configuración"
                    >
                      Pedido offline
                    </Link>
                  )}
                  {anyScheme && (
                    <button
                      type="button"
                      onClick={() => setPriceView((v) => (v === "scheme" ? "list" : "scheme"))}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-all ${
                        priceView === "scheme"
                          ? "border-violet-500 text-violet-300 bg-violet-500/10"
                          : "border-surface-700 text-surface-400 hover:text-surface-200"
                      }`}
                    >
                      Precios esquema
                    </button>
                  )}
                  <OfflinePricesHelpButton />
                </span>
              )}
              <PrefsPanel />

              <button
                type="button"
                onClick={toggleOutOfStock}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-all ${
                  includeOutOfStock
                    ? "border-brand-500 text-brand-400 bg-brand-600/10"
                    : "border-surface-700 text-surface-400 hover:text-surface-200"
                }`}
                title="Por defecto no se listan productos con stock 0"
              >
                Incluir sin stock
              </button>

              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-all ${
                  showFilters || unselectedCount > 0 || hasFacetFilters
                    ? "border-brand-500 text-brand-400 bg-brand-600/10"
                    : "border-surface-700 text-surface-400 hover:text-surface-200"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {(unselectedCount > 0 || hasFacetFilters) && (
                  <span className="bg-brand-600 text-white rounded-full min-w-4 h-4 px-1 flex items-center justify-center text-[10px] leading-none">
                    {(unselectedCount > 0 ? selectedProviders.size : 0) + selectedBrands.size + selectedCategories.size}
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
          {brandFilter && (
            <div className="flex-shrink-0 border-b border-surface-800 bg-surface-900 px-6 py-2 flex items-center gap-2">
              <span className="text-xs text-surface-400">Marca</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-brand-600/15 text-brand-300 border border-brand-500/30 rounded-full pl-2.5 pr-1 py-0.5">
                {brandFilter}
                <button
                  type="button"
                  onClick={() => {
                    setBrandFilter("");
                    if (activeQuery.trim() && searched) void runSearch(activeQuery, { track: false, brand: "" });
                    else syncSearchUrl(query, "");
                  }}
                  className="w-4 h-4 rounded-full hover:bg-white/10 flex items-center justify-center"
                  title="Quitar filtro de marca"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            </div>
          )}
          {showFilters && (
            <div className="flex-shrink-0 border-b border-surface-800 bg-surface-900 px-6 py-3 space-y-3">
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
                      className={`rounded border transition-all px-1.5 py-1 ${
                        selectedProviders.has(provider)
                          ? "border-brand-500/50 bg-brand-600/10"
                          : "border-surface-800 bg-transparent hover:border-surface-600 opacity-70 hover:opacity-100"
                      }`}
                    >
                      <ProviderBadge
                        provider={provider}
                        label={name}
                        variant="inline"
                        size="sm"
                      />
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => { setTouchedFilters(true); setSelectedProviders(new Set(searchable.map((p) => p.provider))); }} className="text-xs text-surface-400 hover:text-white">Todos</button>
                  <span className="text-surface-700">·</span>
                  <button onClick={() => { setTouchedFilters(true); setSelectedProviders(new Set()); }} className="text-xs text-surface-400 hover:text-white">Ninguno</button>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-[11px] font-medium text-surface-500 uppercase tracking-wider pt-1.5 w-20 flex-shrink-0">Marcas</span>
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                  {brandFacets.length === 0 ? (
                    <span className="text-xs text-surface-600">Sin marcas en resultados</span>
                  ) : (
                    brandFacets.map(([brand, count]) => (
                      <button
                        key={brand}
                        type="button"
                        onClick={() => toggleBrand(brand)}
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all ${
                          selectedBrands.has(brand)
                            ? "border-brand-500 bg-brand-600/15 text-brand-300"
                            : "border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-500"
                        }`}
                      >
                        {brand}
                        <span className="ml-1 tabular-nums text-surface-500">{count}</span>
                      </button>
                    ))
                  )}
                </div>
                {selectedBrands.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedBrands(new Set())}
                    className="text-xs text-surface-400 hover:text-white flex-shrink-0"
                  >
                    Limpiar
                  </button>
                )}
              </div>

              <div className="flex items-start gap-3">
                <span className="text-[11px] font-medium text-surface-500 uppercase tracking-wider pt-1.5 w-20 flex-shrink-0">Categorías</span>
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                  {categoryFacets.length === 0 ? (
                    <span className="text-xs text-surface-600">Sin categorías en resultados</span>
                  ) : (
                    categoryFacets.map(([category, count]) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => toggleCategory(category)}
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all ${
                          selectedCategories.has(category)
                            ? "border-brand-500 bg-brand-600/15 text-brand-300"
                            : "border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-500"
                        }`}
                      >
                        {category}
                        <span className="ml-1 tabular-nums text-surface-500">{count}</span>
                      </button>
                    ))
                  )}
                </div>
                {selectedCategories.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategories(new Set())}
                    className="text-xs text-surface-400 hover:text-white flex-shrink-0"
                  >
                    Limpiar
                  </button>
                )}
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

                  <button
                    type="button"
                    onClick={toggleOutOfStock}
                    className={`text-[11px] font-medium px-2 py-1.5 rounded-md border transition-all ${
                      includeOutOfStock
                        ? "border-brand-500 bg-brand-600/15 text-brand-400"
                        : "border-surface-700 text-surface-500 hover:text-surface-300"
                    }`}
                    title="Por defecto el catálogo oculta los productos con stock 0"
                  >
                    Incluir sin stock
                  </button>

                  {retailer && (
                    <span className="flex items-center gap-1">
                      {anyOffline ? (
                        <button
                          type="button"
                          onClick={() => setPriceView((v) => (v === "offline" ? "list" : "offline"))}
                          className={`text-[11px] font-medium px-2 py-1.5 rounded-md border transition-all ${
                            priceView === "offline"
                              ? "border-amber-500 bg-amber-500/15 text-amber-300"
                              : "border-surface-700 text-surface-500 hover:text-surface-300"
                          }`}
                        >
                          Precios offline
                        </button>
                      ) : (
                        <Link
                          href="/proveedores"
                          className="text-[11px] font-medium px-2 py-1.5 rounded-md border border-amber-500/30 text-amber-200/90"
                        >
                          Pedido offline
                        </Link>
                      )}
                      {anyScheme && (
                        <button
                          type="button"
                          onClick={() => setPriceView((v) => (v === "scheme" ? "list" : "scheme"))}
                          className={`text-[11px] font-medium px-2 py-1.5 rounded-md border transition-all ${
                            priceView === "scheme"
                              ? "border-violet-500 bg-violet-500/15 text-violet-300"
                              : "border-surface-700 text-surface-500 hover:text-surface-300"
                          }`}
                        >
                          Precios esquema
                        </button>
                      )}
                      <OfflinePricesHelpButton />
                    </span>
                  )}

                  {hasInResultsFilter && (
                    <button
                      onClick={() => {
                        setRefineText("");
                        setMinPrice("");
                        setMaxPrice("");
                        setHideNoImage(false);
                        setSelectedBrands(new Set());
                        setSelectedCategories(new Set());
                      }}
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
                      <option value="name_desc">Nombre Z-A</option>
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
                  <p className="text-xs text-surface-500">
                    {includeOutOfStock
                      ? "Probá con otro término o activá más proveedores"
                      : "Probá con otro término, más proveedores, o «Incluir sin stock»"}
                  </p>
                </div>
              )}

              {hydrated && !loading && searched && !error && results.length > 0 && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-32 gap-2 text-center">
                  <Package className="w-9 h-9 text-surface-700 mb-1" />
                  <p className="text-sm font-medium text-surface-300">Nada con esos filtros</p>
                  <p className="text-xs text-surface-500">
                    {includeOutOfStock ? "Probá limpiar los filtros de esta búsqueda" : "Activá «Incluir sin stock» o limpiá los filtros"}
                  </p>
                </div>
              )}

              {hydrated && !loading && !searched && (
                <SearchLanding onCategoryClick={handleCategoryClick} />
              )}

              {hydrated && !loading && filtered.length > 0 && <SponsoredStrip />}

              {/* Grid */}
              {hydrated && !loading && filtered.length > 0 && viewMode === "grid" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {filtered.map((product, i) => (
                    <ProductCard key={`${product.provider}-${product.externalId}-${i}`} product={product} priceMode={priceMode} />
                  ))}
                </div>
              )}

              {/* List */}
              {hydrated && !loading && filtered.length > 0 && viewMode === "list" && (
                <ListView items={filtered} priceMode={priceMode} />
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
                          <ProviderBadge provider={prov} variant="inline" size="md" />
                          <span className="text-xs text-surface-500">{items.length}</span>
                          <div className="flex-1 border-b border-surface-800 ml-2" />
                        </button>
                        {!collapsed && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                            {items.map((p, i) => (
                              <ProductCard key={`${p.provider}-${p.externalId}-${i}`} product={p} priceMode={priceMode} />
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

function ListRowActions({ product, priceMode }: { product: ProductDTO; priceMode: PriceMode }) {
  const [compareFlash, setCompareFlash] = useState(false);
  const policy = usePurchasePolicy(product.provider);
  const pricing = purchaseLinePricing(product, policy, priceMode);
  const showingOffline = pricing.adjusted && pricing.mode === "offline";

  function addToCompare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const entry = newProviderEntry(product, priceMode);
    const current = loadCompareEntries();
    const key = entryKey(entry);
    if (!current.some((c) => entryKey(c) === key)) {
      saveCompareEntries([...current, entry]);
    }
    setCompareFlash(true);
    setTimeout(() => setCompareFlash(false), 700);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("nodo-compare-updated"));
    }
  }

  return (
    <div
      className="flex items-center justify-end gap-1.5"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        title="Agregar al comparador"
        aria-label="Agregar al comparador"
        onClick={addToCompare}
        className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors shadow-sm ${
          compareFlash
            ? "border-violet-400 bg-violet-100 text-violet-700"
            : "border-violet-300/70 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 hover:border-violet-400/60 hover:text-violet-200"
        }`}
      >
        {compareFlash ? <Check className="w-3.5 h-3.5" /> : <GitCompare className="w-3.5 h-3.5" />}
      </button>
      <AddToCartButton
        product={product}
        variant="stepper"
        tone="dark"
        channel={showingOffline ? "offline" : "online"}
      />
    </div>
  );
}

function ListView({ items, priceMode }: { items: ProductDTO[]; priceMode: PriceMode }) {
  return (
    <div className="flex flex-col divide-y divide-surface-800 border border-surface-800 rounded-xl overflow-hidden">
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-2.5 bg-surface-900 text-[10px] font-semibold text-surface-500 uppercase tracking-wider items-center">
        <span className="w-10" />
        <span>Producto</span>
        <span className="text-right w-28">Proveedor</span>
        <span className="text-right w-36">Precio</span>
        <span className="w-[7.5rem] text-right">Acciones</span>
      </div>
      {items.map((p, i) => {
        const brand = productDisplayBrand(p);
        const category = productDisplayCategory(p);
        return (
          <div
            key={`${p.provider}-${p.externalId}-${i}`}
            className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-4 py-3 bg-surface-950 hover:bg-surface-900 transition-colors"
          >
            <Link
              href={`/product/${encodeURIComponent(p.provider)}/${encodeURIComponent(p.externalId)}`}
              className="w-10 h-10 relative flex-shrink-0 bg-surface-800 rounded overflow-hidden"
            >
              {p.imageUrl
                ? <Image src={proxyImg(p.imageUrl)} alt="" fill className="object-contain" unoptimized />
                : <Package className="w-4 h-4 text-surface-600 absolute inset-0 m-auto" />
              }
            </Link>
            <div className="min-w-0">
              <Link
                href={`/product/${encodeURIComponent(p.provider)}/${encodeURIComponent(p.externalId)}`}
                className="text-sm text-surface-100 font-medium truncate block hover:text-white"
              >
                {p.name}
              </Link>
              {(brand || category) ? (
                <p className="text-[11px] text-surface-500 truncate">
                  {brand && (
                    <Link href={`/search?marca=${encodeURIComponent(brand)}`} className="hover:text-brand-300">
                      {brand}
                    </Link>
                  )}
                  {brand && category ? " · " : null}
                  {category && (
                    <Link href={`/search?categoria=${encodeURIComponent(category)}`} className="hover:text-brand-300">
                      {category}
                    </Link>
                  )}
                </p>
              ) : p.externalId ? (
                <p className="text-[11px] text-surface-500 font-mono">#{p.externalId}</p>
              ) : null}
            </div>
            <div className="w-28 text-right flex justify-end">
              <ProviderBadge provider={p.provider} variant="inline" size="sm" />
            </div>
            <div className="w-36 text-right">
              <PriceTag product={p} size="sm" showSecondary priceMode={priceMode} />
            </div>
            <div className="w-[7.5rem]">
              <ListRowActions product={p} priceMode={priceMode} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
