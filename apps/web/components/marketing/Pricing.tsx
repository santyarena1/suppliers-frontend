"use client";

import { Fragment, useState } from "react";
import { Check, ChevronDown, Minus } from "lucide-react";
import { BASE_SEARCH_LIMIT, PLAN_CATALOG, PLAN_FEATURE_GROUPS, type PlanCell, type TenantPlan } from "@/lib/plans";
import { Reveal } from "./Reveal";
import { SupplyPlans } from "./SupplyPlans";
import { rememberTrialPlan, TRIAL_DAYS, type TrialPlan } from "@/lib/trial-plan";

interface CardCopy {
  plan: TenantPlan;
  forWho: string;
  intro?: string;
  items: string[];
  cta: string;
  /** Con qué plan arranca la prueba gratis si elige esta tarjeta. */
  trialPlan: TrialPlan;
  trialNote: string;
}

const CARDS: CardCopy[] = [
  {
    plan: "BASE",
    forWho: "Para ordenar la compra y preparar los pedidos.",
    items: [
      "Todos tus distribuidores conectados",
      `Búsqueda en hasta ${BASE_SEARCH_LIMIT} a la vez`,
      "Precio final con impuestos y stock",
      "Carrito con varios distribuidores",
      "Pedido listo para mandar por WhatsApp",
    ],
    cta: `Probar Base ${TRIAL_DAYS} días gratis`,
    trialPlan: "BASE",
    trialNote: `${TRIAL_DAYS} días gratis. Después elegís tu plan.`,
  },
  {
    plan: "PRO",
    forWho: "Para comprar desde NODO sin entrar a ningún portal.",
    intro: "Todo lo de Base, y además:",
    items: [
      "Búsqueda en todos tus distribuidores a la vez",
      "Pedidos directos en el portal de cada distribuidor integrado",
      "Tus formas de pago y percepciones de cada uno",
      "Cuenta corriente, saldos y facturas",
      "Chat con tus vendedores",
      "Análisis de compras por mes, distribuidor y producto",
      "Aprobación de pedidos con el precio del día",
    ],
    cta: `Probar Pro ${TRIAL_DAYS} días gratis`,
    trialPlan: "PRO",
    trialNote: `${TRIAL_DAYS} días gratis. Después elegís tu plan.`,
  },
  {
    plan: "CUSTOM",
    forWho: "Para empresas con sistemas y procesos propios.",
    intro: "Todo lo de Pro, y además:",
    items: [
      "Integración con tu ERP o CRM",
      "Módulos y flujos para tu operación",
      "NODO con la identidad de tu empresa",
      "Lo pedís desde tu cuenta y te contactamos",
    ],
    cta: "Pedir NODO Custom",
    trialPlan: "PRO",
    trialNote: `Mientras lo armamos, probás Pro ${TRIAL_DAYS} días gratis.`,
  },
];

function price(n: number) {
  return `US$ ${n.toLocaleString("es-AR")}`;
}

