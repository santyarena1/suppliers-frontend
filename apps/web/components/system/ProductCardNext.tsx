"use client";

import { useState } from "react";
import {
  Check,
  DollarSign,
  GitCompare,
  ImageOff,
  MapPin,
  Minus,
  Package,
  Plus,
  Sparkles,
  TrendingDown,
} from "lucide-react";

const STROKE = 1.4;

/**
 * Misma información que la tarjeta actual, en capas de lectura.
 *
 * La tarjeta de hoy muestra 22 datos distintos y todos pelean por el mismo
 * peso visual. Acá no se saca ninguno: se ordenan en cuatro bandas separadas
 * por línea fina, cada una con un trabajo. Identidad arriba, precio en el
 * medio en tipografía de dato, estado y desglose después, y acciones al pie.
 */
export type CardData = {
  name: string;
  provider: string;
  providerColor: string;
  externalId: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
  imageAiSelected?: boolean;
  /** Precio principal ya formateado, en la moneda que eligió el comercio. */
  price: string;
  /** El mismo importe en la otra moneda. */
  priceAlt?: string;
  /** Etiqueta de impuesto: "+ IVA 21%" o "Sin imp." */
  taxBadge: string;
  taxTitle?: string;
  /** Baja de precio contra la sincronización anterior. */
  dropPercent?: number;
  previousPrice?: string;
  /** Línea de desglose: base sin impuestos y percepción. */
  baseLine?: string;
  stock?: number | null;
  stockLabel?: string;
  location?: string;
  offline?: "on" | "off" | null;
  scheme?: "on" | "off" | null;
  schemeHint?: string;
  missingIva?: boolean;
  syncedAt?: string;
  listOverdue?: string;
};

