"use client";

import { useState } from "react";
import { Check, DollarSign, GitCompare, Minus, Plus, Sparkles } from "lucide-react";

const S = 1.4;

export type Item = {
  name: string;
  provider: string;
  providerColor: string;
  externalId: string;
  brand: string;
  category: string;
  imageUrl: string;
  imageAiSelected?: boolean;
  price: string;
  priceAlt: string;
  taxBadge: string;
  taxTitle?: string;
  dropPercent?: number;
  previousPrice?: string;
  baseLine: string;
  stock: number | null;
  location?: string;
  schemeHint?: string;
  missingIva?: boolean;
  syncedAt: string;
  listOverdue?: string;
};

function stockText(stock: number | null): string {
  if (stock == null) return "";
  return stock > 0 ? `${stock} en stock` : "Sin stock";
}

function Actions({ tone }: { tone: "light" | "dark" }) {
  const [qty, setQty] = useState(0);
  const [cmp, setCmp] = useState(false);
  const btn =
    tone === "light"
      ? "w-8 h-8 rounded-md border border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors"
      : "sys-icon-btn";
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={btn} onClick={() => setCmp((v) => !v)} title="Comparar" aria-label="Comparar">
        {cmp ? <Check className="w-3.5 h-3.5" strokeWidth={S} /> : <GitCompare className="w-3.5 h-3.5" strokeWidth={S} />}
      </button>
      <button type="button" className={btn} title="Precios de venta" aria-label="Precios de venta">
        <DollarSign className="w-3.5 h-3.5" strokeWidth={S} />
      </button>
      {qty === 0 ? (
        <button
          type="button"
          onClick={() => setQty(1)}
          className="sys-btn sys-btn--primary !px-3 !py-1.5 !text-[0.62rem]"
        >
          Agregar
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <button type="button" className={btn} onClick={() => setQty((q) => Math.max(0, q - 1))} aria-label="Quitar uno">
            <Minus className="w-3.5 h-3.5" strokeWidth={S} />
          </button>
          <span className="sys-num w-5 text-center text-[0.82rem]">{qty}</span>
          <button type="button" className={btn} onClick={() => setQty((q) => q + 1)} aria-label="Sumar uno">
            <Plus className="w-3.5 h-3.5" strokeWidth={S} />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A · Ficha de catálogo.
 *
 * Tarjeta clara, como una página de catálogo impreso. La foto manda: va a
 * sangre, sin marco ni pastillas encima. Todo lo demás baja de peso y se apoya
 * en una sola columna de texto. Sin divisiones internas: el aire separa, no las
 * líneas.
 */
export function CardCatalog({ it, delay = 0 }: { it: Item; delay?: number }) {
  return (
    <article
      className="sys-rise flex flex-col overflow-hidden rounded-xl bg-[#fbfcfe] ring-1 ring-slate-200/80 transition-shadow duration-200 hover:shadow-[0_18px_40px_-24px_rgb(0_0_0/0.55)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={it.imageUrl} alt={it.name} className="absolute inset-0 h-full w-full object-contain p-4" />
        {it.imageAiSelected && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-white/85 px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.1em] text-slate-500 ring-1 ring-slate-200">
            <Sparkles className="w-2.5 h-2.5" strokeWidth={S} />
            Imagen IA
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex items-center gap-1.5 text-[0.7rem]" style={{ color: it.providerColor }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: it.providerColor }} aria-hidden="true" />
            {it.provider}
          </div>
          <h3 className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-[0.9rem] font-semibold leading-snug text-slate-900">
            {it.name}
          </h3>
          <p className="mt-1 text-[0.72rem] text-slate-500">
            {it.brand} · {it.category}
          </p>
        </div>

        <div className="mt-auto">
          <div className="flex items-baseline gap-2">
            <span className="sys-num text-[1.35rem] leading-none text-slate-900">{it.price}</span>
            {it.dropPercent != null && it.dropPercent > 0 && (
              <span className="sys-num text-[0.75rem] font-semibold" style={{ color: "#d1440f" }}>
                −{it.dropPercent}%
              </span>
            )}
          </div>

          <p className="sys-num mt-1.5 text-[0.72rem] text-slate-500">
            {it.priceAlt} · {it.taxBadge}
            {it.previousPrice ? <span className="ml-2 line-through text-slate-400">{it.previousPrice}</span> : null}
          </p>

          <p className="sys-num mt-1 text-[0.68rem] text-slate-400">
            {it.baseLine}
            {it.stock != null ? ` · ${stockText(it.stock)}` : ""}
            {it.location ? ` · ${it.location}` : ""}
          </p>

          {it.schemeHint && (
            <p className="sys-num mt-1 text-[0.68rem]" style={{ color: "#4033fc" }}>
              {it.schemeHint}
            </p>
          )}
          {it.missingIva && <p className="mt-1 text-[0.68rem] text-amber-700">Sin alícuota de IVA</p>}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="sys-num truncate text-[0.64rem] text-slate-400" title={it.externalId}>
            #{it.externalId}
          </span>
          <Actions tone="light" />
        </div>

        <p className="sys-num text-[0.6rem] text-slate-400">
          {it.syncedAt}
          {it.listOverdue ? ` · ${it.listOverdue}` : ""}
        </p>
      </div>
    </article>
  );
}

/**
 * B · Fila de precio.
 *
 * No es una tarjeta: es una fila de tabla. Cuando hay que comparar cuarenta
 * productos, los precios alineados en columna se recorren de arriba abajo de un
 * saque; una grilla de tarjetas obliga a saltar en zigzag. Es lo que haría una
 * herramienta de compra profesional.
 */
export function RowDense({ it, i }: { it: Item; i: number }) {
  return (
    <div
      className="grid items-center gap-4 px-4 py-3 transition-colors hover:bg-white/[0.03] grid-cols-[3rem_minmax(0,1fr)_auto] sm:grid-cols-[3rem_minmax(0,2fr)_minmax(0,1fr)_14rem_auto]"
      style={{ borderTop: i === 0 ? "none" : "1px solid var(--sys-hair)" }}
    >
      <div className="h-12 w-12 overflow-hidden rounded-md bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={it.imageUrl} alt="" className="h-full w-full object-contain p-1" />
      </div>

      <div className="min-w-0">
        <div className="truncate text-[0.85rem]">{it.name}</div>
        <div className="mt-0.5 truncate text-[0.7rem]" style={{ color: "var(--sys-fg-faint)" }}>
          {it.brand} · {it.category} · <span className="sys-num">#{it.externalId}</span>
        </div>
      </div>

      <div className="hidden min-w-0 sm:block">
        <div className="flex items-center gap-1.5 text-[0.76rem]" style={{ color: it.providerColor }}>
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: it.providerColor }} aria-hidden="true" />
          <span className="truncate">{it.provider}</span>
        </div>
        <div className="sys-num mt-0.5 truncate text-[0.68rem]" style={{ color: "var(--sys-fg-faint)" }}>
          {it.stock != null ? stockText(it.stock) : "stock sin dato"} · {it.syncedAt}
        </div>
      </div>

      <div className="text-right">
        <div className="flex items-baseline justify-end gap-2">
          <span className="sys-num text-[1.05rem]">{it.price}</span>
          {it.dropPercent != null && it.dropPercent > 0 && (
            <span className="sys-num text-[0.72rem]" style={{ color: "var(--sys-ember)" }}>
              −{it.dropPercent}%
            </span>
          )}
        </div>
        <div className="sys-num mt-0.5 text-[0.68rem] whitespace-nowrap" style={{ color: "var(--sys-fg-faint)" }}>
          {it.priceAlt} · {it.taxBadge}
        </div>
        <div className="sys-num mt-0.5 text-[0.64rem] truncate" style={{ color: "var(--sys-fg-faint)" }} title={it.baseLine}>
          {it.baseLine}
        </div>
        {it.schemeHint && (
          <div className="sys-num mt-0.5 text-[0.64rem] truncate" style={{ color: "var(--sys-accent)" }}>
            {it.schemeHint}
          </div>
        )}
        {it.missingIva && (
          <div className="text-[0.64rem] mt-0.5" style={{ color: "var(--sys-ember)" }}>Sin alícuota de IVA</div>
        )}
      </div>

      <div className="flex justify-end">
        <Actions tone="dark" />
      </div>
    </div>
  );
}

/**
 * C · Ficha oscura sin cajas.
 *
 * Misma información, cero divisiones internas y cero recuadros: solo foto,
 * jerarquía tipográfica y aire. El precio es lo más grande de la tarjeta y todo
 * lo demás se apoya debajo en una escala clara. Se apoya en el fondo del
 * sistema en vez de dibujar otro contenedor arriba.
 */
export function CardBare({ it, delay = 0 }: { it: Item; delay?: number }) {
  return (
    <article className="sys-rise group flex flex-col" style={{ animationDelay: `${delay}ms` }}>
      <div className="relative mb-4 aspect-[5/4] overflow-hidden rounded-lg bg-[#f4f6fa]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={it.imageUrl}
          alt={it.name}
          className="absolute inset-0 h-full w-full object-contain p-4 transition-transform duration-500 group-hover:scale-[1.05]"
        />
        {it.imageAiSelected && (
          <span className="absolute bottom-2 left-2 rounded bg-white/85 px-1.5 py-0.5 text-[0.56rem] uppercase tracking-[0.1em] text-slate-500">
            Imagen IA
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[0.7rem]" style={{ color: it.providerColor }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: it.providerColor }} aria-hidden="true" />
        {it.provider}
      </div>

      <h3 className="mt-2 line-clamp-2 min-h-[2.4rem] text-[0.92rem] leading-snug">{it.name}</h3>

      <div className="mt-3 flex items-baseline gap-2.5">
        <span className="sys-num text-[1.5rem] leading-none">{it.price}</span>
        {it.dropPercent != null && it.dropPercent > 0 && (
          <span className="sys-num text-[0.8rem]" style={{ color: "var(--sys-ember)" }}>
            −{it.dropPercent}%
          </span>
        )}
      </div>

      {/* Todo el resto en una sola escalera tipográfica, sin cajas ni chips */}
      <p className="sys-num mt-2 text-[0.72rem]" style={{ color: "var(--sys-fg-dim)" }}>
        {it.priceAlt} · {it.taxBadge}
        {it.previousPrice ? <span className="ml-2 line-through opacity-60">{it.previousPrice}</span> : null}
      </p>
      <p className="sys-num mt-1 text-[0.68rem]" style={{ color: "var(--sys-fg-faint)" }}>
        {it.baseLine}
      </p>
      <p className="mt-1 text-[0.7rem]" style={{ color: "var(--sys-fg-faint)" }}>
        {it.brand} · {it.category}
        {it.stock != null ? ` · ${stockText(it.stock)}` : ""}
        {it.location ? ` · ${it.location}` : ""}
      </p>
      {it.schemeHint && (
        <p className="sys-num mt-1 text-[0.68rem]" style={{ color: "var(--sys-accent)" }}>
          {it.schemeHint}
        </p>
      )}
      {it.missingIva && (
        <p className="mt-1 text-[0.68rem]" style={{ color: "var(--sys-ember)" }}>
          Sin alícuota de IVA
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 pt-3" style={{ borderTop: "1px solid var(--sys-hair)" }}>
        <span className="sys-num truncate text-[0.62rem]" style={{ color: "var(--sys-fg-faint)" }}>
          #{it.externalId} · {it.syncedAt}
        </span>
        <Actions tone="dark" />
      </div>
    </article>
  );
}
