"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronDown, Clock, Search, TrendingDown } from "lucide-react";
import CardPass, { type PassCard } from "./CardPass";

/**
 * Dos pantallas distintas.
 *
 * INICIO es el módulo al que entrás: el buscador arriba, el estado de tu
 * operación en una línea, y tus proveedores y tu historial abajo.
 *
 * BÚSQUEDA SIN CONSULTA es el estado del módulo de búsqueda antes de escribir.
 * Los desplegables de categoría, marca y distribuidor son los que ya existen,
 * los dos módulos de publicidad conservan sus trece espacios con sus tamaños, y
 * la grilla de bajas de precio queda igual. Solo cambia la estética.
 */

export type ProvState = {
  name: string;
  color: string;
  sync: string;
  on: boolean;
  stale?: boolean;
};

export type SearchRow = { q: string; count?: number };

export type AdSlot = { slot: string; title: string; kind: "propio" | "patrocinado" | "demo"; tone: string };

/* ============================================================
 * MÓDULO INICIO
 * ========================================================== */

export function HomeInicio({
  providers,
  top,
  recent,
  categories,
}: {
  providers: ProvState[];
  top: SearchRow[];
  recent: SearchRow[];
  categories: string[];
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
          {categories.map((s) => (
            <button key={s} type="button" className="hm__chip">
              {s}
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

/* ============================================================
 * BÚSQUEDA · SIN CONSULTA
 * ========================================================== */

function AdBento({ slots, variant }: { slots: AdSlot[]; variant: "primary" | "secondary" }) {
  return (
    <div className={`se__bento se__bento--${variant}`}>
      {slots.map((b) => (
        <a
          key={b.slot}
          href="#"
          className={`se__ad se__ad--${b.slot}`}
          style={{ ["--ad" as string]: b.tone }}
        >
          <span className="se__ad-kind mono">{b.kind}</span>
          <span className="se__ad-body">
            <b>{b.title}</b>
            <em className="mono">{b.slot}</em>
          </span>
        </a>
      ))}
    </div>
  );
}

export function SearchEmpty({
  primaryAds,
  secondaryAds,
  partners,
  drops,
  recent,
}: {
  primaryAds: AdSlot[];
  secondaryAds: AdSlot[];
  partners: string[];
  drops: PassCard[];
  recent: SearchRow[];
}) {
  const [q, setQ] = useState("");

  return (
    <div className="hm hm--search">
      {/* La barra del módulo con sus tres desplegables, como ya está */}
      <div className="se__bar">
        <div className="se__input">
          <Search size={15} strokeWidth={1.7} style={{ color: "var(--hm-faint)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar producto..."
            aria-label="Buscar producto"
          />
        </div>

        <div className="se__filters">
          {["Categoría", "Marca", "Distribuidor"].map((label) => (
            <button key={label} type="button" className="se__filter">
              {label}
              <ChevronDown size={12} strokeWidth={1.8} />
            </button>
          ))}
        </div>

        <span className="se__prefs mono">ARS · Dólar oficial · con IVA</span>
      </div>

      <div className="se__body">
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

        <AdBento slots={primaryAds} variant="primary" />

        <p className="se__partners-title mono">Marcas que trabajan con la red</p>
        <div className="se__partners">
          {partners.map((p) => (
            <span key={p} className="se__partner">
              {p}
            </span>
          ))}
        </div>

        <AdBento slots={secondaryAds} variant="secondary" />

        <div className="hm__sec">
          <h3>
            <TrendingDown size={11} strokeWidth={2} style={{ display: "inline", marginRight: "0.4rem" }} />
            Bajaron de precio
          </h3>
          <a href="#">Descuentos y bajas recientes · varios proveedores</a>
        </div>
        <div className="se__drops">
          {drops.map((d) => (
            <CardPass key={d.externalId} c={d} />
          ))}
        </div>
      </div>
    </div>
  );
}
