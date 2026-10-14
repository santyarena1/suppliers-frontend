"use client";

import { Fragment, useState } from "react";
import { Check, ChevronDown, Minus } from "lucide-react";
import { PLAN_CATALOG, PLAN_FEATURE_GROUPS, TENANT_PLANS, type PlanCell, type TenantPlan } from "@/lib/plans";
import { Reveal } from "./Reveal";
import { SupplyPlans } from "./SupplyPlans";
import { LaunchPromo } from "./LaunchPromo";
import { CatalogApiPitch } from "./CatalogApiPitch";
import { rememberTrialPlan, TRIAL_DAYS, type TrialPlan } from "@/lib/trial-plan";
import { NODO_WHATSAPP_LABEL, whatsappUrl } from "@/lib/contact";

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

const CUSTOM_WHATSAPP_TEXT = "Hola, quiero consultar por NODO Custom (desarrollo a medida).";

const CARDS: CardCopy[] = [
  {
    plan: "PRO",
    forWho: "Para comprar desde NODO sin entrar a ningún portal.",
    items: [
      "Todos tus distribuidores conectados y en búsqueda a la vez",
      "Precio final con impuestos y stock",
      "Carrito con varios distribuidores",
      "Pedidos directos en el portal de cada distribuidor integrado",
      "Tus formas de pago y percepciones de cada uno",
      "Cuenta corriente, saldos y facturas",
      "Chat con tus vendedores",
      "Modo vendedor: márgenes de venta y presupuestos para tus clientes",
      "Análisis de compras por mes, distribuidor y producto",
      "Aprobación de pedidos con el precio del día",
      "API de catálogo para tu tienda, ERP, Google y Meta",
    ],
    cta: `Probar Pro ${TRIAL_DAYS} días gratis`,
    trialPlan: "PRO",
    trialNote: `${TRIAL_DAYS} días gratis. Después elegís tu plan.`,
  },
  {
    plan: "CUSTOM",
    forWho: "Desarrollo a medida para empresas con sistemas y procesos propios.",
    intro: "Todo lo de Pro, y además:",
    items: [
      "Creación de agentes",
      "Automatización de compras",
      "Análisis del mercado diario",
      "Integración con tu ERP o CRM",
      "Módulos y flujos para tu operación",
      "NODO con la identidad de tu empresa",
    ],
    cta: "Consultar por WhatsApp",
    trialPlan: "PRO",
    trialNote: `Consultanos por el desarrollo a medida al ${NODO_WHATSAPP_LABEL}.`,
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
  const order = TENANT_PLANS;

  return (
    <section id="planes" className="nl-section nl-divider scroll-mt-16">
      <div className="nl-shell">
        <Reveal>
          <h2 className="nl-h2 max-w-3xl">Un precio fijo por comercio, sin límite de usuarios</h2>
          <p className="nl-lead mt-5">
            Con Pro hacés la compra entera desde NODO, con la API de catálogo incluida. Si tu empresa necesita más,
            Custom es un desarrollo a medida. Todos incluyen a tu equipo completo y Pro arranca con {TRIAL_DAYS} días
            gratis.
          </p>
        </Reveal>

        <div className="mx-auto mt-14 grid max-w-5xl items-stretch gap-5 lg:grid-cols-[1.12fr_1fr]">
          {CARDS.map((c, i) => {
            const def = PLAN_CATALOG[c.plan];
            const pro = c.plan === "PRO";
            return (
              <Reveal key={c.plan} delay={i * 90} className={pro ? "lg:-my-4" : ""}>
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
                    {def.priceFrom && <span className="text-sm text-[var(--fg-3)]">desde</span>}
                    <span className={`font-bold tracking-tight tabular-nums text-white ${pro ? "text-5xl" : "text-4xl"}`}>
                      {price(def.monthlyPrice)}
                    </span>
                    <span className="text-sm text-[var(--fg-3)]">por mes, IVA incluido</span>
                  </p>
                  <p className="relative mt-1 h-5 text-sm text-[var(--fg-3)]">
                    {def.setupFee ? `Más ${price(def.setupFee)} de puesta en marcha, una sola vez` : def.priceFrom ? "Según el desarrollo que necesites" : "Sin costo de alta"}
                  </p>
                  {pro && <LaunchPromo monthlyPrice={def.monthlyPrice} />}

                  <a
                    href={c.plan === "CUSTOM" ? whatsappUrl(CUSTOM_WHATSAPP_TEXT) : "#probar"}
                    {...(c.plan === "CUSTOM" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    onClick={() => {
                      if (c.plan === "CUSTOM") return;
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

        <CatalogApiPitch />

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
                      <td colSpan={order.length + 1} className="bg-[var(--bg-2)] px-5 pb-2 pt-6 text-sm font-semibold text-white">
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
        <p className="mt-6 text-center text-sm text-[var(--fg-3)]">Precios en dólares, por comercio y por mes. Todos incluyen IVA.</p>

        <SupplyPlans />
      </div>
    </section>
  );
}
