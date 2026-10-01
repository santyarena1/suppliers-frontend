"use client";

import { ExternalLink, Store } from "lucide-react";
import { DEMO_ARS_PER_USD, SEARCHES, ars, withIva } from "@/lib/marketing-demo";
import { Reveal, useInView } from "./Reveal";

/** Un monitor de la búsqueda de ASUS: el mismo producto que se ve arriba. */
const PRODUCT = SEARCHES[1].results[0];
const PERCEPTION = 3;

/** Precios de venta de ejemplo en locales de computación, en pesos. Sin nombres. */
const LOCALS = [
  { name: "Local 1", price: 279_900 },
  { name: "Local 2", price: 289_999 },
  { name: "Local 3", price: 304_500 },
  { name: "Local 4", price: 312_000 },
  { name: "Local 5", price: 329_999 },
];
const YOUR_WEB = 299_999;

/**
 * Lo que vale el producto afuera: precios de venta en locales de computación y
 * el de tu propia tienda web, contra tu costo final. Es la referencia que NODO
 * muestra en cada producto (botón de precios de venta y "Tu web" en la card).
 */
export function MarginDemo() {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const costUsd = withIva(PRODUCT.net, PRODUCT.iva) + (PRODUCT.net * PERCEPTION) / 100;
  const cost = Math.round(costUsd * DEMO_ARS_PER_USD);
  const margin = ((YOUR_WEB - cost) / cost) * 100;

  const prices = LOCALS.map((l) => l.price);
  const lo = Math.min(cost, ...prices) * 0.97;
  const hi = Math.max(...prices) * 1.02;
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const median = [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)];

  return (
    <section className="nl-section nl-divider">
      <div className="nl-shell grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <Reveal>
          <h2 className="nl-h2">Sabés cuánto ganás antes de comprar</h2>
          <p className="nl-lead mt-5">
            En cada producto ves a cuánto lo venden los locales de computación y, si cargaste tu tienda web, a cuánto lo
            tenés publicado vos. NODO te muestra el margen contra tu costo final, con impuestos incluidos.
          </p>
          <ul className="mt-8 flex flex-col gap-3 text-[0.975rem] text-[var(--fg)]">
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent-2)]" aria-hidden />
              Precios de venta de locales de consumidor final, para saber a cuánto se vende afuera.
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent-2)]" aria-hidden />
              Tu precio publicado al lado de tu costo, en la búsqueda y en la ficha del producto.
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent-2)]" aria-hidden />
              Tu tienda se elige una vez, en Configuración.
            </li>
          </ul>
        </Reveal>

        <Reveal delay={100}>
          <div ref={ref} className="nl-surface p-5 sm:p-7">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={PRODUCT.image} alt={PRODUCT.name} className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">{PRODUCT.name}</p>
                <p className="text-sm text-[var(--fg-3)]">{PRODUCT.code}</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2.5">
              <div className="rounded-[12px] border border-[var(--line)] bg-[var(--bg-2)] px-3 py-3">
                <p className="text-[11px] text-[var(--fg-3)]">Tu costo final</p>
                <p className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums text-white sm:text-lg">{ars(cost)}</p>
              </div>
              <div className="rounded-[12px] border border-[rgb(139_127_255/0.45)] bg-[var(--accent-soft)] px-3 py-3">
                <p className="text-[11px] text-[var(--fg-2)]">Tu web</p>
                <p className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums text-white sm:text-lg">{ars(YOUR_WEB)}</p>
              </div>
              <div className="rounded-[12px] border border-[rgb(62_207_142/0.4)] bg-[rgb(62_207_142/0.08)] px-3 py-3">
                <p className="text-[11px] text-[#7fe3b4]">Margen</p>
                <p className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums text-[#7fe3b4] sm:text-lg">
                  {margin.toFixed(0)} %
                </p>
              </div>
            </div>

            {/* Rango de precios de venta afuera, con tu costo y tu web marcados */}
            <div className="mt-7">
              <p className="text-sm font-semibold text-white">Precios de venta en locales</p>
              <div className="relative mt-9 h-2 rounded-full bg-white/[0.06]" role="img" aria-label="Rango de precios de venta en locales, con tu costo y tu precio web">
                <div
                  className="absolute inset-y-0 rounded-full bg-[rgb(139_127_255/0.35)] transition-all duration-700 ease-out"
                  style={{ left: pos(Math.min(...prices)), right: `calc(100% - ${pos(Math.max(...prices))})`, opacity: inView ? 1 : 0 }}
                />
                {[
                  { v: cost, label: "Tu costo", tone: "bg-[var(--fg-2)]", text: "text-[var(--fg-2)]" },
                  { v: YOUR_WEB, label: "Tu web", tone: "bg-[var(--accent)]", text: "text-[var(--accent-2)]" },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-700 ease-out"
                    style={{ left: inView ? pos(m.v) : "0%" }}
                  >
                    <span className={`block h-4 w-4 rounded-full border-2 border-[var(--surface)] ${m.tone}`} />
                    <span className={`absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium ${m.text}`}>
                      {m.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between font-mono text-[10.5px] tabular-nums text-[var(--fg-3)]">
                <span>{ars(Math.min(...prices))}</span>
                <span>mediana {ars(median)}</span>
                <span>{ars(Math.max(...prices))}</span>
              </div>
            </div>

            <ul className="mt-6 divide-y divide-[var(--line)] rounded-[12px] border border-[var(--line)]">
              {LOCALS.map((l, i) => (
                <li
                  key={l.name}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-opacity duration-500"
                  style={{ opacity: inView ? 1 : 0, transitionDelay: `${300 + i * 90}ms` }}
                >
                  <span className="inline-flex items-center gap-2 text-[var(--fg)]">
                    <Store className="h-4 w-4 text-[var(--fg-3)]" aria-hidden /> {l.name}
                  </span>
                  <span className="whitespace-nowrap tabular-nums text-[var(--fg-2)]">{ars(l.price)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-[var(--fg-3)]">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Desde la ficha abrís el producto en tu web. Precios de ejemplo.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
