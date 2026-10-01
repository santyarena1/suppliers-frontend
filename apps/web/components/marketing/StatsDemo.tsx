"use client";

import { useState } from "react";
import { LayoutDashboard, Truck } from "lucide-react";
import { Reveal } from "./Reveal";
import { usd } from "./SearchDemo";

/**
 * El tablero "Compras de este local" de NODO, con datos de ejemplo: período,
 * pestañas, números del período, evolución mensual, ranking y de quién
 * dependés. Distribuidores y marcas anónimos: no se compara a nadie.
 */

type Period = "30" | "90" | "365";
type Tab = "distribuidores" | "marcas" | "categorias";

const PERIODS: { key: Period; label: string; scale: number; months: number }[] = [
  { key: "30", label: "30 días", scale: 1, months: 1 },
  { key: "90", label: "90 días", scale: 2.9, months: 3 },
  { key: "365", label: "12 meses", scale: 11.6, months: 12 },
];

const TABS: { key: Tab; label: string }[] = [
  { key: "distribuidores", label: "Distribuidores" },
  { key: "marcas", label: "Marcas" },
  { key: "categorias", label: "Categorías" },
];

/** Compras por mes en USD, del más viejo al más nuevo. */
const MONTHLY = [9.8, 11.2, 10.4, 12.9, 13.6, 12.1, 14.8, 15.3, 13.9, 16.8, 17.4, 18.6].map((k) => k * 1000);
const MONTH_LABELS = ["Oct", "Nov", "Dic", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep"];

const RANKS: Record<Tab, { label: string; share: number }[]> = {
  distribuidores: [
    { label: "Distribuidor 1", share: 38 },
    { label: "Distribuidor 2", share: 27 },
    { label: "Distribuidor 3", share: 19 },
    { label: "Distribuidor 4", share: 11 },
    { label: "Tu proveedor por lista", share: 5 },
  ],
  marcas: [
    { label: "Marca 1", share: 31 },
    { label: "Marca 2", share: 22 },
    { label: "Marca 3", share: 18 },
    { label: "Marca 4", share: 15 },
    { label: "Otras", share: 14 },
  ],
  categorias: [
    { label: "Memorias", share: 29 },
    { label: "Almacenamiento", share: 24 },
    { label: "Monitores", share: 19 },
    { label: "Periféricos", share: 16 },
    { label: "Redes", share: 12 },
  ],
};

const ars = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;

function MonthlyChart({ months }: { months: number }) {
  const data = MONTHLY.slice(-Math.max(months, 6));
  const labels = MONTH_LABELS.slice(-data.length);
  const max = Math.max(...data) * 1.12;
  const W = 600;
  const H = 180;
  const step = W / (data.length - 1);
  const pts = data.map((v, i) => [i * step, H - (v / max) * H] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const last = pts[pts.length - 1];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full overflow-visible sm:h-44" preserveAspectRatio="none" role="img" aria-label="Compras por mes en aumento">
        <defs>
          <linearGradient id="nl-stats-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(106 108 246 / 0.45)" />
            <stop offset="100%" stopColor="rgb(106 108 246 / 0)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgb(191 210 255 / 0.08)" strokeDasharray="4 6" />
        ))}
        <path key={`a${data.length}`} d={area} fill="url(#nl-stats-fill)" className="nl-anim-in" />
        <path key={`l${data.length}`} d={line} pathLength={1} fill="none" stroke="#8b7fff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" className="nl-draw" />
        <circle cx={last[0]} cy={last[1]} r="5" fill="#ff6a3d" stroke="#0b0d1a" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 flex justify-between font-mono text-[10.5px] text-[var(--fg-3)]">
        {labels.map((m, i) => (
          <span key={m} className={data.length > 6 && i % 2 ? "hidden sm:inline" : ""}>
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatsDemo() {
  const [period, setPeriod] = useState<Period>("90");
  const [tab, setTab] = useState<Tab>("distribuidores");
  const p = PERIODS.find((x) => x.key === period)!;
  const spend = 16_840 * p.scale;
  const orders = Math.round(41 * p.scale);
  const units = Math.round(612 * p.scale);
  const shippingArs = 214_500 * p.scale;
  const rank = RANKS[tab];
  // Cómo salen los pedidos, proporcional al período (18 moto, 14 expreso, 9 retiro cada 41).
  const moto = Math.round((orders * 18) / 41);
  const expreso = Math.round((orders * 14) / 41);
  const retiro = orders - moto - expreso;
  const top = RANKS.distribuidores[0];

  const kpis = [
    { label: "Comprado", value: usd(spend), hint: `${p.label}` },
    { label: "Pedidos", value: orders.toLocaleString("es-AR"), hint: `Ticket ${usd(spend / orders)}` },
    { label: "Unidades", value: units.toLocaleString("es-AR"), hint: `${(units / orders).toFixed(1).replace(".", ",")} por pedido` },
    { label: "Gastado en envíos", value: ars(shippingArs), hint: `Retiro ${retiro} · envío ${moto + expreso}` },
  ];

  return (
    <section id="estadisticas" className="nl-section nl-divider scroll-mt-16">
      <div className="nl-shell">
        <Reveal>
          <h2 className="nl-h2 max-w-3xl">Sabés cuánto, a quién y qué le comprás</h2>
          <p className="nl-lead mt-5">
            NODO arma el tablero con tus propios pedidos: por mes, por distribuidor, por marca y por categoría. Ves de
            quién dependés, cuánto se va en envíos y cómo viene cada mes, sin armar una planilla.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div className="nl-surface mt-12 overflow-hidden" role="group" aria-label="Ejemplo del tablero de compras de NODO">
            {/* Encabezado como en la app */}
            <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                  <LayoutDashboard className="h-4 w-4 text-[var(--accent-2)]" aria-hidden /> Compras de este local
                </p>
                <p className="mt-0.5 text-xs text-[var(--fg-3)]">Pedidos al portal y offline. Datos de ejemplo.</p>
              </div>
              <div className="flex gap-1 self-start rounded-[10px] border border-[var(--line)] bg-[var(--bg-2)] p-0.5">
                {PERIODS.map((x) => (
                  <button
                    key={x.key}
                    type="button"
                    onClick={() => setPeriod(x.key)}
                    aria-pressed={period === x.key}
                    className={`rounded-[8px] px-3 py-1.5 text-xs font-medium transition-colors ${
                      period === x.key ? "bg-[var(--accent)] text-white" : "text-[var(--fg-3)] hover:text-white"
                    }`}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-4 p-4 sm:p-6">
              {/* Números del período */}
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
                {kpis.map((k) => (
                  <div key={k.label} className="rounded-[12px] border border-[var(--line)] bg-[var(--bg-2)] px-4 py-3.5">
                    <p className="text-[11px] text-[var(--fg-3)]">{k.label}</p>
                    <p key={`${k.label}-${period}`} className="nl-anim-in mt-1 whitespace-nowrap text-lg font-semibold tabular-nums text-white sm:text-xl">
                      {k.value}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--fg-3)]">{k.hint}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
                <div className="rounded-[12px] border border-[var(--line)] bg-[var(--bg-2)] p-4 sm:p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-white">Evolución mensual</p>
                    <p className="text-xs text-[var(--good)]">+12 % contra el período anterior</p>
                  </div>
                  <div className="mt-4">
                    <MonthlyChart months={p.months} />
                  </div>
                </div>

                <div className="rounded-[12px] border border-[var(--line)] bg-[var(--bg-2)] p-4 sm:p-5">
                  <div className="flex gap-1 overflow-x-auto border-b border-[var(--line)] [scrollbar-width:none]" role="tablist" aria-label="Ranking">
                    {TABS.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.key}
                        onClick={() => setTab(t.key)}
                        className={`-mb-px whitespace-nowrap border-b-2 px-2.5 py-2 text-xs font-medium transition-colors ${
                          tab === t.key ? "border-[var(--accent-2)] text-white" : "border-transparent text-[var(--fg-3)] hover:text-white"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <ul className="mt-4 flex flex-col gap-3" role="tabpanel">
                    {rank.map((r, i) => (
                      <li key={`${tab}-${r.label}`} className="nl-anim-in" style={{ animationDelay: `${i * 50}ms` }}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="truncate text-[var(--fg)]">{r.label}</span>
                          <span className="whitespace-nowrap tabular-nums text-[var(--fg-2)]">
                            {usd((spend * r.share) / 100)} <span className="text-[var(--fg-3)]">· {r.share} %</span>
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className={`h-full rounded-full ${i === 0 ? "bg-[var(--accent)]" : "bg-[rgb(139_127_255/0.4)]"}`}
                            style={{ width: `${(r.share / rank[0].share) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[12px] border border-[var(--line)] bg-[var(--bg-2)] p-4 sm:p-5">
                  <p className="text-sm font-semibold text-white">De quién dependés</p>
                  <p className="mt-1 text-xs text-[var(--fg-3)]">Qué parte de lo comprado se va a uno solo o a unos pocos.</p>
                  <div className="mt-4 flex h-3 overflow-hidden rounded-full" aria-hidden>
                    {RANKS.distribuidores.map((r, i) => (
                      <span
                        key={r.label}
                        className="h-full"
                        style={{ width: `${r.share}%`, background: ["#6a6cf6", "#8b7fff", "#a9a4ff", "#c9c6ff", "#3a3d6b"][i] }}
                      />
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-[var(--fg-2)]">
                    {top.label} se lleva el <strong className="text-white">{top.share} %</strong>. Los tres más grandes, el{" "}
                    <strong className="text-white">84 %</strong>.
                  </p>
                </div>
                <div className="rounded-[12px] border border-[var(--line)] bg-[var(--bg-2)] p-4 sm:p-5">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                    <Truck className="h-4 w-4 text-[var(--fg-3)]" aria-hidden /> Envíos
                  </p>
                  <p className="mt-1 text-xs text-[var(--fg-3)]">Cómo salen tus pedidos y cuánto se va en flete.</p>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                      { l: "Moto", v: `${moto} ped.` },
                      { l: "Expreso", v: `${expreso} ped.` },
                      { l: "Retiro", v: `${retiro} ped.` },
                    ].map((x) => (
                      <div key={x.l} className="rounded-[10px] border border-[var(--line)] px-3 py-2.5">
                        <p className="text-[11px] text-[var(--fg-3)]">{x.l}</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-white">{x.v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-[var(--fg-3)]">
            El resumen de compras viene en todos los planes. El análisis completo, con distribuidores, marcas, productos,
            envíos y pagos, en NODO Pro.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