function Cell({ value, strong }: { value: PlanCell; strong: boolean }) {
  if (value === true) return <Check className={`mx-auto h-4 w-4 ${strong ? "text-[var(--accent-2)]" : "text-[var(--fg-2)]"}`} aria-label="Incluido" />;
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-[#4a4e66]" aria-label="No incluido" />;
  return <span className={`text-sm ${strong ? "text-white" : "text-[var(--fg-2)]"}`}>{value}</span>;
}

export function Pricing() {
  const [open, setOpen] = useState(false);
  const order: TenantPlan[] = ["BASE", "PRO", "CUSTOM"];

  return (
    <section id="planes" className="nl-section nl-divider scroll-mt-16">
      <div className="nl-shell">
        <Reveal>
          <h2 className="nl-h2 max-w-3xl">Un precio fijo por comercio, sin límite de usuarios</h2>
          <p className="nl-lead mt-5">
            La diferencia entre planes es hasta dónde llega NODO: con Base preparás la compra, con Pro la hacés entera
            desde acá. Todos incluyen a tu equipo completo y arrancan con {TRIAL_DAYS} días gratis: al terminar la
            prueba elegís el plan para seguir.
          </p>
        </Reveal>

        <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-[1fr_1.18fr_1fr]">
          {CARDS.map((c, i) => {
            const def = PLAN_CATALOG[c.plan];
            const pro = c.plan === "PRO";
            return (
              <Reveal key={c.plan} delay={i * 90} className={pro ? "order-first lg:order-none lg:-my-4" : ""}>
                <article
                  className={`relative flex h-full flex-col rounded-[var(--r)] p-7 sm:p-8 ${
                    pro
                      ? "overflow-hidden border border-[rgb(139_127_255/0.6)] bg-[linear-gradient(180deg,#1d1a3f_0%,var(--surface)_55%)] shadow-[0_30px_80px_-30px_rgb(109_93_252/0.7)]"
                      : "border border-[var(--line)] bg-[var(--bg-2)]"
                  }`}
                >
                  {pro && <div className="nl-glow" style={{ width: 380, height: 260, top: -150, left: "50%", marginLeft: -190 }} aria-hidden />}
                  <div className="relative flex items-center justify-between gap-3">
                    <h3 className={`text-xl font-semibold ${pro ? "text-white" : "text-[var(--fg)]"}`}>{def.label}</h3>
                    {pro && <span className="nl-chip nl-chip--accent">Recomendado</span>}
                  </div>
                  <p className="relative mt-2 text-sm text-[var(--fg-2)]">{c.forWho}</p>
                  <p className="relative mt-7 flex items-baseline gap-2">
                    <span className={`font-bold tracking-tight tabular-nums text-white ${pro ? "text-5xl" : "text-4xl"}`}>
                      {price(def.monthlyPrice)}
                    </span>
                    <span className="text-sm text-[var(--fg-3)]">por mes</span>
                  </p>
                  <p className="relative mt-1 h-5 text-sm text-[var(--fg-3)]">
                    {def.setupFee ? `Más ${price(def.setupFee)} de puesta en marcha, una sola vez` : "Sin costo de alta"}
                  </p>

                  <a
                    href="#probar"
                    onClick={() => {
                      rememberTrialPlan(c.trialPlan);
                      window.dispatchEvent(new Event("nodo:trial-plan"));
                    }}
                    className={`nl-btn relative mt-7 w-full ${pro ? "nl-btn--primary" : "nl-btn--ghost"}`}
                  >
                    {c.cta}
                  </a>
                  <p className="relative mt-2.5 text-center text-xs text-[var(--fg-3)]">{c.trialNote}</p>

                  {c.intro && <p className="relative mt-8 text-sm font-semibold text-white">{c.intro}</p>}
                  <ul className={`relative flex flex-col gap-3 ${c.intro ? "mt-4" : "mt-8"}`}>
                    {c.items.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-[0.95rem] leading-snug">
                        <Check className={`mt-0.5 h-4 w-4 flex-shrink-0 ${pro ? "text-[var(--accent-2)]" : "text-[var(--fg-3)]"}`} aria-hidden />
                        <span className={pro ? "text-white" : "text-[var(--fg-2)]"}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            );
          })}
        </div>

        <div className="mt-12 flex justify-center">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="comparativa"
            className="nl-btn nl-btn--ghost"
          >
            {open ? "Ocultar la comparación" : "Comparar todas las funciones"}
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          </button>
        </div>

        {open && (
          <div id="comparativa" className="nl-anim-in mt-8 overflow-x-auto rounded-[var(--r)] border border-[var(--line)]">
            <table className="w-full min-w-[640px] text-left">
              <thead className="sticky top-0 bg-[var(--surface)]">
                <tr>
                  <th className="px-5 py-4 text-sm font-medium text-[var(--fg-3)]">Función</th>
                  {order.map((p) => (
                    <th
                      key={p}
                      className={`w-40 px-4 py-4 text-center text-sm font-semibold ${p === "PRO" ? "bg-[var(--accent-soft)] text-white" : "text-[var(--fg)]"}`}
                    >
                      {PLAN_CATALOG[p].shortLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PLAN_FEATURE_GROUPS.map((g) => (
                  <Fragment key={g.title}>
                    <tr>
                      <td colSpan={4} className="bg-[var(--bg-2)] px-5 pb-2 pt-6 text-sm font-semibold text-white">
                        {g.title}
                      </td>
                    </tr>
                    {g.rows.map((r) => (
                      <tr key={r.label} className="border-t border-[var(--line)]">
                        <td className="px-5 py-3.5 text-sm text-[var(--fg-2)]">{r.label}</td>
                        {order.map((p) => (
                          <td key={p} className={`px-4 py-3.5 text-center ${p === "PRO" ? "bg-[rgb(109_93_252/0.06)]" : ""}`}>
                            <Cell value={r.values[p]} strong={p === "PRO"} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-6 text-center text-sm text-[var(--fg-3)]">Precios en dólares, por comercio y por mes.</p>

        <SupplyPlans />
      </div>
    </section>
  );
}
