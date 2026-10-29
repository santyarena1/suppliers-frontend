"use client";

import { Check, FileText, MessageCircle } from "lucide-react";
import { Reveal, useInView } from "./Reveal";
import { ars } from "@/lib/marketing-demo";

const TIERS = ["Oficina", "Gamer entrada", "Gamer media", "Gamer alta", "Diseño y streaming"];

/** Un armado de ejemplo (gamer alta). Precios de costo de ejemplo, en pesos. */
const PARTS = [
  { step: "Procesador", name: "AMD Ryzen 7 9700X", price: 467_580, dist: "Distribuidor 1" },
  { step: "Mother", name: "ASUS TUF Gaming B850M-E WiFi", price: 347_903, dist: "Distribuidor 1" },
  { step: "Memoria", name: "32 GB DDR5 6000 (2 × 16 GB)", price: 945_804, dist: "Distribuidor 2" },
  { step: "Placa de video", name: "Radeon RX 9070 XT 16 GB", price: 1_471_174, dist: "Distribuidor 3" },
  { step: "Disco", name: "SSD 1 TB NVMe", price: 272_805, dist: "Distribuidor 1" },
  { step: "Fuente", name: "850 W 80 Plus Gold", price: 112_582, dist: "Distribuidor 3" },
  { step: "Gabinete", name: "Mid tower, 4 ventiladores", price: 130_253, dist: "Distribuidor 1" },
];
const MARGIN = 25;

const POINTS = [
  "Elegís la gama y NODO arma la PC con lo que tiene stock en tus distribuidores: cada pieza a la altura de las demás.",
  "Chequea socket, memoria, largo de la placa, fuente y cables. Si algo no entra, te avisa antes de presupuestar.",
  "Con un clic, el presupuesto en PDF con tu marca: con el margen que ya tenés configurado o con un porcentaje propio.",
  "Tus vendedores cotizan y arman presupuestos numerados con el precio de venta; el costo queda para vos.",
  "Lo mandás por WhatsApp, lo guardás y, cuando el cliente acepta, lo pasás al carrito.",
];

/** Armador de PC, presupuestos y modo vendedor: lo que se vende con lo que se compra. */
export function BuilderSection() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const cost = PARTS.reduce((s, p) => s + p.price, 0);
  const sale = Math.round(cost * (1 + MARGIN / 100));

  return (
    <section id="armador" className="nl-section nl-divider scroll-mt-16">
      <div className="nl-shell grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-2)]">Nuevo · Armador de PC</p>
          <h2 className="nl-h2 mt-3">Armá la PC y mandá el presupuesto en un minuto</h2>
          <ul className="mt-8 flex flex-col gap-3.5 text-[0.975rem] text-[var(--fg)]">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent-2)]" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={100}>
          <div ref={ref} className="nl-surface p-5 sm:p-7">
            <div className="flex flex-wrap gap-2">
              {TIERS.map((t) => (
                <span
                  key={t}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    t === "Gamer alta" ? "border-[var(--accent)] bg-[var(--accent-soft)] text-white" : "border-[var(--line)] text-[var(--fg-3)]"
                  }`}
                >
                  {t}
                </span>
              ))}
            </div>
            <ul className="mt-5 divide-y divide-[var(--line)] rounded-[12px] border border-[var(--line)]">
              {PARTS.map((p, i) => (
                <li
                  key={p.step}
                  className="flex items-center gap-3 px-3.5 py-2.5 text-sm transition-opacity duration-500"
                  style={{ opacity: inView ? 1 : 0, transitionDelay: `${150 + i * 80}ms` }}
                >
                  <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-[rgb(62_207_142/0.18)] text-[#7fe3b4]" aria-hidden>
                    <Check className="h-3 w-3" />
                  </span>
                  <span className="w-24 flex-shrink-0 text-[11px] uppercase tracking-wide text-[var(--fg-3)]">{p.step}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--fg)]">{p.name}</span>
                  <span className="hidden whitespace-nowrap text-[11px] text-[var(--fg-3)] sm:inline">{p.dist}</span>
                  <span className="whitespace-nowrap tabular-nums text-[var(--fg-2)]">{ars(p.price)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 grid grid-cols-3 gap-2.5">
              <div className="rounded-[12px] border border-[var(--line)] bg-[var(--bg-2)] px-3 py-3">
                <p className="text-[11px] text-[var(--fg-3)]">Costo</p>
                <p className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums text-white">{ars(cost)}</p>
              </div>
              <div className="rounded-[12px] border border-[rgb(139_127_255/0.45)] bg-[var(--accent-soft)] px-3 py-3">
                <p className="text-[11px] text-[var(--fg-2)]">Tu ganancia</p>
                <p className="mt-1 text-base font-semibold tabular-nums text-white">{MARGIN} %</p>
              </div>
              <div className="rounded-[12px] border border-[rgb(62_207_142/0.4)] bg-[rgb(62_207_142/0.08)] px-3 py-3">
                <p className="text-[11px] text-[#7fe3b4]">Al cliente</p>
                <p className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums text-[#7fe3b4]">{ars(sale)}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-white">
                <FileText className="h-4 w-4" aria-hidden /> Presupuesto en PDF
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(62_207_142/0.45)] px-3.5 py-2 text-sm font-semibold text-[#7fe3b4]">
                <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
              </span>
            </div>
            <p className="mt-3 text-xs text-[var(--fg-3)]">Compatible y con stock en tus distribuidores. Precios de ejemplo.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
