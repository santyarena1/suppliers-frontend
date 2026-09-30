"use client";

import { useState } from "react";
import { PLAN_CATALOG } from "@/lib/plans";
import { Reveal } from "./Reveal";
import { usd } from "./SearchDemo";

const WEEKS_PER_MONTH = 4.33;
/** Una búsqueda en NODO, mirando resultados de todos, toma alrededor de medio minuto. */
const NODO_MINUTES_PER_PRODUCT = 0.5;

function Slider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (n: number) => string;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-sm text-[var(--fg-2)]">
          {label}
        </label>
        <span className="text-lg font-semibold tabular-nums text-white">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        className="nl-range mt-3"
        style={{ ["--fill" as string]: `${((value - min) / (max - min)) * 100}%` }}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/**
 * Calculadora con los números de quien mira: tiempo que deja de buscar y
 * plata que puede dejar de pagar. Los supuestos están a la vista.
 */
export function Savings() {
  const [products, setProducts] = useState(40);
  const [distributors, setDistributors] = useState(4);
  const [minutes, setMinutes] = useState(2);
  const [hourCost, setHourCost] = useState(8);

  const hoursToday = (products * distributors * minutes * WEEKS_PER_MONTH) / 60;
  const hoursNodo = (products * NODO_MINUTES_PER_PRODUCT * WEEKS_PER_MONTH) / 60;
  const hoursSaved = Math.max(0, hoursToday - hoursNodo);
  const moneySaved = hoursSaved * hourCost;
  const pro = PLAN_CATALOG.PRO.monthlyPrice;
  const times = moneySaved / pro;
  const workdays = hoursSaved / 8;

  return (
    <section id="ahorro" className="nl-section nl-divider scroll-mt-16">
      <div className="nl-shell">
        <Reveal>
          <h2 className="nl-h2 max-w-3xl">Hacé la cuenta con tus números</h2>
          <p className="nl-lead mt-5">
            Mové los valores según cómo cotizás hoy. El cálculo está a la vista.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div className="mt-12 grid overflow-hidden rounded-[var(--r)] border border-[var(--line)] lg:grid-cols-[1.1fr_1fr]">
            <div className="flex flex-col gap-8 bg-[var(--surface)] p-6 sm:p-9">
              <Slider
                id="calc-productos"
                label="Productos que cotizás por semana"
                value={products}
                min={5}
                max={200}
                step={5}
                format={(n) => String(n)}
                onChange={setProducts}
              />
              <Slider
                id="calc-distribuidores"
                label="Distribuidores que revisás por producto"
                value={distributors}
                min={2}
                max={10}
                format={(n) => String(n)}
                onChange={setDistributors}
              />
              <Slider
                id="calc-minutos"
                label="Minutos para consultar cada uno"
                value={minutes}
                min={1}
                max={6}
                format={(n) => `${n} min`}
                onChange={setMinutes}
              />
              <div className="border-t border-[var(--line)] pt-8">
                <Slider
                  id="calc-hora"
                  label="Lo que te cuesta una hora de trabajo"
                  value={hourCost}
                  min={2}
                  max={40}
                  format={(n) => usd(n).replace(",00", "")}
                  onChange={setHourCost}
                />
              </div>
            </div>

            <div className="relative flex flex-col justify-between gap-10 overflow-hidden bg-[var(--bg-2)] p-6 sm:p-9" aria-live="polite">
              <div className="nl-glow" style={{ width: 380, height: 300, right: -140, bottom: -140 }} aria-hidden />
              <div className="relative">
                <p className="text-sm text-[var(--fg-2)]">Horas que dejás de buscar por mes</p>
                <p className="mt-2 text-6xl font-bold tracking-tight tabular-nums text-white">
                  {Math.round(hoursSaved)}
                  <span className="ml-2 text-2xl font-semibold text-[var(--fg-3)]">h</span>
                </p>
                <p className="mt-2 text-sm text-[var(--fg-3)]">
                  Hoy: {Math.round(hoursToday)} h. Con NODO: {Math.max(1, Math.round(hoursNodo))} h (una búsqueda por
                  producto). Son {workdays.toLocaleString("es-AR", { maximumFractionDigits: 1 })} jornadas de 8 h.
                </p>
              </div>
              <div className="relative">
                <p className="text-sm text-[var(--fg-2)]">Lo que valen esas horas por mes</p>
                <p className="mt-2 text-5xl font-bold tracking-tight tabular-nums text-[var(--good)]">
                  {usd(moneySaved).replace(",00", "")}
                </p>
                <p className="mt-3 max-w-sm text-[0.95rem] text-[var(--fg-2)]">
                  {times >= 1 ? (
                    <>
                      NODO Pro cuesta {usd(pro).replace(",00", "")} por mes: se paga{" "}
                      <strong className="text-white">{times.toLocaleString("es-AR", { maximumFractionDigits: 1 })} veces</strong>{" "}
                      solo con el tiempo que te devuelve.
                    </>
                  ) : (
                    <>NODO Pro cuesta {usd(pro).replace(",00", "")} por mes. Con más productos por semana, se paga solo.</>
                  )}
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
