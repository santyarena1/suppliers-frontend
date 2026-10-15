"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, ImageOff, Loader2, Plus, Search, X } from "lucide-react";
import ProviderBadge from "@/components/ProviderBadge";
import { searchApi, type ProductDTO } from "@/lib/api";
import { proxyImg } from "@/lib/format";
import { quoteError, type Quote } from "@/lib/quotes";
import { saleAmountUsd } from "@/lib/sale-price";

const MAX_RESULTS = 40;

/**
 * Buscador dentro del presupuesto: se agregan productos sin salir de la
 * pantalla ni cambiar de modo. Muestra el precio de venta (costo + margen),
 * el mismo que va al presupuesto.
 */
export default function QuoteProductSearch({
  quote,
  format,
  onAdd,
  onClose,
}: {
  quote: Quote;
  /** Importe en USD → texto en la moneda del presupuesto. */
  format: (usd: number | null) => string;
  onAdd: (p: ProductDTO, qty: number) => Promise<void>;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setResults([]);
      setSearched("");
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await searchApi.all(text);
        if (id !== seq.current) return;
        const priced = data
          .filter((p) => (saleAmountUsd(p, true) ?? 0) > 0)
          .sort((a, b) => (saleAmountUsd(a, true) ?? 0) - (saleAmountUsd(b, true) ?? 0));
        setResults(priced.slice(0, MAX_RESULTS));
        setSearched(text);
      } catch {
        if (id === seq.current) setError("No se pudo buscar. Probá de nuevo.");
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const inQuote = (p: ProductDTO) =>
    quote.items.find((it) => it.kind === "product" && it.provider === p.provider && it.externalId === p.externalId)?.qty ?? 0;

  async function add(p: ProductDTO) {
    const key = `${p.provider}:${p.externalId}`;
    setAdding(key);
    setError(null);
    try {
      await onAdd(p, 1);
    } catch (err) {
      setError(quoteError(err, "No se pudo agregar"));
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="border-b border-surface-800 bg-surface-900/40 px-3.5 py-3">
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-500" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscá por nombre, marca o código (ej.: ryzen 5 5600)"
            aria-label="Buscar productos para el presupuesto"
            className="w-full rounded-lg border border-surface-700 bg-surface-950 py-2 pl-8 pr-8 text-sm text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none"
          />
          {loading && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-surface-500" />}
        </label>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-surface-400 hover:bg-surface-800 hover:text-white" aria-label="Cerrar buscador">
          <X className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
      {searched && !loading && results.length === 0 && (
        <p className="mt-3 text-center text-xs text-surface-500">No encontramos productos con precio para «{searched}».</p>
      )}
      {results.length > 0 && (
        <ul className="mt-2 max-h-[min(50dvh,24rem)] divide-y divide-surface-800/70 overflow-y-auto rounded-lg border border-surface-800 bg-surface-950">
          {results.map((p) => {
            const key = `${p.provider}:${p.externalId}`;
            const qty = inQuote(p);
            const price = saleAmountUsd(p, true);
            return (
              <li key={key} className="flex items-center gap-2.5 px-2.5 py-2">
                <span className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-md border border-surface-800 bg-white">
                  {p.imageUrl ? (
                    <Image src={proxyImg(p.imageUrl)} alt="" fill className="object-contain p-0.5" unoptimized />
                  ) : (
                    <ImageOff className="absolute inset-0 m-auto h-3.5 w-3.5 text-surface-400" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-xs leading-snug text-surface-100">{p.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <ProviderBadge provider={p.provider} variant="inline" size="sm" />
                    {p.stock != null && <span className="text-[10px] text-surface-500">stock {p.stock}</span>}
                  </span>
                </span>
                <span className="flex-shrink-0 text-right">
                  <span className="block text-xs font-semibold tabular-nums text-white">{format(price)}</span>
                  <span className="block text-[9px] text-surface-500">venta c/IVA</span>
                </span>
                <button
                  type="button"
                  onClick={() => void add(p)}
                  disabled={adding !== null}
                  className={`flex h-8 flex-shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                    qty ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25" : "bg-brand-600 text-white hover:bg-brand-500"
                  }`}
                  aria-label={qty ? `Sumar otro ${p.name}` : `Agregar ${p.name}`}
                >
                  {adding === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : qty ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {qty ? qty : "Agregar"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!searched && !loading && (
        <p className="mt-2 text-[11px] text-surface-500">
          Busca en todos tus proveedores. También podés agregar desde la búsqueda, la ficha o el comparador con «Presupuesto».
        </p>
      )}
    </div>
  );
}