export default function ProductCardNext({ p, delay = 0 }: { p: CardData; delay?: number }) {
  const [imgErr, setImgErr] = useState(false);
  const [qty, setQty] = useState(0);
  const [compared, setCompared] = useState(false);

  const hasStock = p.stock == null ? null : p.stock > 0;

  return (
    <article className="sys-card sys-rise" style={{ animationDelay: `${delay}ms` }}>
      {/* Foto: limpia, sin pastillas encima tapando el producto */}
      <div className="sys-card__shot">
        {p.imageUrl && !imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.imageUrl}
            alt={p.name}
            className="absolute inset-0 w-full h-full object-contain p-3"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-slate-50 text-slate-400">
            {imgErr ? <ImageOff className="w-9 h-9" strokeWidth={STROKE} /> : <Package className="w-9 h-9" strokeWidth={STROKE} />}
            <span className="text-[10px]">Sin imagen</span>
          </div>
        )}

        {p.dropPercent != null && p.dropPercent > 0 && (
          <span
            className="sys-num absolute top-2 right-2 inline-flex items-center gap-1 rounded px-1.5 py-1 text-[0.68rem] font-semibold"
            style={{ background: "var(--sys-ember)", color: "#1a0d06" }}
          >
            <TrendingDown className="w-3 h-3" strokeWidth={2} />
            {p.dropPercent % 1 === 0 ? p.dropPercent : p.dropPercent.toFixed(1)}%
          </span>
        )}

        {p.imageAiSelected && (
          <span
            className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.1em]"
            style={{ background: "rgb(0 0 0 / 0.62)", color: "#dfe6ff" }}
            title="Imagen elegida automáticamente, puede no corresponder"
          >
            <Sparkles className="w-2.5 h-2.5" strokeWidth={STROKE} />
            Imagen IA
          </span>
        )}
      </div>

      {/* 1. Identidad: de quién es y qué es */}
      <div className="px-3.5 pt-3 pb-3">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: p.providerColor }}
            aria-hidden="true"
          />
          <span className="text-[0.72rem] truncate" style={{ color: p.providerColor }}>
            {p.provider}
          </span>
        </div>

        <h3 className="text-[0.875rem] leading-snug line-clamp-2 min-h-[2.4rem]">{p.name}</h3>

        {(p.brand || p.category) && (
          <p className="mt-1.5 text-[0.72rem] truncate" style={{ color: "var(--sys-fg-faint)" }}>
            {p.brand}
            {p.brand && p.category ? " · " : ""}
            {p.category}
          </p>
        )}
      </div>

      {/* 2. Precio: la banda que se lee de un vistazo */}
      <div className="px-3.5 py-3" style={{ borderTop: "1px solid var(--sys-hair)" }}>
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <span className="sys-num text-[1.22rem] leading-none">{p.price}</span>
          <span
            className="sys-num text-[0.62rem] px-1.5 py-1 rounded"
            style={{ background: "var(--sys-raised)", color: "var(--sys-fg-dim)" }}
            title={p.taxTitle}
          >
            {p.taxBadge}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-2.5 flex-wrap min-h-[1.1rem]">
          {p.priceAlt && (
            <span className="sys-num text-[0.72rem]" style={{ color: "var(--sys-fg-dim)" }}>
              {p.priceAlt}
            </span>
          )}
          {p.previousPrice && (
            <span
              className="sys-num text-[0.7rem] line-through"
              style={{ color: "var(--sys-fg-faint)" }}
              title="Precio de la sincronización anterior"
            >
              {p.previousPrice}
            </span>
          )}
        </div>

        {p.baseLine && (
          <p className="sys-num mt-1.5 text-[0.66rem]" style={{ color: "var(--sys-fg-faint)" }}>
            {p.baseLine}
          </p>
        )}

        {p.schemeHint && (
          <p className="sys-num mt-1 text-[0.68rem]" style={{ color: "var(--sys-accent)" }}>
            {p.schemeHint}
          </p>
        )}

        {p.missingIva && (
          <p className="mt-1 text-[0.66rem]" style={{ color: "var(--sys-ember)" }}>
            Sin alícuota de IVA
          </p>
        )}
      </div>

      {/* 3. Estado: stock, modalidades y ubicación, en una sola cinta */}
      <div className="px-3.5 py-2.5" style={{ borderTop: "1px solid var(--sys-hair)" }}>
        <div className="sys-flags">
          {hasStock === true && (
            <span className="sys-flag sys-flag--stock">
              <Check className="w-2.5 h-2.5" strokeWidth={2} />
              {p.stockLabel ?? `${p.stock} u.`}
            </span>
          )}
          {hasStock === false && (
            <span className="sys-flag sys-flag--off">
              <Minus className="w-2.5 h-2.5" strokeWidth={2} />
              Sin stock
            </span>
          )}
          {hasStock === null && <span className="sys-flag sys-flag--off">Stock sin dato</span>}

          {p.offline === "on" && <span className="sys-flag sys-flag--accent">Offline</span>}
          {p.offline === "off" && <span className="sys-flag sys-flag--off">Sin offline</span>}
          {p.scheme === "on" && <span className="sys-flag sys-flag--accent">Esquema</span>}
          {p.scheme === "off" && <span className="sys-flag sys-flag--off">Sin esquema</span>}

          {p.location && (
            <span className="sys-flag">
              <MapPin className="w-2.5 h-2.5" strokeWidth={STROKE} />
              {p.location}
            </span>
          )}
        </div>

        {(p.syncedAt || p.listOverdue) && (
          <p className="sys-num mt-2 text-[0.62rem]" style={{ color: "var(--sys-fg-faint)" }}>
            {p.syncedAt}
            {p.listOverdue ? ` · ${p.listOverdue}` : ""}
          </p>
        )}
      </div>

      {/* 4. Acciones */}
      <div
        className="px-3.5 py-2.5 flex items-center justify-between gap-2 mt-auto"
        style={{ borderTop: "1px solid var(--sys-hair)" }}
      >
        <span className="sys-num text-[0.64rem] truncate" style={{ color: "var(--sys-fg-faint)" }} title="Código del distribuidor">
          #{p.externalId}
        </span>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            className="sys-icon-btn"
            title="Agregar al comparador"
            aria-label="Agregar al comparador"
            onClick={() => setCompared((v) => !v)}
            style={compared ? { borderColor: "var(--sys-accent)", color: "var(--sys-accent)" } : undefined}
          >
            {compared ? <Check className="w-3.5 h-3.5" strokeWidth={STROKE} /> : <GitCompare className="w-3.5 h-3.5" strokeWidth={STROKE} />}
          </button>

          <button type="button" className="sys-icon-btn" title="Ver precios de venta en locales" aria-label="Ver precios de venta">
            <DollarSign className="w-3.5 h-3.5" strokeWidth={STROKE} />
          </button>

          {qty === 0 ? (
            <button
              type="button"
              className="sys-btn sys-btn--primary !px-3 !py-1.5"
              onClick={() => setQty(1)}
            >
              Agregar
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button type="button" className="sys-icon-btn" aria-label="Quitar uno" onClick={() => setQty((q) => Math.max(0, q - 1))}>
                <Minus className="w-3.5 h-3.5" strokeWidth={STROKE} />
              </button>
              <span className="sys-num w-6 text-center text-[0.85rem]">{qty}</span>
              <button type="button" className="sys-icon-btn" aria-label="Sumar uno" onClick={() => setQty((q) => q + 1)}>
                <Plus className="w-3.5 h-3.5" strokeWidth={STROKE} />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
