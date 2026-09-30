"use client";

import { Fragment, useState } from "react";
import { Button, Chip, SectionHead, Shell } from "./ui";
import {
  PLAN_CARDS,
  PLAN_CATALOG,
  PLAN_FEATURE_GROUPS,
  formatUsd,
  type PlanCell,
  type TenantPlan,
} from "@/lib/plans";

type Plan = {
  n: string;
  name: string;
  who: string;
  items: string[];
  featured?: boolean;
};

const SUPPLY: Plan[] = [
  {
    n: "01",
    name: "Canal",
    who: "Distribuidores",
    featured: true,
    items: [
      "Catálogo sincronizado hacia tus comercios",
      "Cartera de clientes con vendedor asignado",
      "Códigos de acceso",
      "Pedidos con historial por comercio",
    ],
  },
  {
    n: "02",
    name: "Marca",
    who: "Marcas y representantes",
    items: [
      "Mapa de SKUs por distribuidor y precio en el canal",
      "Semáforo contra tu precio sugerido",
      "Materiales, capacitaciones y acciones",
      "Cuentas para tu equipo",
    ],
  },
];

const DIFF = [
  {
    plan: "BASE" as TenantPlan,
    axis: "Preparás la compra",
    line: "Buscás, comparás y armás el pedido. Lo enviás vos al vendedor.",
  },
  {
    plan: "PRO" as TenantPlan,
    axis: "Operás desde NODO",
    line: "Checkout al portal, cuenta corriente, chat y analytics integrados.",
  },
  {
    plan: "CUSTOM" as TenantPlan,
    axis: "NODO a tu medida",
    line: "Integraciones ERP/CRM, módulos propios e identidad adaptada.",
  },
];

