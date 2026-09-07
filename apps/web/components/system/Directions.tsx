"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Minus, Plus, ShoppingCart } from "lucide-react";

/**
 * Dos direcciones con carácter, construidas sobre lo que el sistema ya tiene y
 * yo había ignorado: cada distribuidor tiene su propio color. Eso no es adorno,
 * es el dato que más rápido leés en pantalla, y es lo único que ninguna otra
 * herramienta puede copiar porque nadie más tiene tus quince proveedores.
 */

export type Offer = {
  dist: string;
  color: string;
  price: number;
  prev?: number;
  stock: number | null;
  sync: string;
  mode?: "offline" | "esquema";
};

export type Row = {
  name: string;
  brand: string;
  category: string;
  sku: string;
  img: string;
  offers: Offer[];
};

const money = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function delta(o: Offer): number | null {
  if (o.prev == null || o.prev === 0) return null;
  const pct = ((o.price - o.prev) / o.prev) * 100;
  // Una variación de 0,0% no es información: no se muestra.
  return Math.abs(pct) < 0.05 ? null : pct;
}

/* ============================================================
 * DIRECCIÓN 1 · MESA DE OPERACIONES
 * Comprar stock es operar: los precios se mueven, hay quince
 * contrapartes y gana el que ve el número primero. La pantalla
 * se comporta como una mesa: densa, numérica, con el color de
 * cada distribuidor mandando la fila.
 * ========================================================== */

