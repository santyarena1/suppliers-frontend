"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  ChevronDown,
  Copy,
  Minus,
  Plus,
  Search,
  Sparkles,
  Store,
  ZoomIn,
} from "lucide-react";

/**
 * Página de producto con el idioma de la landing.
 *
 * Cambio estético, no estructural: la información de precio vive toda en el
 * panel de la derecha, junto al botón de agregar al carrito, igual que hoy. Lo
 * que suma es el detalle de las modalidades que el distribuidor sí acepta, con
 * su total y la diferencia contra lista. Una modalidad que no acepta no se
 * nombra: no hace falta un renglón para decir que algo no existe.
 *
 * Todo en la moneda elegida.
 */

export type Fact = { k: string; v: string };

export type PriceRow = { label: string; value: string; kind?: "add" | "muted" };

export type Mode = {
  key: string;
  name: string;
  caption: string;
  total: string;
  /** Diferencia contra lista, ya formateada. Solo en modalidades alternativas. */
  vsList?: string;
  rows: PriceRow[];
};

/** Una coincidencia de local, con la misma información que muestra hoy. */
export type LocalHit = {
  store: string;
  name: string;
  category?: string;
  price: string;
  match: number;
  margin: string;
  marginTone: "up" | "down";
  syncedAt: string;
  imageUrl: string;
};

export type Locales = {
  query: string;
  tokens: string[];
  range: string;
  counts: string;
  best: LocalHit[];
  others: LocalHit[];
};

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
  price: string;
  /** Precio de la sincronización anterior, dicho con todas las letras. */
  previousPrice?: string;
  previousAt?: string;
  dropPercent?: number;
  /** Modalidades que el distribuidor acepta. La primera es la de lista. */
  modes: Mode[];
  description: string;
  facts: Fact[];
  history: { date: string; value: number }[];
  currency: string;
  related: { name: string; provider: string; color: string; price: string }[];
  syncedAt: string;
  locales: Locales;
};