export default function Pricing() {
  const [tab, setTab] = useState<"retail" | "supply">("retail");

  return (
    <section id="planes" className="relative py-24 sm:py-36">
      <Shell>
        <SectionHead
          title={<>Planes</>}
          meta="05 · Precios"
          lead="La diferencia no es un cupo de búsquedas: es hasta dónde llega la integración. Base centraliza y prepara. Pro opera contra el portal. Custom adapta NODO a tu empresa."
        />

        <div
          className="inline-flex items-center gap-1 p-1 rounded-md mb-10"
          style={{ border: "1px solid var(--hair)", background: "rgb(11 13 26 / 0.6)" }}
          role="tablist"
          aria-label="Tipo de cuenta"
        >
          {[
            { id: "retail" as const, label: "Comercios" },
            { id: "supply" as const, label: "Distribuidores y marcas" },
          ].map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="lnd-label px-4 py-2 rounded transition-colors duration-200"
              style={{
                background: tab === t.id ? "var(--night)" : "transparent",
                color: tab === t.id ? "var(--ember)" : "var(--fg-faint)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "retail" ? (
          <RetailPlans />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {SUPPLY.map((p) => (
              <div
                key={p.name}
                className={`lnd-panel p-6 sm:p-7 flex flex-col${p.featured ? " lnd-panel--active" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="lnd-display lnd-display--md">{p.name}</h3>
                    <p className="lnd-note mt-2">{p.who}</p>
                  </div>
                  <span className="lnd-mono text-[0.7rem]" style={{ color: "var(--fg-faint)" }}>
                    {p.n}
                  </span>
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <span className="lnd-draft lnd-mono text-[0.72rem] px-2.5 py-1.5 rounded-[3px] tracking-[0.14em] uppercase">
                    Precio a definir
                  </span>
                  {p.featured && <Chip tone="ember">Recomendado</Chip>}
                </div>

                <ul className="mt-7 space-y-3 flex-1">
                  {p.items.map((it) => (
                    <li key={it} className="flex items-start gap-3 text-[0.85rem] text-[var(--fg-dim)]">
                      <span
                        className="mt-[0.45rem] w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: p.featured ? "var(--ember)" : "var(--lilac)" }}
                        aria-hidden="true"
                      />
                      <span className="leading-relaxed">{it}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <Button href="#cuenta" variant={p.featured ? "primary" : "ghost"}>
                    Coordinar el alta
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Shell>
    </section>
  );
}

const RETAIL_ORDER: TenantPlan[] = ["BASE", "PRO", "CUSTOM"];

function RetailPlans() {
  const [showAll, setShowAll] = useState(false);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3 mb-8">
        {DIFF.map((d) => (
          <div
            key={d.plan}
            className="rounded-md px-4 py-3"
            style={{
              border: "1px solid var(--hair)",
              background: d.plan === "PRO" ? "rgb(255 106 61 / 0.08)" : "rgb(11 13 26 / 0.45)",
            }}
          >
            <div className="lnd-label" style={{ color: d.plan === "PRO" ? "var(--ember)" : "var(--fg-faint)" }}>
              {PLAN_CATALOG[d.plan].shortLabel}
            </div>
            <div className="mt-1.5 text-[0.9rem] text-[var(--fg)]">{d.axis}</div>
            <p className="lnd-note mt-1.5 leading-relaxed">{d.line}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {PLAN_CARDS.map((card, i) => {
          const def = PLAN_CATALOG[card.plan];
          const featured = !!card.highlight;
          return (
            <div
              key={card.plan}
              className={`lnd-panel p-6 sm:p-7 flex flex-col${featured ? " lnd-panel--active" : ""}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="lnd-display lnd-display--md">{def.label}</h3>
                  <p className="lnd-note mt-2">{def.tagline}</p>
                </div>
                <span className="lnd-mono text-[0.7rem]" style={{ color: "var(--fg-faint)" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>

              <div className="mt-6 flex flex-wrap items-end gap-3">
                <span className="lnd-display lnd-display--md">{formatUsd(def.monthlyPrice)}</span>
                <span className="lnd-note pb-1">/ mes</span>
                {card.highlight && <Chip tone="ember">{card.highlight}</Chip>}
              </div>
              {card.footnote && (
                <p className="lnd-mono text-[0.7rem] mt-2" style={{ color: "var(--fg-faint)" }}>
                  {card.footnote}
                </p>
              )}

              <ul className="mt-7 space-y-3 flex-1">
                {card.bullets.map((it) => (
                  <li key={it} className="flex items-start gap-3 text-[0.85rem] text-[var(--fg-dim)]">
                    <span
                      className="mt-[0.45rem] w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: featured ? "var(--ember)" : "var(--lilac)" }}
                      aria-hidden="true"
                    />
                    <span className="leading-relaxed">{it}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <Button href="#cuenta" variant={featured ? "primary" : "ghost"}>
                  {card.cta}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="lnd-features-toggle"
        >
          {showAll ? "Ocultar comparador de funciones" : "Ver todas las funciones · Base vs Pro vs Custom"}
        </button>
        <p className="lnd-note text-center max-w-md">
          Tabla completa: qué incluye cada plan, sin límites artificiales de búsquedas ni pedidos.
        </p>
      </div>

      {showAll && (
        <div className="mt-6 overflow-x-auto lnd-panel p-0">
          <table className="w-full min-w-[560px] text-left text-[0.85rem]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--hair)" }}>
                <th className="px-4 py-3 lnd-label" style={{ color: "var(--fg-faint)" }}>
                  Funciones
                </th>
                {RETAIL_ORDER.map((plan) => (
                  <th
                    key={plan}
                    className="px-3 py-3 text-center lnd-label"
                    style={{ color: plan === "PRO" ? "var(--ember)" : "var(--fg-dim)" }}
                  >
                    {PLAN_CATALOG[plan].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLAN_FEATURE_GROUPS.map((group) => (
                <Fragment key={group.title}>
                  <tr>
                    <td colSpan={4} className="px-4 pt-5 pb-1 lnd-label" style={{ color: "var(--fg-faint)" }}>
                      {group.title}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.label} style={{ borderBottom: "1px solid var(--hair)" }}>
                      <td className="px-4 py-2.5 text-[var(--fg-dim)]">{row.label}</td>
                      {RETAIL_ORDER.map((plan) => (
                        <td key={plan} className="px-3 py-2.5 text-center">
                          <ComparisonCell value={row.values[plan]} />
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
    </>
  );
}

function ComparisonCell({ value }: { value: PlanCell }) {
  if (value === true) {
    return (
      <span style={{ color: "var(--ember)" }} aria-label="Incluido">
        ●
      </span>
    );
  }
  if (value === false) {
    return (
      <span style={{ color: "var(--fg-faint)" }} aria-label="No incluido">
        —
      </span>
    );
  }
  return <span className="text-[0.8rem] text-[var(--fg-dim)]">{value}</span>;
}
