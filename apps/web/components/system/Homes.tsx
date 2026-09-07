"use client";

import { useState } from "react";
import { ArrowUpRight, Clock, Search, TrendingDown } from "lucide-react";

/**
 * Dos pantallas distintas, no una.
 *
 * INICIO es el módulo al que entrás a la mañana: te tiene que decir qué cambió
 * desde ayer. Bajas de precio, listas vencidas, el carrito a medio armar, el
 * estado de tus proveedores. El buscador está, pero no es el protagonista.
 *
 * BÚSQUEDA VACÍA es el estado del módulo de búsqueda cuando todavía no
 * escribiste nada. Ahí no va nada del estado del sistema: va el campo, y lo que
 * te ayuda a formar la consulta. Nada más.
 */

export type ProvState = {
  name: string;
  color: string;
  sync: string;
  on: boolean;
  stale?: boolean;
};

export type SearchRow = { q: string; count?: number };

export type DropRow = {
  name: string;
  provider: string;
  color: string;
  price: string;
  previous: string;
  drop: number;
};

/* ============================================================
 * MÓDULO INICIO
 * ========================================================== */

export function HomeInicio({
  providers,
  drops,
  top,
}: {
  providers: ProvState[];
  drops: DropRow[];
  top: SearchRow[];
}) {
  const active = providers.filter((p) => p.on).length;
  const stale = providers.filter((p) => p.stale);

  return (
    <div className="hm">
      <div className="hm__inner">
        <p className="hm__kicker mono">Inicio</p>

        {/* El estado del sistema en una línea, no en cuatro tarjetas de dashboard */}
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
          {stale.length > 0 && (
            <span style={{ color: "var(--hm-ember)" }}>
              {stale.length === 1 ? `${stale[0].name}: lista vencida` : `${stale.length} listas vencidas`}
            </span>
          )}
        </p>

        {/* La razón real para abrir la app todos los días */}
        <div className="hm__sec hm__sec--first">
          <h3>
            <TrendingDown size={11} strokeWidth={2} style={{ display: "inline", marginRight: "0.4rem" }} />
            Bajaron desde la última sincronización
          </h3>
          <a href="#">
            Ver las 23 <ArrowUpRight size={11} strokeWidth={1.8} style={{ display: "inline" }} />
          </a>
        </div>
        <div className="hm__drops">
          {drops.map((d) => (
            <button key={d.name} type="button" className="hm__drop" style={{ ["--pv" as string]: d.color }}>
              <span className="hm__drop-pct mono">−{d.drop}%</span>
              <span className="hm__drop-name">{d.name}</span>
              <span className="hm__drop-prov" style={{ color: d.color }}>
                {d.provider}
              </span>
              <span className="hm__drop-price mono">
                {d.price} <s>{d.previous}</s>
              </span>
            </button>
          ))}
        </div>

        {/* El "8 de 14" convertido en algo que se puede tocar */}
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
          <h3>Volver a lo tuyo</h3>
        </div>
        <div className="hm__list">
          {top.map((r, i) => (
            <button key={r.q} type="button" className="hm__row">
              <span className="hm__rank mono">{i + 1}</span>
              <Search size={13} strokeWidth={1.6} style={{ color: "var(--hm-faint)" }} />
              <span className="q">{r.q}</span>
              <span className="hm__count mono">{r.count}×</span>
              <ArrowUpRight size={13} strokeWidth={1.6} style={{ color: "var(--hm-faint)" }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * BÚSQUEDA · ESTADO VACÍO
 * ========================================================== */

export function SearchEmpty({
  recent,
  categories,
}: {
  recent: SearchRow[];
  categories: string[];
}) {
  const [q, setQ] = useState("");

  return (
    <div className="hm hm--search">
      <div className="hm__mesh" aria-hidden="true" />

      <div className="hm__inner hm__inner--center">
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

        {/* Lo que ayuda a escribir la consulta, no el estado del sistema */}
        <p className="hm__hint mono">
          Buscá por part number si lo tenés: es lo único que escriben igual todos los
          distribuidores.
        </p>

        <div className="hm__sug">
          <span>Categorías</span>
          {categories.map((s) => (
            <button key={s} type="button" className="hm__chip">
              {s}
            </button>
          ))}
        </div>

        {recent.length > 0 && (
          <div className="hm__sug hm__sug--recent">
            <span>
              <Clock size={10} strokeWidth={1.8} style={{ display: "inline", marginRight: "0.3rem" }} />
              Recientes
            </span>
            {recent.map((r) => (
              <button key={r.q} type="button" className="hm__chip">
                {r.q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