function PriceChart({ points, currency }: { points: { date: string; value: number }[]; currency: string }) {
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 100;
  const H = 40;
  const PAD = 4;

  const xy = points.map((p, i) => ({
    x: (i / (points.length - 1)) * W,
    y: PAD + (1 - (p.value - min) / span) * (H - PAD * 2),
    ...p,
  }));
  const line = xy.map((pt) => `${pt.x},${pt.y}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;

  const first = points[0].value;
  const last = points[points.length - 1].value;
  const change = ((last - first) / first) * 100;
  const fmt = (n: number) => `${currency} ${n.toLocaleString("es-AR")}`;

  return (
    <div className="ch">
      {/* Las referencias: qué es máximo, qué es mínimo y dónde estás hoy */}
      <div className="ch__refs">
        <span className="ch__ref">
          <em className="mono">Máximo</em>
          <b className="mono">{fmt(max)}</b>
        </span>
        <span className="ch__ref">
          <em className="mono">Mínimo</em>
          <b className="mono is-good">{fmt(min)}</b>
        </span>
        <span className="ch__ref">
          <em className="mono">Hoy</em>
          <b className="mono">{fmt(last)}</b>
        </span>
        <span className="ch__ref">
          <em className="mono">30 días</em>
          <b className={`mono ${change < 0 ? "is-good" : change > 0 ? "is-warn" : ""}`}>
            {change > 0 ? "+" : ""}
            {change.toFixed(1)}%
          </b>
        </span>
      </div>

      <div className="ch__plot">
        <div className="ch__axis mono">
          <span>{fmt(max)}</span>
          <span>{fmt(min)}</span>
        </div>

        <div className="ch__area">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Evolución del precio">
            <defs>
              <linearGradient id="chFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" y1={PAD} x2={W} y2={PAD} className="ch__guide" />
            <line x1="0" y1={H / 2} x2={W} y2={H / 2} className="ch__guide is-mid" />
            <line x1="0" y1={H - PAD} x2={W} y2={H - PAD} className="ch__guide" />
            <polygon points={area} fill="url(#chFill)" />
            <polyline
              points={line}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Fuera del SVG: el trazado se estira a lo ancho y deformaría los puntos */}
          {xy.map((pt, i) => (
            <span
              key={pt.date}
              className={i === xy.length - 1 ? "ch__dot is-last" : "ch__dot"}
              style={{
                left: `calc(7px + (100% - 14px) * ${pt.x / 100})`,
                top: `${(pt.y / H) * 100}%`,
              }}
              title={`${pt.date} · ${fmt(pt.value)}`}
            />
          ))}
        </div>
      </div>

      <div className="ch__dates mono">
        {points.map((pt) => (
          <span key={pt.date}>{pt.date}</span>
        ))}
      </div>
    </div>
  );
}

function LocalCard({ h, best = false }: { h: LocalHit; best?: boolean }) {
  return (
    <button type="button" className={`lc__hit${best ? " is-best" : ""}`}>
      <span className="lc__thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={h.imageUrl} alt="" />
      </span>
      <span className="lc__hit-body">
        <span className="lc__hit-top">
          <Store size={11} strokeWidth={1.7} style={{ color: "var(--p-faint)", flex: "0 0 auto" }} />
          <span className="lc__hit-store">{h.store}</span>
          <span className="lc__hit-when mono">{h.syncedAt}</span>
        </span>
        <span className="lc__hit-name">{h.name}</span>
        {h.category && <span className="lc__hit-cat">{h.category}</span>}
        <span className="lc__hit-foot">
          <span className="lc__hit-price mono">{h.price}</span>
          <span className="lc__hit-tags mono">
            <em>{h.match}% match</em>
            <b className={`is-${h.marginTone}`}>{h.margin}</b>
          </span>
        </span>
      </span>
    </button>
  );
}

export default function ProductPass({ p }: { p: ProductPassData }) {
  const [qty, setQty] = useState(1);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState(p.modes[0].key);
  const current = p.modes.find((m) => m.key === mode) ?? p.modes[0];

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

        {/* El título usa el ancho completo */}
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

          {/* Todo el precio en un solo panel, junto a la acción de comprar */}
          <aside className="pp__panel">
            {p.modes.length > 1 && (
              <div className="pp__tabs" role="tablist" aria-label="Modalidad de compra">
                {p.modes.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    role="tab"
                    aria-selected={m.key === mode}
                    className="pp__tab mono"
                    onClick={() => setMode(m.key)}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}

            <div className="pp__head">
              <p className="pp__caption mono">
                {current.caption}
                {qty > 1 ? ` · ${qty} u.` : ""}
              </p>
              <p className="pp__price">
                <span className="pp__amount mono">{current.total}</span>
                {current.vsList && <span className="pp__vs mono">{current.vsList}</span>}
              </p>
              {p.previousPrice && mode === p.modes[0].key && (
                <p className="pp__prev mono">
                  Antes {p.previousPrice}
                  {p.previousAt ? ` · sync del ${p.previousAt}` : ""}
                  {p.dropPercent != null ? ` · bajó ${p.dropPercent}%` : ""}
                </p>
              )}
            </div>

            <div className="pp__rows">
              <p className="pp__rows-title mono">Desglose de costo</p>
              {current.rows.map((r) => (
                <div key={r.label} className={`pp__row${r.kind ? ` is-${r.kind}` : ""}`}>
                  <span>{r.label}</span>
                  <span className="mono">{r.value}</span>
                </div>
              ))}
              <div className="pp__row is-total">
                <span>Costo unitario final</span>
                <span className="mono">{current.total}</span>
              </div>
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

        <section className="pp__sec">
          <h2>Descripción</h2>
          <p className="pp__desc">{p.description}</p>
        </section>

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

        <section className="pp__sec">
          <h2>Evolución de precio</h2>
          <PriceChart points={p.history} currency={p.currency} />
        </section>

        {/* Locales: el panel de siempre, con su buscador y sus coincidencias */}
        <section className="pp__sec pp__sec--plain">
          <div className="lc">
            <p className="lc__title">Precios de venta en locales</p>
            <p className="lc__lead">
              Referencia de mercado en locales de computación. Sirve para estimar a cuánto se vende
              el producto afuera y calcular margen. No es tu precio de compra ni una oferta de NODO.
            </p>

            <div className="lc__field">
              <Search size={14} strokeWidth={1.7} style={{ color: "var(--p-faint)" }} />
              <input defaultValue={p.locales.query} placeholder="Ajustá la búsqueda (amplia)..." aria-label="Ajustar búsqueda" />
            </div>
            <p className="lc__tokens mono">Criterios amplios: {p.locales.tokens.join(" · ")}</p>

            <div className="lc__tools">
              <span className="lc__sort">
                <ArrowUpDown size={12} strokeWidth={1.7} style={{ color: "var(--p-faint)" }} />
                <select aria-label="Ordenar resultados" defaultValue="match">
                  <option value="match">Mejor coincidencia</option>
                  <option value="price-asc">Precio más bajo</option>
                  <option value="price-desc">Precio más alto</option>
                  <option value="store">Local</option>
                </select>
              </span>
              <button type="button" className="lc__stores">
                <Store size={12} strokeWidth={1.7} />
                Locales
                <ChevronDown size={12} strokeWidth={1.7} />
              </button>
            </div>

            <p className="lc__range mono">
              Rango: <b>{p.locales.range}</b>
              <span className="lc__sep"> · </span>
              {p.locales.counts}
            </p>

            <p className="lc__group is-best">
              Mejores coincidencias <em>· ≥85% de palabras de la búsqueda</em>
            </p>
            <div className="lc__grid">
              {p.locales.best.map((h) => (
                <LocalCard key={h.store + h.name} h={h} best />
              ))}
            </div>

            <p className="lc__group">Otras referencias</p>
            <div className="lc__grid">
              {p.locales.others.map((h) => (
                <LocalCard key={h.store + h.name} h={h} />
              ))}
            </div>
          </div>
        </section>

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
      </div>
    </div>
  );
}
