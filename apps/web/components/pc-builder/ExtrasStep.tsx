"use client";

import { useState } from "react";
import { ImageOff, Plus, Search, X } from "lucide-react";
import NodoSpinner from "@/components/NodoSpinner";
import ProviderBadge from "@/components/ProviderBadge";
import { searchApi, type ProductDTO } from "@/lib/api";
import { proxyImg } from "@/lib/format";
import { inStock, offerKey, useOfferPricer, type CustomLine, type ExtraLine } from "@/lib/pc-builder/state";

const QUICK = ["Monitor", "Teclado", "Mouse", "Auriculares", "Parlantes", "Webcam", "Windows", "Placa WiFi", "Ventilador"];

/** Lo que va además de la PC: cualquier producto del catálogo o una línea libre (armado, envío…). */
export default function ExtrasStep({
  extras, custom, onAdd, onQty, onRemove, onAddCustom, onRemoveCustom,
}: {
  extras: ExtraLine[];
  custom: CustomLine[];
  onAdd: (p: ProductDTO) => void;
  onQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
  onAddCustom: (line: Omit<CustomLine, "id">) => void;
  onRemoveCustom: (id: string) => void;
}) {
  const price = useOfferPricer();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductDTO[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [iva, setIva] = useState("21");

  async function search(text: string) {
    const t = text.trim();
    if (!t) return;
    setQ(t);
    setSearching(true);
    try {
      const res = await searchApi.all(t);
      setResults(res.data.slice(0, 60));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }
  const sorted = (results ?? []).slice().sort((a, b) => Number(inStock(b)) - Number(inStock(a)) || (price(a)?.usd ?? 9e9) - (price(b)?.usd ?? 9e9));

  return (
    <section className="flex flex-col gap-5" aria-label="Extras y periféricos">
      <header>
        <h2 className="text-lg font-semibold text-white">Extras y periféricos</h2>
        <p className="mt-1 text-sm text-surface-400">Sumá cualquier producto del catálogo (monitor, teclado, mouse, licencia…) o una línea libre como el armado o el envío.</p>
      </header>

      {(extras.length > 0 || custom.length > 0) && (
        <div className="overflow-hidden rounded-xl border border-surface-800">
          {extras.map(({ product, qty }) => {
            const p = price(product);
            const k = offerKey(product);
            return (
              <div key={k} className="flex items-center gap-3 border-b border-surface-800 px-3 py-2.5 last:border-0">
                <span className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(product.imageUrl)} alt="" className="h-full w-full object-contain p-0.5" />
                  ) : <ImageOff className="h-4 w-4 text-surface-400" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">{product.name}</span>
                  <ProviderBadge provider={product.provider} variant="inline" size="sm" />
                </span>
                <span className="inline-flex h-8 items-center rounded-md border border-surface-700">
                  <button type="button" aria-label="Restar" onClick={() => onQty(k, qty - 1)} className="h-8 w-7 text-surface-300">−</button>
                  <span className="w-6 text-center font-mono text-sm">{qty}</span>
                  <button type="button" aria-label="Sumar" onClick={() => onQty(k, qty + 1)} className="h-8 w-7 text-surface-300">+</button>
                </span>
                <span className="w-28 text-right font-mono text-sm tabular-nums text-white">{p ? p.label : "—"}</span>
                <button type="button" aria-label={`Quitar ${product.name}`} onClick={() => onRemove(k)} className="text-surface-500 hover:text-red-300"><X className="h-4 w-4" /></button>
              </div>
            );
          })}
          {custom.map((c) => (
            <div key={c.id} className="flex items-center gap-3 border-b border-surface-800 px-3 py-2.5 last:border-0">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border border-dashed border-surface-600 text-[10px] text-surface-400">Libre</span>
              <span className="min-w-0 flex-1 truncate text-sm text-white">{c.name}</span>
              <span className="text-xs text-surface-500">× {c.qty} · IVA {c.ivaPercent}%</span>
              <span className="w-28 text-right font-mono text-sm tabular-nums text-white">$ {Math.round(c.unitFinalPrice).toLocaleString("es-AR")}</span>
              <button type="button" aria-label={`Quitar ${c.name}`} onClick={() => onRemoveCustom(c.id)} className="text-surface-500 hover:text-red-300"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-surface-800 bg-surface-900/60 p-3">
        <form onSubmit={(e) => { e.preventDefault(); void search(q); }} className="flex flex-wrap gap-2">
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Buscar en el catálogo</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en tu catálogo: monitor 27, mouse logitech…" className="h-10 w-full rounded-lg border border-surface-700 bg-surface-950 pl-9 pr-3 text-sm text-white placeholder:text-surface-500 focus:border-brand-500 focus:outline-none" />
          </label>
          <button type="submit" className="h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-500">Buscar</button>
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK.map((w) => (
            <button key={w} type="button" onClick={() => void search(w)} className="h-8 rounded-md border border-surface-700 px-2.5 text-xs font-medium text-surface-300 hover:border-surface-500 hover:text-white">{w}</button>
          ))}
        </div>
        {searching ? (
          <div className="flex justify-center py-8"><NodoSpinner className="h-5 w-5" /></div>
        ) : results && (
          <ul className="m-0 mt-3 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2">
            {sorted.length === 0 && <li className="text-sm text-surface-400">Nada en tu catálogo con eso.</li>}
            {sorted.map((p) => {
              const pr = price(p);
              const ok = inStock(p) && pr;
              return (
                <li key={offerKey(p)} className="flex items-center gap-3 rounded-lg border border-surface-800 p-2">
                  <span className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={proxyImg(p.imageUrl)} alt="" className="h-full w-full object-contain p-0.5" />
                    ) : <ImageOff className="h-4 w-4 text-surface-400" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[13px] leading-snug text-white">{p.name}</span>
                    <span className="mt-0.5 flex items-center gap-2"><ProviderBadge provider={p.provider} variant="inline" size="sm" /><span className="text-[11px] text-surface-500">{inStock(p) ? "con stock" : "sin stock"}</span></span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="font-mono text-sm tabular-nums text-white">{pr ? pr.label : "—"}</span>
                    <button type="button" disabled={!ok} onClick={() => onAdd(p)} className="inline-flex h-7 items-center gap-1 rounded-md bg-brand-600 px-2 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-40"><Plus className="h-3 w-3" />Agregar</button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = Number(amount.replace(/\./g, "").replace(",", "."));
          if (!name.trim() || !(value > 0)) return;
          onAddCustom({ name: name.trim(), unitFinalPrice: value, ivaPercent: Number(iva), qty: 1 });
          setName("");
          setAmount("");
        }}
        className="rounded-xl border border-surface-800 p-3"
      >
        <h3 className="text-sm font-semibold text-white">Línea libre</h3>
        <p className="mt-0.5 text-xs text-surface-400">Para lo que no está en el catálogo: armado y prueba, instalación, envío. Va al presupuesto, no al carrito.</p>
        <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_160px_110px_auto]">
          <label className="flex flex-col gap-1 text-xs text-surface-400">Descripción<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Armado, prueba y Windows instalado" className="h-9 rounded-lg border border-surface-700 bg-surface-950 px-3 text-sm text-white" /></label>
          <label className="flex flex-col gap-1 text-xs text-surface-400">Precio final ($)<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="45.000" className="h-9 rounded-lg border border-surface-700 bg-surface-950 px-3 text-right font-mono text-sm text-white" /></label>
          <label className="flex flex-col gap-1 text-xs text-surface-400">IVA<select value={iva} onChange={(e) => setIva(e.target.value)} className="h-9 rounded-lg border border-surface-700 bg-surface-950 px-2 text-sm text-white"><option value="21">21%</option><option value="10.5">10,5%</option><option value="27">27%</option><option value="0">Sin IVA</option></select></label>
          <button type="submit" className="h-9 self-end rounded-lg border border-surface-600 px-3 text-sm font-semibold text-surface-100 hover:border-surface-400">Agregar línea</button>
        </div>
      </form>
    </section>
  );
}
