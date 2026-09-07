"use client";

import { useState } from "react";
import { ArrowLeft, Check, Copy, Minus, Plus, Sparkles, ZoomIn } from "lucide-react";

/**
 * Página de producto con el idioma de la landing.
 *
 * Está todo lo que hay hoy, y el panel de precio suma lo que faltaba: en vez de
 * una sola columna, las tres modalidades desglosadas y comparadas entre sí, que
 * es la pregunta real —cuánto me sale en lista, cuánto offline, cuánto en
 * esquema—. Una modalidad que el distribuidor no acepta se dice, no se esconde.
 *
 * Todo en la moneda elegida.
 */

export type Fact = { k: string; v: string };

export type ModeRow = { label: string; value: string; kind?: "add" | "total" | "muted" };

export type Mode = {
  key: string;
  name: string;
  caption: string;
  total?: string;
  /** Diferencia contra la modalidad de lista, ya formateada. */
  vsList?: string;
  rows?: ModeRow[];
  available: boolean;
  unavailableNote?: string;
};

export type LocalRow = { shop: string; price: string; margin: string; marginTone: "up" | "down" };

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
  priceCaption: string;
  price: string;
  /** Precio de la sincronización anterior, dicho con todas las letras. */
  previousPrice?: string;
  previousAt?: string;
  dropPercent?: number;
  modes: Mode[];
  description: string;
  facts: Fact[];
  /** Serie de precios con su fecha, en la moneda elegida. */
  history: { date: string; value: number }[];
  currency: string;
  related: { name: string; provider: string; color: string; price: string }[];
  syncedAt: string;
  locales: { rows: LocalRow[]; note: string };
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
  const line = xy.map((p) => `${p.x},${p.y}`).join(" ");
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
          <line x1="0" y1={H - PAD} x2={W} y2={H - PAD} className="ch__guide" />
          <line x1="0" y1={H / 2} x2={W} y2={H / 2} className="ch__guide is-mid" />
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

          {xy.map((p, i) => (
            <span
              key={p.date}
              className={i === xy.length - 1 ? "ch__dot is-last" : "ch__dot"}
              style={{ left: `${p.x}%`, top: `${(p.y / H) * 100}%` }}
              title={`${p.date} · ${fmt(p.value)}`}
            />
          ))}
        </div>
      </div>

      <div className="ch__dates mono">
        {points.map((p, i) => (
          <span key={p.date} data-hide={i > 0 && i < points.length - 1 && i % 2 === 1 ? "true" : "false"}>
            {p.date}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ProductPass({ p }: { p: ProductPassData }) {
  const [qty, setQty] = useState(1);
  const [copied, setCopied] = useState(false);

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

        {/* El título usa el ancho completo: no hay razón para apretarlo */}
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

          <aside className="pp__panel">
            <div className="pp__head">
              <p className="pp__caption mono">
                {p.priceCaption}
                {qty > 1 ? ` · ${qty} u.` : ""}
              </p>
              <p className="pp__price">
                <span className="pp__amount mono">{p.price}</span>
              </p>
              {p.previousPrice && (
                <p className="pp__prev mono">
                  Antes {p.previousPrice}
                  {p.previousAt ? ` · sync del ${p.previousAt}` : ""}
                  {p.dropPercent != null ? ` · bajó ${p.dropPercent}%` : ""}
                </p>
              )}
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

        {/* --- Las tres modalidades, desglosadas y comparadas --- */}
        <section className="pp__sec">
          <h2>Desglose por modalidad de compra</h2>
          <div className="pp__modes">
            {p.modes.map((m) => (
              <div key={m.key} className="pp__mode" data-off={!m.available}>
                <div className="pp__mode-head">
                  <b>{m.name}</b>
                  <span className="mono">{m.caption}</span>
                </div>

                {m.available ? (
                  <>
                    <div className="pp__rows">
                      {(m.rows ?? []).map((r) => (
                        <div key={r.label} className={`pp__row${r.kind ? ` is-${r.kind}` : ""}`}>
                          <span>{r.label}</span>
                          <span className="mono">{r.value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pp__mode-foot">
                      <span className="pp__mode-total mono">{m.total}</span>
                      {m.vsList && <span className="pp__mode-vs mono">{m.vsList}</span>}
                    </div>
                  </>
                ) : (
                  <p className="pp__mode-off mono">{m.unavailableNote}</p>
                )}
              </div>
            ))}
          </div>
        </section>

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

        {/* --- Locales: cargado, no detrás de un botón --- */}
        <section className="pp__sec">
          <h2>Precios de venta en locales</h2>
          <div className="pp__locales">
            {p.locales.rows.map((l) => (
              <div key={l.shop} className="pp__local">
                <span className="pp__local-shop">{l.shop}</span>
                <span className="pp__local-price mono">{l.price}</span>
                <span className={`pp__local-margin mono is-${l.marginTone}`}>{l.margin}</span>
              </div>
            ))}
          </div>
          <p className="pp__local-note mono">{p.locales.note}</p>
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
