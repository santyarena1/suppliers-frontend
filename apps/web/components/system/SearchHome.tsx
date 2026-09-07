"use client";

import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";

/**
 * Home del buscador.
 *
 * La de hoy abre con un carrusel de tres slides con degradé que le explican a
 * alguien que entra todos los días qué hace el producto que ya compró, y se
 * mueve solo cada seis segundos. Debajo, cuatro tarjetas de dashboard que dicen
 * "8 de 14" sin dejarte hacer nada con ese número.
 *
 * Acá el buscador es la página. El estado del sistema baja a una línea, y el
 * "8 de 14" se convierte en el rail de proveedores: cada uno con su color y
 * cuándo sincronizó. Un proveedor vencido se ve y se toca, en vez de quedar
 * escondido adentro de una cuenta.
 */

export type ProvState = {
  name: string;
  color: string;
  sync: string;
  on: boolean;
  stale?: boolean;
};

export type SearchRow = { q: string; count?: number };

export default function SearchHome({
  providers,
  top,
  recent,
  suggestions,
}: {
  providers: ProvState[];
  top: SearchRow[];
  recent: SearchRow[];
  suggestions: string[];
}) {
  const [q, setQ] = useState("");
  const active = providers.filter((p) => p.on).length;
  const stale = providers.filter((p) => p.stale).length;

  return (
    <div className="hm">
      <div className="hm__mesh" aria-hidden="true" />

      <div className="hm__inner">
        <h2 className="hm__q">Buscá una vez. Te responden todos.</h2>

        <form className="hm__field" onSubmit={(e) => e.preventDefault()}>
          <div className="hm__input">
            <Search size={17} strokeWidth={1.6} style={{ color: "var(--hm-faint)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, part number, EAN o código del distribuidor"
              aria-label="Buscar producto"
            />
          </div>
          <button type="submit" className="hm__go">
            Buscar
          </button>
        </form>

        {/* Lo que antes eran cuatro tarjetas de dashboard, en una línea */}
        <p className="hm__state mono">
          <span>
            <b>{active}</b> de {providers.length} proveedores sincronizados
          </span>
          <span>
            dólar oficial <b>1.530,00</b>
          </span>
          <span>
            carrito <b>6</b> ítems · 2 proveedores
          </span>
          {stale > 0 && (
            <span style={{ color: "var(--hm-ember)" }}>
              {stale} {stale === 1 ? "lista vencida" : "listas vencidas"}
            </span>
          )}
        </p>

        <div className="hm__sug">
          <span>Categorías</span>
          {suggestions.map((s) => (
            <button key={s} type="button" className="hm__chip">
              {s}
            </button>
          ))}
        </div>

        {/* El rail: el "8 de 14" convertido en algo que se puede tocar */}
        <div className="hm__sec">
          <h3>Tus proveedores</h3>
          <a href="#">
            Administrar <ArrowUpRight size={11} strokeWidth={1.8} style={{ display: "inline" }} />
          </a>
        </div>
        <div className="hm__rail">
          {providers.map((p) => (
            <button
              key={p.name}
              type="button"
              className="hm__prov"
              data-state={p.on ? "on" : "off"}
              data-stale={p.stale ? "true" : "false"}
              style={{ ["--pv" as string]: p.color }}
            >
              <span className="hm__prov-name">{p.name}</span>
              <span className="hm__prov-sync mono">{p.sync}</span>
            </button>
          ))}
        </div>

        <div className="hm__sec">
          <h3>Tu historial</h3>
        </div>
        <div className="hm__cols">
          <div>
            <p className="hm__prov-sync mono" style={{ marginBottom: "0.35rem" }}>
              Más buscadas
            </p>
            <div className="hm__list">
              {top.map((r, i) => (
                <button key={r.q} type="button" className="hm__row">
                  <span className="hm__rank mono">{i + 1}</span>
                  <span className="q">{r.q}</span>
                  <span className="hm__count mono">{r.count}×</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="hm__prov-sync mono" style={{ marginBottom: "0.35rem" }}>
              Recientes
            </p>
            <div className="hm__list">
              {recent.map((r) => (
                <button key={r.q} type="button" className="hm__row">
                  <span className="q">{r.q}</span>
                  <ArrowUpRight size={13} strokeWidth={1.6} style={{ color: "var(--hm-faint)" }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
