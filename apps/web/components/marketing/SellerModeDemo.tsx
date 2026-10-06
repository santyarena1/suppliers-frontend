"use client";

import { useEffect, useState } from "react";
import { Check, Eye, MessageCircle, ShoppingCart, Tag } from "lucide-react";
import { DEMO_ARS_PER_USD, SEARCHES, ars, withIva } from "@/lib/marketing-demo";
import { Reveal, useInView, usePrefersReducedMotion } from "./Reveal";

type View = "owner" | "seller";

/** Márgenes de ejemplo: por categoría (monitores) y uno propio de producto. */
const LINES = [
  { product: SEARCHES[1].results[0], qty: 2, margin: 22, source: "Categoría Monitores" },
  { product: SEARCHES[0].results[1], qty: 4, margin: 30, source: "Producto" },
  { product: SEARCHES[1].results[1], qty: 1, margin: 22, source: "Categoría Monitores" },
];

const costOf = (l: (typeof LINES)[number]) => Math.round(withIva(l.product.net, l.product.iva) * DEMO_ARS_PER_USD);
const saleOf = (l: (typeof LINES)[number]) => Math.round((costOf(l) * (1 + l.margin / 100)) / 100) * 100 - 1;

/**
 * Modo vendedor y presupuestos: el mismo producto visto por el dueño (costo,
 * margen y venta) y por el vendedor (solo venta), y un presupuesto numerado
 * listo para mandar por WhatsApp o pasar a compra. Alterna solo entre las dos
 * vistas mientras está a la vista.
 */
export function SellerModeDemo() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const reduced = usePrefersReducedMotion();
  const [view, setView] = useState<View>("owner");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!inView || touched || reduced) return;
    const t = window.setInterval(() => setView((v) => (v === "owner" ? "seller" : "owner")), 3200);
    return () => window.clearInterval(t);
  }, [inView, touched, reduced]);

  const pick = (v: View) => {
    setTouched(true);
    setView(v);
  };

  const first = LINES[0];
  const total = LINES.reduce((s, l) => s + saleOf(l) * l.qty, 0);

  return (
    <section className="nl-section nl-divider">
      <div className="nl-shell grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <Reveal>
          <span className="nl-chip nl-chip--accent">Incluido en Pro y Custom</span>
          <h2 className="nl-h2 mt-4">Tus vendedores cotizan. El costo queda para vos.</h2>
          <p className="nl-lead mt-5">
            Ponés tu margen por distribuidor, por categoría o por producto. Tus vendedores ven solo el precio de venta,
            arman presupuestos numerados para cada cliente y se los mandan por WhatsApp. Cuando el cliente acepta, lo
            pasás a compra en un clic.
          </p>
          <ul className="mt-8 flex flex-col gap-3 text-[0.975rem] text-[var(--fg)]">
            {[
              "Márgenes por distribuidor, categoría o producto, en masa o uno por uno.",
              "El vendedor nunca ve tu costo: ni en la pantalla ni en lo que llega a su navegador.",
              "Presupuestos con precio de venta fijo, nombre y teléfono del cliente.",
              "Copiar, WhatsApp o imprimir. Y del presupuesto aceptado, al carrito.",
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent-2)]" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={100}>
          <div ref={ref} className="flex flex-col gap-4">
            {/* El mismo producto, visto por el dueño y por el vendedor */}
            <div className="nl-surface p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Así lo ve cada uno</p>
                <div className="flex rounded-full border border-[var(--line)] p-0.5 text-xs" role="tablist" aria-label="Vista">
                  {(
                    [
                      ["owner", "Dueño"],
                      ["seller", "Vendedor"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={view === key}
                      onClick={() => pick(key)}
                      className={`rounded-full px-3 py-1 font-medium transition-colors ${
                        view === key ? "bg-[var(--accent)] text-white" : "text-[var(--fg-2)] hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-white p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={first.product.image} alt={first.product.name} className="h-full w-full object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{first.product.name}</p>
                  <p className="text-xs text-[var(--fg-3)]">{first.product.code}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2" aria-live="polite">
                <div
                  className={`rounded-[12px] border px-3 py-2.5 transition-opacity duration-300 ${
                    view === "owner" ? "border-[var(--line)] bg-[var(--bg-2)] opacity-100" : "border-dashed border-[var(--line)] opacity-40"
                  }`}
                >
                  <p className="text-[11px] text-[var(--fg-3)]">Costo final</p>
                  <p className="mt-1 whitespace-nowrap text-sm font-semibold tabular-nums text-white sm:text-base">
                    {view === "owner" ? ars(costOf(first)) : "Oculto"}
                  </p>
                </div>
                <div
                  className={`rounded-[12px] border px-3 py-2.5 transition-opacity duration-300 ${
                    view === "owner" ? "border-[rgb(62_207_142/0.4)] bg-[rgb(62_207_142/0.08)] opacity-100" : "border-dashed border-[var(--line)] opacity-40"
                  }`}
                >
                  <p className="text-[11px] text-[#7fe3b4]">Margen</p>
                  <p className="mt-1 whitespace-nowrap text-sm font-semibold tabular-nums text-[#7fe3b4] sm:text-base">
                    {view === "owner" ? `${first.margin} %` : "—"}
                  </p>
                </div>
                <div className="rounded-[12px] border border-[rgb(139_127_255/0.45)] bg-[var(--accent-soft)] px-3 py-2.5">
                  <p className="text-[11px] text-[var(--fg-2)]">Precio de venta</p>
                  <p className="mt-1 whitespace-nowrap text-sm font-semibold tabular-nums text-white sm:text-base">{ars(saleOf(first))}</p>
                </div>
              </div>
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--fg-3)]">
                {view === "owner" ? <Tag className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
                {view === "owner"
                  ? `Margen de la ${first.source.toLowerCase()} en este distribuidor.`
                  : "El vendedor ve solo el precio de venta."}
              </p>
            </div>

            {/* Presupuesto del vendedor */}
            <div className="nl-surface p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">JP</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">Presupuesto #12 · Juan Pérez</p>
                  <p className="text-xs text-[var(--fg-3)]">Precios de venta, con IVA</p>
                </div>
              </div>
              <ul className="mt-4 divide-y divide-[var(--line)] rounded-[12px] border border-[var(--line)]">
                {LINES.map((l, i) => (
                  <li
                    key={l.product.code}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm transition-opacity duration-500"
                    style={{ opacity: inView ? 1 : 0, transitionDelay: `${200 + i * 120}ms` }}
                  >
                    <span className="min-w-0 truncate text-[var(--fg)]">
                      <span className="tabular-nums text-[var(--fg-3)]">{l.qty} ×</span> {l.product.name}
                    </span>
                    <span className="whitespace-nowrap tabular-nums text-[var(--fg-2)]">{ars(saleOf(l) * l.qty)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-xs text-[var(--fg-3)]">Total</span>
                <span className="text-lg font-semibold tabular-nums text-white">{ars(total)}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <span className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-[rgb(62_207_142/0.4)] bg-[rgb(62_207_142/0.1)] px-3 py-2 text-xs font-semibold text-[#7fe3b4]">
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Enviar por WhatsApp
                </span>
                <span className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-xs font-semibold text-white">
                  <ShoppingCart className="h-3.5 w-3.5" aria-hidden /> Pasar a compra
                </span>
              </div>
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--fg-3)]">
                <Check className="h-3.5 w-3.5 text-[#7fe3b4]" aria-hidden /> El precio queda fijo hasta que lo actualices. Precios de ejemplo.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
