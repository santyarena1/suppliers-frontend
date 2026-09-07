"use client";

import { Button, SectionHead, Shell } from "./ui";

const PATHS = [
  {
    who: "Distribuidores",
    lead: "Tu catálogo llega actualizado al mostrador de los comercios que te compran, y los pedidos entran ya cargados.",
    items: [
      "Catálogo sincronizado, sin mandar la lista por WhatsApp cada semana",
      "Cartera de clientes con el vendedor asignado a cada uno",
      "Códigos de acceso para sumar comercios cuando vos quieras",
      "Pedidos que llegan armados, con el historial de cada comercio",
      "Espacio de publicidad dentro del buscador",
    ],
  },
  {
    who: "Marcas",
    lead: "Dejás de preguntar por teléfono dónde está tu producto y a cuánto se está vendiendo en el canal.",
    items: [
      "Mapa de qué distribuidores tienen cada SKU tuyo y a qué precio",
      "Semáforo contra tu precio sugerido",
      "Materiales y capacitaciones publicados para el canal",
      "Acciones y avisos hacia los comercios",
      "Cuentas para tu equipo, con permisos propios",
    ],
  },
];

export default function Audiences() {
  return (
    <section className="relative py-24 sm:py-36">
      <Shell>
        <SectionHead
          title={<>Del otro<br />lado del mostrador</>}
          meta="También"
          lead="NODO no es solo para el que compra. Del otro lado están los que venden, y cada uno entra con su propio espacio."
          size="md"
        />

        <div className="grid md:grid-cols-2 gap-6">
          {PATHS.map((p) => (
            <div key={p.who} className="lnd-panel p-6 sm:p-8 flex flex-col">
              <h3 className="lnd-display lnd-display--md">{p.who}</h3>
              <p className="lnd-body mt-4 text-[0.9rem]">{p.lead}</p>

              <ul className="mt-6 space-y-3 flex-1">
                {p.items.map((it) => (
                  <li key={it} className="flex items-start gap-3 text-[0.85rem] text-[var(--fg-dim)]">
                    <span
                      className="mt-[0.45rem] w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: "var(--lilac)" }}
                      aria-hidden="true"
                    />
                    <span className="leading-relaxed">{it}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <Button href="#cuenta" variant="ghost">
                  Coordinar el alta
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Shell>
    </section>
  );
}