export function DeskRow({ row, open, onToggle }: { row: Row; open: boolean; onToggle: () => void }) {
  const sorted = [...row.offers].sort((a, b) => a.price - b.price);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const spread = worst.price - best.price;
  const spreadPct = (spread / best.price) * 100;
  const d = delta(best);

  return (
    <div className="desk-row" data-open={open}>
      <button type="button" onClick={onToggle} className="desk-row__main" aria-expanded={open}>
        <span className="desk-row__bar" style={{ background: best.color }} aria-hidden="true" />

        <span className="desk-row__id">
          <span className="desk-row__thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={row.img} alt="" />
          </span>
          <span className="desk-row__text">
            <span className="desk-row__name">{row.name}</span>
            <span className="desk-row__meta">
              {row.brand} · {row.category} · <span className="mono">{row.sku}</span>
            </span>
          </span>
        </span>

        {/* El abanico de precios: una barra por distribuidor, en su color */}
        <span className="desk-spread" title={`${row.offers.length} distribuidores`}>
          {sorted.map((o) => {
            const t = spread === 0 ? 0 : (o.price - best.price) / spread;
            return (
              <span
                key={o.dist}
                className="desk-spread__tick"
                style={{ left: `${t * 100}%`, background: o.color, opacity: o.stock === 0 ? 0.28 : 1 }}
              />
            );
          })}
          <span className="desk-spread__rail" />
          <span className="desk-spread__legend mono">
            {row.offers.length} fuentes · {spreadPct.toFixed(0)}% de brecha
          </span>
        </span>

        <span className="desk-row__price">
          <span className="desk-row__amount mono" style={{ color: best.color }}>
            {money(best.price)}
          </span>
          <span className="desk-row__ccy mono">USD</span>
          {d != null && (
            <span className={`desk-delta mono ${d < 0 ? "is-down" : "is-up"}`}>
              {d < 0 ? <ArrowDown size={11} strokeWidth={2.4} /> : <ArrowUp size={11} strokeWidth={2.4} />}
              {Math.abs(d).toFixed(1)}%
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="desk-book">
          {sorted.map((o, i) => {
            const od = delta(o);
            return (
              <div key={o.dist} className="desk-book__row" data-best={i === 0}>
                <span className="desk-book__dist" style={{ color: o.color }}>
                  <span className="desk-book__dot" style={{ background: o.color }} />
                  {o.dist}
                </span>
                <span className="desk-book__stock mono">
                  {o.stock == null ? "—" : o.stock > 0 ? `${o.stock} u.` : "sin stock"}
                </span>
                <span className="desk-book__sync mono">{o.sync}</span>
                <span className="desk-book__mode mono">{o.mode ?? ""}</span>
                <span className="desk-book__price mono" style={i === 0 ? { color: o.color } : undefined}>
                  {money(o.price)}
                  {od != null && (
                    <em className={`desk-delta mono ${od < 0 ? "is-down" : "is-up"}`}>
                      {od < 0 ? "▼" : "▲"} {Math.abs(od).toFixed(1)}%
                    </em>
                  )}
                </span>
                <button type="button" className="desk-add" style={{ borderColor: o.color, color: o.color }}>
                  <ShoppingCart size={13} strokeWidth={1.8} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DeskDirection({ rows }: { rows: Row[] }) {
  const [open, setOpen] = useState<string | null>(rows[0]?.sku ?? null);
  return (
    <div className="desk">
      <div className="desk__tape">
        <span className="desk__tape-item mono">
          <b>USD OFICIAL</b> 1.530,00 <em className="is-up">▲ 0,4%</em>
        </span>
        <span className="desk__tape-item mono">
          <b>ÚLTIMA SYNC</b> hace 4 min
        </span>
        <span className="desk__tape-item mono">
          <b>FUENTES</b> 8 de 15 activas
        </span>
        <span className="desk__tape-item mono">
          <b>BAJAS HOY</b> <em className="is-down">▼ 23 productos</em>
        </span>
      </div>

      <div className="desk__head mono">
        <span>Producto</span>
        <span>Abanico de precios</span>
        <span className="desk__head-right">Mejor precio</span>
      </div>

      {rows.map((r) => (
        <DeskRow key={r.sku} row={r} open={open === r.sku} onToggle={() => setOpen(open === r.sku ? null : r.sku)} />
      ))}
    </div>
  );
}

/* ============================================================
 * DIRECCIÓN 2 · CATÁLOGO VIVO
 * Fondo claro y cálido, foto grande, y el color del distribuidor
 * como filo de la tarjeta. La energía la ponen los productos y el
 * código de color, no un acento neón sobre negro.
 * ========================================================== */

export function LiveCard({ row, big = false }: { row: Row; big?: boolean }) {
  const [qty, setQty] = useState(0);
  const sorted = [...row.offers].sort((a, b) => a.price - b.price);
  const best = sorted[0];
  const d = delta(best);

  return (
    <article className={`live-card${big ? " live-card--big" : ""}`}>
      <span className="live-card__edge" style={{ background: best.color }} aria-hidden="true" />

      <div className="live-card__shot">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={row.img} alt={row.name} />
        {d != null && d < 0 && <span className="live-card__drop mono">bajó {Math.abs(d).toFixed(0)}%</span>}
      </div>

      <div className="live-card__body">
        <span className="live-card__dist" style={{ color: best.color }}>
          {best.dist}
          <em>{row.offers.length > 1 ? ` y ${row.offers.length - 1} más` : ""}</em>
        </span>

        <h3 className="live-card__name">{row.name}</h3>
        <p className="live-card__meta">
          {row.brand} · {row.category}
        </p>

        <div className="live-card__price">
          <span className="mono">USD {money(best.price)}</span>
          {best.prev && <s className="mono">{money(best.prev)}</s>}
        </div>

        <p className="live-card__sub mono">
          {best.stock == null ? "stock sin dato" : best.stock > 0 ? `${best.stock} en stock` : "sin stock"} ·{" "}
          {best.sync}
        </p>

        {/* El resto de las fuentes, cada una con su color: es la comparación */}
        <div className="live-card__others">
          {sorted.slice(1).map((o) => (
            <span key={o.dist} className="live-card__other mono" style={{ borderColor: o.color, color: o.color }}>
              {o.dist.replace("Distribuidor ", "")} {money(o.price)}
            </span>
          ))}
        </div>

        <div className="live-card__foot">
          <span className="mono">{row.sku}</span>
          {qty === 0 ? (
            <button type="button" className="live-add" style={{ background: best.color }} onClick={() => setQty(1)}>
              Agregar
            </button>
          ) : (
            <span className="live-step">
              <button type="button" onClick={() => setQty((q) => Math.max(0, q - 1))} aria-label="Quitar uno">
                <Minus size={13} strokeWidth={2} />
              </button>
              <b className="mono">{qty}</b>
              <button type="button" onClick={() => setQty((q) => q + 1)} aria-label="Sumar uno">
                <Plus size={13} strokeWidth={2} />
              </button>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export function LiveDirection({ rows }: { rows: Row[] }) {
  return (
    <div className="live">
      <div className="live__bar">
        <span className="live__q">
          <b>ryzen 5</b>
          <em>4 resultados en 6 distribuidores</em>
        </span>
        <span className="live__chips mono">
          <span className="is-on">Con stock</span>
          <span>Marca</span>
          <span>Distribuidor</span>
        </span>
      </div>

      <div className="live__grid">
        {rows.map((r, i) => (
          <LiveCard key={r.sku} row={r} big={i === 0} />
        ))}
      </div>
    </div>
  );
}

export function CheckMark() {
  return <Check size={12} strokeWidth={2.4} />;
}
