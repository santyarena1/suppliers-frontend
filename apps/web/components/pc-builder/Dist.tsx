"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ProductDTO } from "@/lib/api";
import { useProviderDisplay } from "@/lib/providerDisplay";
import { providerLabel } from "@/components/ProviderBadge";
import { inStock, offerKey, useOfferPricer } from "@/lib/pc-builder/state";

/** Logo del distribuidor en un cuadrado blanco, del mismo tamaño para todos. */
export function DistLogo({ provider, size = 32 }: { provider: string; size?: number }) {
  const display = useProviderDisplay();
  const url = display.logoUrl(provider);
  const name = providerLabel(provider);
  return (
    <span className="flex flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-white" style={{ width: size, height: size }} title={name}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-contain p-1" />
      ) : (
        <span className="text-[10px] font-bold text-surface-700">{name.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}

/** Logo, nombre y una línea chica debajo (stock, piezas…). */
export function DistName({ provider, sub, size = 32 }: { provider: string; sub?: string; size?: number }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <DistLogo provider={provider} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold leading-tight text-white">{providerLabel(provider)}</span>
        {sub && <span className="block truncate text-[11px] leading-tight text-surface-500">{sub}</span>}
      </span>
    </span>
  );
}

const stockText = (p: ProductDTO) => (inStock(p) ? `${p.stock != null && p.stock > 0 ? `${p.stock} en stock` : "con stock"}` : "sin stock");

/**
 * El distribuidor de una pieza: muestra el elegido y, al tocarlo, la lista de
 * distribuidores que lo tienen con su stock y su precio.
 */
export function OfferPicker({
  offers, current, onPick, align = "left",
}: {
  offers: ProductDTO[];
  current: ProductDTO | null;
  onPick: (key: string) => void;
  align?: "left" | "right";
}) {
  const price = useOfferPricer();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const options = offers
    .map((o) => ({ o, p: price(o), stock: inStock(o) }))
    .sort((a, b) => Number(b.stock) - Number(a.stock) || (a.p?.usd ?? 9e9) - (b.p?.usd ?? 9e9));
  if (!current) return <span className="text-xs text-amber-300">Sin stock en tus distribuidores</span>;
  const single = options.length <= 1;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={single}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-transparent px-1.5 py-1 text-left transition-colors enabled:hover:border-surface-700 enabled:hover:bg-surface-800/60"
      >
        <DistName provider={current.provider} sub={`${stockText(current)} · ${single ? "única opción" : `${options.length} opciones`}`} />
        {!single && <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-surface-500 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && (
        <div role="listbox" aria-label="Distribuidores" className={`absolute top-full z-30 mt-1.5 w-[300px] rounded-xl border border-surface-700 bg-surface-900 p-1.5 shadow-2xl shadow-black/50 ${align === "right" ? "right-0" : "left-0"}`}>
          {options.map(({ o, p, stock }) => {
            const selected = offerKey(o) === offerKey(current);
            return (
              <button
                key={offerKey(o)}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={!stock || !p}
                onClick={() => { onPick(offerKey(o)); setOpen(false); }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "bg-brand-600/15" : "hover:bg-surface-800"}`}
              >
                <DistName provider={o.provider} sub={stockText(o)} />
                <span className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-white">{p?.label ?? "—"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
