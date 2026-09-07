"use client";

import { useState } from "react";
import { Button, Chip, SectionHead, Shell } from "./ui";

type Plan = {
  n: string;
  name: string;
  who: string;
  items: string[];
  featured?: boolean;
};

const RETAIL: Plan[] = [
  {
    n: "01",
    name: "Mostrador",
    who: "Un local, una persona comprando",
    items: [
      "Búsqueda unificada sobre tus distribuidores",
      "Comparación con el costo puesto",
      "Carga de listas por planilla",
      "1 usuario",
    ],
  },
  {
    n: "02",
    name: "Local",
    who: "Un local con equipo",
    featured: true,
    items: [
      "Todo lo de Mostrador",
      "Compra online donde el distribuidor la permite",
      "Historial de pedidos, cuenta corriente y facturas",
      "Pedido armado por un empleado y aprobado por el dueño",
      "Chat con los vendedores",
    ],
  },
  {
    n: "03",
    name: "Cadena",
    who: "Varias sucursales",
    items: [
      "Todo lo de Local",
      "Varios locales y depósitos",
      "Permisos por rol y por sucursal",
      "Comparación y reportes entre sucursales",
    ],
  },
];

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

export default function Pricing() {
  const [tab, setTab] = useState<"retail" | "supply">("retail");
  const plans = tab === "retail" ? RETAIL : SUPPLY;

  return (
    <section id="planes" className="relative py-24 sm:py-36">
      <Shell>
        <SectionHead
          title={<>Planes</>}
          meta="05 · Precios"
          lead="Los planes están definidos en su alcance, no en su precio. Preferimos publicarlos cuando el número sea el definitivo antes que poner uno que después cambie."
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

        <div className={`grid gap-5 ${tab === "retail" ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          {plans.map((p) => (
            <div
              key={`${tab}-${p.name}`}
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
                <span
                  className="lnd-draft lnd-mono text-[0.72rem] px-2.5 py-1.5 rounded-[3px] tracking-[0.14em] uppercase"
                >
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
                  {tab === "retail" ? "Crear mi cuenta" : "Coordinar el alta"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Shell>
    </section>
  );
}
