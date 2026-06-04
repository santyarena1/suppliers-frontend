"use client";

import { useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import ProductCard from "@/components/ProductCard";
import AuthGuard from "@/components/AuthGuard";
import { searchApi, ALL_PROVIDERS, ProductDTO, Provider } from "@/lib/api";
import { Search, Filter, Loader2, X, ChevronDown } from "lucide-react";

type SearchMode = "all" | "filtered";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("all");
  const [selectedProviders, setSelectedProviders] = useState<Set<Provider>>(
    new Set(ALL_PROVIDERS)
  );
  const [results, setResults] = useState<ProductDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<"relevance" | "price_asc" | "price_desc">("relevance");

  const toggleProvider = useCallback((p: Provider) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }, []);

  function selectAll() { setSelectedProviders(new Set(ALL_PROVIDERS)); }
  function clearAll() { setSelectedProviders(new Set()); }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setError("");
    setLoading(true);
    setSearched(true);
    try {
      let data: ProductDTO[] = [];
      if (mode === "all") {
        const res = await searchApi.all(query.trim());
        data = res.data;
      } else {
        const filters: Record<string, boolean> = {};
        ALL_PROVIDERS.forEach((p) => { filters[p] = selectedProviders.has(p); });
        const res = await searchApi.filtered(query.trim(), filters);
        data = res.data;
      }
      setResults(sortResults(data, sortBy));
    } catch {
      setError("Error al buscar. Verificá que el servidor esté corriendo.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function sortResults(data: ProductDTO[], sort: typeof sortBy) {
    if (sort === "price_asc") {
      return [...data].sort((a, b) => parseFloat(a.price || "0") - parseFloat(b.price || "0"));
    }
    if (sort === "price_desc") {
      return [...data].sort((a, b) => parseFloat(b.price || "0") - parseFloat(a.price || "0"));
    }
    return data;
  }

  function handleSortChange(value: typeof sortBy) {
    setSortBy(value);
    setResults((prev) => sortResults(prev, value));
  }

  const groupedByProvider: Record<string, number> = {};
  results.forEach((p) => {
    groupedByProvider[p.provider] = (groupedByProvider[p.provider] || 0) + 1;
  });

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white mb-1">Buscar productos</h1>
            <p className="text-gray-400 text-sm">Consultá precios en {ALL_PROVIDERS.length} proveedores simultáneamente</p>
          </div>

          {/* Search form */}
          <form onSubmit={handleSearch} className="mb-6">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder='Ej: "Ryzen 5 5600", "RTX 4060", "SSD 1TB"...'
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors text-base"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl px-6 transition-colors flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                Buscar
              </button>
            </div>
          </form>

          {/* Mode + Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex bg-gray-800 border border-gray-700 rounded-lg p-1 gap-1">
              <button
                onClick={() => setMode("all")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === "all" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                Todos los proveedores
              </button>
              <button
                onClick={() => setMode("filtered")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
                  mode === "filtered" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                Filtrar proveedores
                {mode === "filtered" && selectedProviders.size < ALL_PROVIDERS.length && (
                  <span className="ml-1 bg-white/20 rounded-full px-1.5 text-xs">
                    {selectedProviders.size}
                  </span>
                )}
              </button>
            </div>

            {mode === "filtered" && (
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
              >
                Seleccionar proveedores
                <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>

          {/* Provider filter panel */}
          {mode === "filtered" && showFilters && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-300">
                  {selectedProviders.size} de {ALL_PROVIDERS.length} proveedores seleccionados
                </span>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-xs text-blue-400 hover:text-blue-300">Todos</button>
                  <span className="text-gray-600">·</span>
                  <button onClick={clearAll} className="text-xs text-gray-400 hover:text-white">Ninguno</button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
                {ALL_PROVIDERS.map((p) => (
                  <button
                    key={p}
                    onClick={() => toggleProvider(p)}
                    className={`text-xs px-2.5 py-2 rounded-lg border font-medium transition-colors ${
                      selectedProviders.has(p)
                        ? "bg-blue-600/20 border-blue-500 text-blue-300"
                        : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500"
                    }`}
                  >
                    {p.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 mb-6 text-sm">
              {error}
            </div>
          )}

          {/* Results header */}
          {searched && !loading && (
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-400">
                {results.length === 0
                  ? "Sin resultados"
                  : `${results.length} producto${results.length !== 1 ? "s" : ""} encontrado${results.length !== 1 ? "s" : ""}`}
                {results.length > 0 && ` en ${Object.keys(groupedByProvider).length} proveedor${Object.keys(groupedByProvider).length !== 1 ? "es" : ""}`}
              </span>
              {results.length > 0 && (
                <select
                  value={sortBy}
                  onChange={(e) => handleSortChange(e.target.value as typeof sortBy)}
                  className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
                >
                  <option value="relevance">Relevancia</option>
                  <option value="price_asc">Precio: menor a mayor</option>
                  <option value="price_desc">Precio: mayor a menor</option>
                </select>
              )}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
              <p className="text-gray-400">Consultando proveedores...</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && searched && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-500">
              <Search className="w-12 h-12" />
              <p className="text-lg font-medium text-gray-400">Sin resultados</p>
              <p className="text-sm">Probá con otro término o activá más proveedores</p>
            </div>
          )}

          {/* Initial state */}
          {!loading && !searched && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-600">
              <Search className="w-12 h-12" />
              <p className="text-base">Escribí un producto para empezar a buscar</p>
            </div>
          )}

          {/* Results grid */}
          {!loading && results.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {results.map((product, i) => (
                <ProductCard key={`${product.provider}-${product.externalId}-${i}`} product={product} />
              ))}
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
