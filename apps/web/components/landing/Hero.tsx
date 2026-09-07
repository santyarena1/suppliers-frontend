"use client";

import { useEffect, useState } from "react";
import DataField, { FIELD_BEAT_MS, FIELD_CONVERGE_MS } from "./DataField";
import { Button, Chip, Shell, ICON_STROKE } from "./ui";
import { Check, Minus } from "lucide-react";

/** Ejemplo ilustrativo: un producto real, tres distribuidores anónimos, tres precios. */
const PRODUCT = "AMD Ryzen 5 5600 · AM4";
const OFFERS = [
  { source: "Distribuidor A", updated: "actualizado hace 4 min", price: "128,40", stock: "12 en stock", best: false, out: false },
  { source: "Distribuidor B", updated: "actualizado hace 9 min", price: "119,37", stock: "96 en stock", best: true, out: false },
  { source: "Distribuidor C", updated: "lista de hoy", price: "124,80", stock: "sin stock", best: false, out: true },
];

const FACTS = [
  { k: "Conexión", v: "API · portal · planilla" },
  { k: "Precio", v: "neto + IVA + IIBB + percepciones" },
  { k: "Compra", v: "pedido real en el portal del distribuidor" },
];

export default function Hero() {
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLanded(true);
      return;
    }
    const t = setTimeout(() => setLanded(true), FIELD_BEAT_MS + FIELD_CONVERGE_MS * 0.66);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="relative min-h-[100svh] flex flex-col justify-center overflow-hidden pt-24 sm:pt-28 pb-14">
      <DataField />
      <div className="lnd-vignette" />

      <Shell className="relative z-10">
        {/*
          En pantalla chica el orden del DOM manda: titular, panel, datos al pie.
          Así el momento autoral y la prueba de precio entran en el primer
          viewport del teléfono en vez de caer abajo del pliegue.
        */}
        <div className="grid gap-10 sm:gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-x-10 items-start">
          <div className="lg:col-start-1 lg:row-start-1">
            <h1 className="lnd-display lnd-display--xl">
              Todos tus distribuidores
              <br />
              en una sola búsqueda
            </h1>

            <p className="lnd-body mt-6 sm:mt-7 text-[1.02rem]">
              Conectás tus proveedores una vez. NODO te muestra quién tiene cada producto, a qué
              precio real puesto y con cuánto stock, y comprás sin salir del sistema.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button href="#cuenta">Crear mi cuenta</Button>
              <Button href="#buscar" variant="ghost">
                Ver cómo funciona
              </Button>
            </div>
          </div>

          {/* Las filas aterrizan donde el campo dejó las partículas. */}
          <div
            className="lnd-panel lnd-panel--sheer overflow-hidden lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-center"
            style={{
              opacity: landed ? 1 : 0,
              transform: landed ? "none" : "translate3d(0, 10px, 0)",
              transition:
                "opacity 700ms cubic-bezier(0.23,1,0.32,1), transform 700ms cubic-bezier(0.23,1,0.32,1)",
            }}
          >
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-[0.82rem] text-[var(--fg)]">{PRODUCT}</span>
              <Chip>3 distribuidores</Chip>
            </div>

            {OFFERS.map((o) => (
              <div
                key={o.source}
                data-field-row
                className={`lnd-row grid-cols-[1fr_auto] sm:grid-cols-[1.15fr_auto_auto]${o.best ? " lnd-row--best" : ""}`}
              >
                <div className="min-w-0">
                  <div className="text-[0.85rem] text-[var(--fg)]">{o.source}</div>
                  <div className="lnd-note mt-0.5">{o.updated}</div>
                </div>

                <div className="hidden sm:flex items-center gap-2">
                  {o.out ? (
                    <Chip tone="out">
                      <Minus className="w-3 h-3" strokeWidth={ICON_STROKE} />
                      {o.stock}
                    </Chip>
                  ) : (
                    <Chip>
                      <Check className="w-3 h-3" strokeWidth={ICON_STROKE} />
                      {o.stock}
                    </Chip>
                  )}
                </div>

                <div className="text-right">
                  <div
                    className="lnd-mono text-[1rem]"
                    style={{ color: o.best ? "var(--ember)" : o.out ? "var(--fg-faint)" : "var(--fg)" }}
                  >
                    USD {o.price}
                  </div>
                  {o.best && <div className="lnd-label mt-1 text-[var(--ember)]">Mejor precio</div>}
                </div>
              </div>
            ))}

            <div className="px-4 py-3 border-t" style={{ borderColor: "var(--hair)" }}>
              <p className="lnd-note leading-relaxed">
                Ejemplo ilustrativo. Los distribuidores se muestran anónimos: en tu cuenta aparecen
                los que vos conectaste, con su nombre.
              </p>
            </div>
          </div>

          <div className="lg:col-start-1 lg:row-start-2 lg:mt-12">
            {/* Contador de fuentes conectadas: el estado del ejemplo que se está mostrando. */}
            <div className="flex items-baseline gap-3">
              <span
                className="lnd-display text-[2.4rem] leading-none"
                style={{ fontVariationSettings: '"wdth" 72, "wght" 800', color: "var(--mist)" }}
              >
                03
              </span>
              <span className="lnd-note max-w-[16rem]">
                distribuidores consultados en esta misma búsqueda
              </span>
            </div>

            <hr className="lnd-rule my-6" />

            <dl className="grid sm:grid-cols-3 gap-x-6 gap-y-5 max-w-xl">
              {FACTS.map((f) => (
                <div key={f.k}>
                  <dt className="lnd-label">{f.k}</dt>
                  <dd className="mt-1.5 text-[0.78rem] leading-snug text-[var(--fg-dim)]">{f.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Shell>
    </section>
  );
}
