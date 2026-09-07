"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Minus,
  Plus,
  Sparkles,
  ZoomIn,
} from "lucide-react";

/**
 * Página de producto con el idioma de la landing.
 *
 * Está todo lo que hay hoy: identidad, stock, foto con zoom, panel de precio con
 * desglose, cantidad, acciones de compra, similares, descripción, ficha técnica,
 * evolución de precio, relacionados, última sincronización y el pie de locales.
 *
 * Los dos cambios de fondo:
 *  1. Una sola moneda, la elegida. El desglose de hoy mezcla "Precio de lista
 *     (USD)", "Cotización" y "Costo en ARS". Acá cada renglón está en la moneda
 *     elegida y el origen en dólares queda como una nota al pie del panel, que
 *     es donde corresponde: explica de dónde sale el número, no compite con él.
 *  2. La foto se despega del fondo oscuro sobre papel blanco, igual que la
 *     tarjeta, y el panel de precio es lo único con peso a la derecha.
 */

export type Fact = { k: string; v: string };
export type PriceRow = { label: string; value: string; kind?: "add" | "total" | "muted" };

export type ProductPassData = {
  provider: string;
  providerColor: string;
  brand: string;
  category: string;
  subcategory?: string;
  externalId: string;
  name: string;
  imageUrl: string;
  imageAiSelected?: boolean;
  stock: number | null;
  stockStatus?: string;
  /** Título del panel: qué incluye el número grande. */
  priceCaption: string;
  price: string;
  previousPrice?: string;
  dropPercent?: number;
  rows: PriceRow[];
  /** Nota al pie: el origen en dólares y la cotización usada. */
  originNote: string;
  description: string;
  facts: Fact[];
  history: number[];
  related: { name: string; provider: string; color: string; price: string }[];
  syncedAt: string;
};

export default function ProductPass({ p }: { p: ProductPassData }) {
  const [qty, setQty] = useState(1);
  const [copied, setCopied] = useState(false);

  const min = Math.min(...p.history);
  const max = Math.max(...p.history);
  const span = max - min || 1;
  const points = p.history
    .map((v, i) => `${(i / (p.history.length - 1)) * 100},${34 - ((v - min) / span) * 30}`)
    .join(" ");

  return (
    <div className="pp">
      <header className="pp__bar">
        <button type="button" className="pp__back">
          <ArrowLeft size={14} strokeWidth={1.7} />
          Volver a búsqueda
        </button>
        <span className="pp__prefs mono">ARS · Dólar oficial · con IVA · con percepciones</span>
      </header>

      <div className="pp__wrap">
        {/* --- Identidad --- */}
        <div className="pp__id">
          <span className="pp__prov" style={{ ["--pv" as string]: p.providerColor }}>
            {p.provider}
          </span>
          <a href="#" className="pp__brand">
            {p.brand}
          </a>
          <a href="#" className="pp__cat">
            {p.category}
          </a>
          {p.subcategory && <span className="pp__sub">· {p.subcategory}</span>}
          <span className="pp__code mono">#{p.externalId}</span>
          <button type="button" className="pp__copy mono" onClick={() => setCopied(true)}>
            {copied ? <Check size={11} strokeWidth={2} /> : <Copy size={11} strokeWidth={1.7} />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>

        <h1 className="pp__name">{p.name}</h1>

        <p className="pp__stock mono">
          {p.stock == null ? (
            <span className="is-dim">Stock sin dato</span>
          ) : p.stock > 0 ? (
            <span className="is-yes">{p.stock} unidades</span>
          ) : (
            <span className="is-no">Sin stock</span>
          )}
          {p.stockStatus ? ` · ${p.stockStatus}` : ""}
        </p>

        {/* --- Foto + panel --- */}
        <div className="pp__grid">
          <div>
            <div className="pp__shot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imageUrl} alt={p.name} />
              <button type="button" className="pp__zoom" aria-label="Ampliar imagen">
                <ZoomIn size={15} strokeWidth={1.7} />
              </button>
            </div>
            {p.imageAiSelected && (
              <p className="pp__ai mono">
                <Sparkles size={10} strokeWidth={1.6} />
                Imagen elegida automáticamente, puede no corresponder
              </p>
            )}
          </div>

          <aside className="pp__panel">
            <div className="pp__head">
              <p className="pp__caption mono">
                {p.priceCaption}
                {qty > 1 ? ` · ${qty} u.` : ""}
              </p>
              <div className="pp__price">
                <span className="pp__amount mono">{p.price}</span>
                {p.previousPrice && <s className="mono">{p.previousPrice}</s>}
                {p.dropPercent != null && <span className="pp__drop mono">−{p.dropPercent}%</span>}
              </div>
            </div>

            {/* Desglose: todo en la moneda elegida, sin mezclar */}
            <div className="pp__rows">
              <p className="pp__rows-title mono">Desglose de costo</p>
              {p.rows.map((r) => (
                <div key={r.label} className={`pp__row${r.kind ? ` is-${r.kind}` : ""}`}>
                  <span>{r.label}</span>
                  <span className="mono">{r.value}</span>
                </div>
              ))}
              <p className="pp__origin mono">{p.originNote}</p>
            </div>

            <div className="pp__buy">
              <div className="pp__qty">
                <span>Cantidad</span>
                <span className="pp__step">
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Quitar uno">
                    <Minus size={13} strokeWidth={2} />
                  </button>
                  <b className="mono">{qty}</b>
                  <button type="button" onClick={() => setQty((q) => q + 1)} aria-label="Sumar uno">
                    <Plus size={13} strokeWidth={2} />
                  </button>
                </span>
              </div>
              <button type="button" className="pp__cta">
                Agregar al carrito
              </button>
              <button type="button" className="pp__ghost">
                Buscar similares en otros proveedores
              </button>
            </div>
          </aside>
        </div>

        {/* --- Descripción --- */}
        <section className="pp__sec">
          <h2>Descripción</h2>
          <p className="pp__desc">{p.description}</p>
        </section>

        {/* --- Ficha --- */}
        <section className="pp__sec">
          <h2>Ficha técnica</h2>
          <dl className="pp__facts">
            {p.facts.map((f) => (
              <div key={f.k}>
                <dt className="mono">{f.k}</dt>
                <dd>{f.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* --- Evolución --- */}
        <section className="pp__sec">
          <h2>Evolución de precio</h2>
          <div className="pp__chart">
            <svg viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={points} fill="none" stroke="currentColor" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="pp__chart-ends mono">
              <span>hace 30 días</span>
              <span>hoy</span>
            </div>
          </div>
        </section>

        {/* --- Relacionados --- */}
        <section className="pp__sec">
          <h2>Relacionados</h2>
          <div className="pp__rel">
            {p.related.map((r) => (
              <button key={r.name} type="button" className="pp__relcard" style={{ ["--pv" as string]: r.color }}>
                <span className="pp__relprov">{r.provider}</span>
                <span className="pp__relname">{r.name}</span>
                <span className="pp__relprice mono">{r.price}</span>
              </button>
            ))}
          </div>
        </section>

        <p className="pp__sync mono">{p.syncedAt}</p>

        <section className="pp__locales">
          <div>
            <h2>Precios de venta en locales</h2>
            <p className="mono">Referencia de mercado para calcular tu margen</p>
          </div>
          <button type="button" className="pp__ghost">
            Ver comparativa
            <ChevronRight size={13} strokeWidth={1.8} />
          </button>
        </section>
      </div>
    </div>
  );
}
