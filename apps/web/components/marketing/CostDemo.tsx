"use client";

import { useEffect, useState } from "react";
import { COST_EXAMPLE, DEMO_ARS_PER_USD, DEMO_SHIPPING, withIva } from "@/lib/marketing-demo";
import { Reveal, useInView, usePrefersReducedMotion } from "./Reveal";
import { usd } from "./SearchDemo";

/** Unidades del pedido entre las que se reparte el envío en el ejemplo. */
const SHIP_UNITS = 8;

/**
 * Cómo se arma el precio que realmente pagás de UNA oferta: neto de lista, IVA
 * del producto, percepciones y el envío aproximado. No compara distribuidores.
 */
export function CostDemo() {
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>(0.45);
  const [step, setStep] = useState(4);
  const p = COST_EXAMPLE.product;
  const ivaUsd = Math.round(p.net * p.iva) / 100;
  const percUsd = Math.round(p.net * COST_EXAMPLE.perceptionPct) / 100;
  const ship = DEMO_SHIPPING[p.distributor];
  const shipUsd = Math.round((ship.ars / SHIP_UNITS / DEMO_ARS_PER_USD) * 100) / 100;
  const final = Math.round((p.net + ivaUsd + percUsd + shipUsd) * 100) / 100;

  useEffect(() => {
    if (reduced || !inView) return;
    setStep(0);
    const t = [setTimeout(() => setStep(1), 700), setTimeout(() => setStep(2), 1400), setTimeout(() => setStep(3), 2100), setTimeout(() => setStep(4), 2800)];
    return () => t.forEach(clearTimeout);
  }, [inView, reduced]);

  const rows = [
    { label: "Precio de lista", value: p.net, color: "bg-[var(--accent)]", show: step >= 0 },
    { label: `IVA ${p.iva.toLocaleString("es-AR")} %`, value: ivaUsd, color: "bg-[#9d9fff]", show: step >= 1 },
    { label: `${COST_EXAMPLE.perceptionLabel} ${COST_EXAMPLE.perceptionPct} %`, value: percUsd, color: "bg-[var(--ember)]", show: step >= 2 },
    {
      label: `Envío aprox. · ${ship.label}, repartido en ${SHIP_UNITS} u.`,
      value: shipUsd,
      color: "bg-[#3ecf8e]",
      show: step >= 3,
    },
  ];

  return (
    <section className="nl-section nl-divider">
      <div className="nl-shell grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <Reveal>
          <h2 className="nl-h2">El precio que ves es el que vas a pagar</h2>
          <p className="nl-lead mt-5">
            Cada producto muestra el precio de lista, el IVA que le corresponde y las percepciones que te aplica ese
            distribuidor según tu condición. Y el envío aproximado, según cómo te llega lo de ese distribuidor, repartido
            entre lo que llevás. Sin sumar a mano.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div ref={ref} className="nl-surface p-6 sm:p-8">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt={p.name} className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">{p.name}</p>
                <p className="text-sm text-[var(--fg-3)]">
                  {p.distributor} · {p.stock} u. en stock
                </p>
              </div>
            </div>

            <div className="mt-7 flex h-3 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
              {rows.map((r) => (
                <span
                  key={r.label}
                  className={`h-full ${r.color} transition-[width] duration-700 ease-out`}
                  style={{ width: r.show ? `${(r.value / final) * 100}%` : "0%" }}
                />
              ))}
            </div>

            <dl className="mt-6 flex flex-col gap-3">
              {rows.map((r) => (
                <div
                  key={r.label}
                  className={`flex items-center justify-between gap-4 transition-opacity duration-500 ${r.show ? "opacity-100" : "opacity-25"}`}
                >
                  <dt className="inline-flex items-center gap-2.5 text-[0.95rem] text-[var(--fg-2)]">
                    <span className={`h-2.5 w-2.5 rounded-full ${r.color}`} aria-hidden />
                    {r.label}
                  </dt>
                  <dd className="tabular-nums text-white">{usd(r.value)}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex items-end justify-between gap-4 border-t border-[var(--line)] pt-5">
              <p className="text-[0.95rem] text-[var(--fg-2)]">Lo que te sale por unidad</p>
              <p className={`text-3xl font-bold tabular-nums transition-colors duration-500 ${step >= 4 ? "text-white" : "text-[var(--fg-3)]"}`}>
                {usd(step >= 4 ? final : withIva(p.net, 0))}
              </p>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[var(--fg-3)]">
              El envío es aproximado: NODO lo aprende de tus pedidos o lo cargás vos. El costo final lo da el distribuidor al
              confirmar.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
